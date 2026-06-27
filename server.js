/**
 * 后端 API 代理服务器
 * 持有 API Key，转发前端请求到百炼和 OpenRouter
 * 生产模式下同时提供静态文件服务
 */

import express from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取 .env 文件
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) {
    console.warn('⚠️  未找到 .env 文件，请复制 .env.example 为 .env 并填入 API Key');
    return;
  }
  const content = readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
}

loadEnv();

const app = express();
app.use(express.json({ limit: '50mb' }));

// 允许跨域（开发时 Vite 在不同端口）
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3001;
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const ANALYZE_TIMEOUT_MS = 55_000;

function formatApiError(error, fallback = 'API 请求失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.code) return `${error.code}${error.param ? ` (${error.param})` : ''}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 500) };
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
}

function sanitizeUserAgent(value = '') {
  return String(value).slice(0, 300);
}

function createToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(key, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function createEmptyAuthStore() {
  return {
    users: [],
    sessions: [],
    loginEvents: [],
    accountRequests: [],
  };
}

function readAuthStore() {
  try {
    if (!existsSync(AUTH_STORE_FILE)) return createEmptyAuthStore();
    const content = readFileSync(AUTH_STORE_FILE, 'utf-8').trim();
    if (!content) return createEmptyAuthStore();
    const store = JSON.parse(content);
    return {
      users: Array.isArray(store.users) ? store.users : [],
      sessions: Array.isArray(store.sessions) ? store.sessions : [],
      loginEvents: Array.isArray(store.loginEvents) ? store.loginEvents : [],
      accountRequests: Array.isArray(store.accountRequests) ? store.accountRequests : [],
    };
  } catch (err) {
    console.error('[Auth] 读取鉴权数据失败:', err);
    return createEmptyAuthStore();
  }
}

function writeAuthStore(store) {
  const normalized = {
    users: store.users || [],
    sessions: (store.sessions || []).slice(-1000),
    loginEvents: (store.loginEvents || []).slice(-1000),
    accountRequests: (store.accountRequests || []).slice(-500),
  };
  writeFileSync(AUTH_STORE_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || 'user',
    active: user.active !== false,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || '',
  };
}

function publicSession(session) {
  return {
    id: session.id,
    userId: session.userId,
    username: session.username,
    loginAt: session.loginAt,
    lastSeenAt: session.lastSeenAt,
    ip: session.ip,
    userAgent: session.userAgent,
    active: session.active !== false,
  };
}

function publicAccountRequest(request) {
  return {
    id: request.id,
    username: request.username,
    organization: request.organization,
    reason: request.reason,
    status: request.status || 'pending',
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt || '',
    reviewedBy: request.reviewedBy || '',
    userId: request.userId || '',
    ip: request.ip || '',
    userAgent: request.userAgent || '',
  };
}

function validateUsername(username) {
  return /^[a-zA-Z0-9]{3,32}$/.test(username);
}

function ensureBootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USER || '';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!username || !password) return;

  const store = readAuthStore();
  const exists = store.users.some(user => user.username === username);
  if (exists) return;

  const user = {
    id: createToken(10),
    username,
    displayName: username,
    role: 'admin',
    active: true,
    passwordHash: hashPassword(password),
    createdAt: nowIso(),
    createdBy: 'bootstrap',
  };
  store.users.push(user);
  writeAuthStore(store);
  console.log(`   已创建启动管理员账号: ${username}`);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
}

function authenticate(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: '请先登录后再使用' });
  }

  const store = readAuthStore();
  const session = store.sessions.find(item => item.token === token && item.active !== false);
  if (!session) {
    return res.status(401).json({ error: '登录已失效，请重新登录' });
  }

  const user = store.users.find(item => item.id === session.userId && item.active !== false);
  if (!user) {
    session.active = false;
    session.logoutAt = nowIso();
    writeAuthStore(store);
    return res.status(401).json({ error: '账号不可用，请联系管理员' });
  }

  session.lastSeenAt = nowIso();
  session.ip = clientIp(req);
  writeAuthStore(store);

  req.auth = { user: publicUser(user), session: publicSession(session), token };
  next();
}

function verifyAdminPassword(req) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'fxai@admin';
  return req.headers['x-admin-password'] === adminPassword;
}

// ==========================================
// 监测与安全策略
// ==========================================

const TELEMETRY_FILE = resolve(__dirname, 'telemetry.json');
const AUTH_STORE_FILE = resolve(__dirname, 'auth-store.json');
const LIMITS = {
  deep: 3,
  standard: 10,
};

// 内存次数库：dateString -> fingerprint -> { deep, standard }
const fingerprintLimits = {};

/**
 * 校验并累计次数，防超限
 */
function checkAndRecordUsage(fp, mode) {
  const today = new Date().toISOString().split('T')[0];

  if (!fingerprintLimits[today]) {
    fingerprintLimits[today] = {};
  }
  if (!fingerprintLimits[today][fp]) {
    fingerprintLimits[today][fp] = { deep: 0, standard: 0 };
  }

  const limit = LIMITS[mode];
  const current = fingerprintLimits[today][fp][mode] || 0;

  if (current >= limit) {
    return false;
  }

  fingerprintLimits[today][fp][mode] = current + 1;
  return true;
}

/**
 * 将埋点日志安全写入本地 JSON 文件，限额 1000 条防硬盘爆满
 */
function writeTelemetryLog(log) {
  try {
    let logs = [];
    if (existsSync(TELEMETRY_FILE)) {
      const content = readFileSync(TELEMETRY_FILE, 'utf-8').trim();
      if (content) {
        logs = JSON.parse(content);
      }
    }
    logs.push(log);

    // 最大保留 1000 条，保护服务器空间
    if (logs.length > 1000) {
      logs = logs.slice(logs.length - 1000);
    }

    writeFileSync(TELEMETRY_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Telemetry] 写入日志失败:', err);
  }
}

// ==========================================
// API 路由
// ==========================================

ensureBootstrapAdmin();

// ---- 登录鉴权接口 ----
app.post('/api/auth/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const normalizedUsername = String(username).trim();
  const ip = clientIp(req);
  const userAgent = sanitizeUserAgent(req.headers['user-agent'] || '');
  const store = readAuthStore();
  const user = store.users.find(item => item.username === normalizedUsername);
  const eventBase = {
    id: createToken(8),
    username: normalizedUsername,
    ip,
    userAgent,
    timestamp: nowIso(),
  };

  if (!user || user.active === false || !verifyPassword(password, user.passwordHash)) {
    store.loginEvents.push({
      ...eventBase,
      status: 'failed',
      reason: !user ? 'user_not_found' : user.active === false ? 'inactive_user' : 'bad_password',
    });
    writeAuthStore(store);
    return res.status(401).json({ error: '账号或密码错误' });
  }

  const session = {
    id: createToken(10),
    token: createToken(36),
    userId: user.id,
    username: user.username,
    loginAt: eventBase.timestamp,
    lastSeenAt: eventBase.timestamp,
    ip,
    userAgent,
    active: true,
  };

  user.lastLoginAt = eventBase.timestamp;
  store.sessions.push(session);
  store.loginEvents.push({
    ...eventBase,
    userId: user.id,
    sessionId: session.id,
    status: 'success',
  });
  writeAuthStore(store);

  res.json({
    success: true,
    token: session.token,
    user: publicUser(user),
    session: publicSession(session),
  });
});

app.post('/api/auth/apply', (req, res) => {
  const {
    username = '',
    password = '',
    organization = '',
    reason = '',
  } = req.body || {};
  const normalizedUsername = String(username).trim();
  const normalizedOrganization = String(organization).trim();
  const normalizedReason = String(reason).trim();

  if (!validateUsername(normalizedUsername)) {
    return res.status(400).json({
      success: false,
      error: '账号需为 3-32 位，只能包含字母和数字',
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: '密码至少需要 6 位' });
  }

  if (normalizedOrganization.length < 2 || normalizedOrganization.length > 80) {
    return res.status(400).json({ success: false, error: '单位名称需为 2-80 个字符' });
  }

  if (normalizedReason.length < 4 || normalizedReason.length > 500) {
    return res.status(400).json({ success: false, error: '申请理由需为 4-500 个字符' });
  }

  const store = readAuthStore();
  if (store.users.some(user => user.username === normalizedUsername)) {
    return res.status(409).json({ success: false, error: '账号已存在，请更换账号名或直接登录' });
  }

  const existingPending = store.accountRequests.some(request =>
    request.username === normalizedUsername && request.status === 'pending'
  );
  if (existingPending) {
    return res.status(409).json({ success: false, error: '该账号名已有待审核申请，请等待管理员处理' });
  }

  const request = {
    id: createToken(10),
    username: normalizedUsername,
    organization: normalizedOrganization,
    reason: normalizedReason,
    passwordHash: hashPassword(password),
    status: 'pending',
    createdAt: nowIso(),
    ip: clientIp(req),
    userAgent: sanitizeUserAgent(req.headers['user-agent'] || ''),
  };
  store.accountRequests.push(request);
  writeAuthStore(store);

  res.status(201).json({
    success: true,
    request: publicAccountRequest(request),
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.auth.user,
    session: req.auth.session,
  });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  const store = readAuthStore();
  const session = store.sessions.find(item => item.token === req.auth.token);
  if (session) {
    session.active = false;
    session.logoutAt = nowIso();
    session.lastSeenAt = session.logoutAt;
    writeAuthStore(store);
  }
  res.json({ success: true });
});

// ---- 管理员账号管理接口 ----
app.get('/api/admin/users', (req, res) => {
  if (!verifyAdminPassword(req)) {
    return res.status(401).json({ success: false, error: '未授权：管理员密码错误' });
  }

  const store = readAuthStore();
  res.json({
    success: true,
    data: {
      users: store.users.map(publicUser),
      sessions: store.sessions.slice(-100).reverse().map(publicSession),
      loginEvents: store.loginEvents.slice(-100).reverse(),
      accountRequests: store.accountRequests.slice(-100).reverse().map(publicAccountRequest),
    },
  });
});

app.post('/api/admin/users', (req, res) => {
  if (!verifyAdminPassword(req)) {
    return res.status(401).json({ success: false, error: '未授权：管理员密码错误' });
  }

  const { username = '', password = '', displayName = '' } = req.body || {};
  const normalizedUsername = String(username).trim();
  const normalizedDisplayName = String(displayName || username).trim();

  if (!validateUsername(normalizedUsername)) {
    return res.status(400).json({
      success: false,
      error: '账号需为 3-32 位，只能包含字母和数字',
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: '密码至少需要 6 位' });
  }

  const store = readAuthStore();
  if (store.users.some(user => user.username === normalizedUsername)) {
    return res.status(409).json({ success: false, error: '账号已存在' });
  }

  const user = {
    id: createToken(10),
    username: normalizedUsername,
    displayName: normalizedDisplayName || normalizedUsername,
    role: 'user',
    active: true,
    passwordHash: hashPassword(password),
    createdAt: nowIso(),
    createdBy: 'admin',
  };
  store.users.push(user);
  writeAuthStore(store);

  res.status(201).json({ success: true, user: publicUser(user) });
});

app.post('/api/admin/account-requests/:id/approve', (req, res) => {
  if (!verifyAdminPassword(req)) {
    return res.status(401).json({ success: false, error: '未授权：管理员密码错误' });
  }

  const store = readAuthStore();
  const request = store.accountRequests.find(item => item.id === req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, error: '申请记录不存在' });
  }

  if (request.status !== 'pending') {
    return res.status(409).json({ success: false, error: '该申请已处理' });
  }

  if (store.users.some(user => user.username === request.username)) {
    request.status = 'rejected';
    request.reviewedAt = nowIso();
    request.reviewedBy = 'admin';
    request.reviewNote = '账号名已被占用';
    writeAuthStore(store);
    return res.status(409).json({ success: false, error: '账号名已被占用，申请已自动拒绝' });
  }

  const user = {
    id: createToken(10),
    username: request.username,
    displayName: request.username,
    organization: request.organization,
    role: 'user',
    active: true,
    passwordHash: request.passwordHash,
    createdAt: nowIso(),
    createdBy: 'account_request',
    accountRequestId: request.id,
  };
  store.users.push(user);
  request.status = 'approved';
  request.reviewedAt = nowIso();
  request.reviewedBy = 'admin';
  request.userId = user.id;
  writeAuthStore(store);

  res.json({
    success: true,
    user: publicUser(user),
    request: publicAccountRequest(request),
  });
});

app.post('/api/admin/account-requests/:id/reject', (req, res) => {
  if (!verifyAdminPassword(req)) {
    return res.status(401).json({ success: false, error: '未授权：管理员密码错误' });
  }

  const store = readAuthStore();
  const request = store.accountRequests.find(item => item.id === req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, error: '申请记录不存在' });
  }

  if (request.status !== 'pending') {
    return res.status(409).json({ success: false, error: '该申请已处理' });
  }

  request.status = 'rejected';
  request.reviewedAt = nowIso();
  request.reviewedBy = 'admin';
  writeAuthStore(store);

  res.json({
    success: true,
    request: publicAccountRequest(request),
  });
});

// ---- 前端埋点数据接收接口 ----
app.post('/api/telemetry', (req, res) => {
  const logEntry = {
    ip: clientIp(req),
    ...req.body,
  };
  writeTelemetryLog(logEntry);
  res.json({ success: true });
});

// ---- 获取埋点统计指标接口 ----
app.get('/api/telemetry/stats', (req, res) => {
  if (!verifyAdminPassword(req)) {
    return res.status(401).json({ success: false, error: '未授权：管理员密码错误' });
  }

  try {
    let logs = [];
    if (existsSync(TELEMETRY_FILE)) {
      const content = readFileSync(TELEMETRY_FILE, 'utf-8').trim();
      if (content) {
        logs = JSON.parse(content);
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 统计指标初始化
    let totalPV = 0;
    const totalDevices = new Set();
    let totalAnalyzeCount = 0;
    const totalAnalyzeDevices = new Set();

    let todayPV = 0;
    const todayDevices = new Set();
    let todayAnalyzeCount = 0;
    const todayAnalyzeDevices = new Set();

    logs.forEach(log => {
      // 提取日期 (YYYY-MM-DD)
      const logDateStr = log.timestamp ? log.timestamp.split('T')[0] : '';
      const fp = log.fingerprint || log.ip || 'unknown';
      const isToday = logDateStr === todayStr;

      // 累计统计
      if (log.type === 'pv') {
        totalPV++;
        totalDevices.add(fp);
      } else if (log.type === 'api_performance' && log.status === 'success') {
        totalAnalyzeCount++;
        totalAnalyzeDevices.add(fp);
      }

      // 今日统计
      if (isToday) {
        if (log.type === 'pv') {
          todayPV++;
          todayDevices.add(fp);
        } else if (log.type === 'api_performance' && log.status === 'success') {
          todayAnalyzeCount++;
          todayAnalyzeDevices.add(fp);
        }
      }
    });

    const authStore = readAuthStore();

    res.json({
      success: true,
      data: {
        today: {
          pv: todayPV,
          uv: todayDevices.size,
          analyzeCount: todayAnalyzeCount,
          analyzeUv: todayAnalyzeDevices.size
        },
        total: {
          pv: totalPV,
          uv: totalDevices.size,
          analyzeCount: totalAnalyzeCount,
          analyzeUv: totalAnalyzeDevices.size
        },
        recentLogs: logs.slice(-50).reverse(),
        auth: {
          users: authStore.users.map(publicUser),
          sessions: authStore.sessions.slice(-100).reverse().map(publicSession),
          loginEvents: authStore.loginEvents.slice(-100).reverse(),
          accountRequests: authStore.accountRequests.slice(-100).reverse().map(publicAccountRequest),
        },
      }
    });
  } catch (err) {
    console.error('获取统计数据失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- OCR 接口 ----
app.post('/api/ocr', authenticate, async (req, res) => {
  if (!DASHSCOPE_KEY) {
    return res.status(500).json({ error: '服务端未配置百炼 API Key' });
  }

  try {
    const { messages } = req.body;
    const response = await fetch(DASHSCOPE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen3-vl-235b-a22b-instruct',
        messages,
      }),
    });

    const data = await readJsonOrText(response);
    if (!response.ok) {
      return res.status(response.status).json({
        error: formatApiError(data.error || data.message, `OCR 请求失败: ${response.status}`),
      });
    }
    res.json(data);
  } catch (err) {
    console.error('OCR 代理错误:', err);
    res.status(500).json({ error: `OCR 请求失败: ${err.message}` });
  }
});

// ---- AI 分析接口 (带指纹拦截与性能监控) ----
app.post('/api/analyze', authenticate, async (req, res) => {
  if (!OPENROUTER_KEY) {
    return res.status(500).json({ error: '服务端未配置 OpenRouter API Key' });
  }

  const requestIp = clientIp(req);
  const { model, messages, temperature, fingerprint } = req.body;

  // 使用上传的指纹，若无则使用 IP 作为兜底限额 Key
  const fp = fingerprint || requestIp;
  const mode = model.includes('claude') ? 'deep' : 'standard';

  // 1. 服务端配额拦截
  const allowed = checkAndRecordUsage(fp, mode);
  if (!allowed) {
    return res.status(429).json({
      error: `今日分析次数已用完（本设备每日标准限额 ${LIMITS.standard} 次，深度限额 ${LIMITS.deep} 次）`
    });
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  const requestBody = { model, messages, temperature, max_tokens: 4000 };

  if (model.startsWith('deepseek/')) {
    requestBody.reasoning = {
      effort: 'none',
      exclude: true,
    };
  }

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'X-Title': 'ReadingDiagnosis',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const data = await readJsonOrText(response);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorMessage = formatApiError(data.error || data.message, `分析请求失败: ${response.status}`);
      writeTelemetryLog({
        timestamp: new Date().toISOString(),
        type: 'api_performance',
        fingerprint: fp,
        ip: requestIp,
        username: req.auth.user.username,
        api: '/api/analyze',
        duration_ms: duration,
        status: 'failed',
        error: errorMessage,
        model
      });
      return res.status(response.status).json({ error: errorMessage });
    }

    // 统计输入字符数
    const charCount = messages.map(m => m.content || '').join('').length;

    // 记录使用性能日志
    writeTelemetryLog({
      timestamp: new Date().toISOString(),
      type: 'api_performance',
      fingerprint: fp,
      ip: requestIp,
      username: req.auth.user.username,
      api: '/api/analyze',
      duration_ms: duration,
      status: 'success',
      model,
      char_count: charCount
    });

    res.json(data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';
    const errorMessage = isTimeout
      ? `分析请求超时（超过 ${Math.round(ANALYZE_TIMEOUT_MS / 1000)} 秒）。建议减少同题学生作答数量、压缩文章长度，或稍后重试。`
      : `分析请求失败: ${err.message}`;
    writeTelemetryLog({
      timestamp: new Date().toISOString(),
      type: 'api_performance',
      fingerprint: fp,
      ip: requestIp,
      username: req.auth.user.username,
      api: '/api/analyze',
      duration_ms: duration,
      status: 'failed',
      error: errorMessage,
      model
    });
    console.error('分析代理错误:', err);
    res.status(isTimeout ? 504 : 500).json({ error: errorMessage });
  } finally {
    clearTimeout(timeout);
  }
});

// ---- 连接测试接口 ----
app.get('/api/test/ocr', authenticate, async (_req, res) => {
  if (!DASHSCOPE_KEY) {
    return res.json({ success: false, message: '服务端未配置百炼 API Key' });
  }
  try {
    const response = await fetch(DASHSCOPE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen3-vl-235b-a22b-instruct',
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 5,
      }),
    });
    if (response.ok) {
      res.json({ success: true, message: '百炼 OCR 服务连接正常' });
    } else {
      const data = await response.json().catch(() => ({}));
      res.json({ success: false, message: `百炼连接失败: ${response.status} ${data.error?.message || ''}` });
    }
  } catch (err) {
    res.json({ success: false, message: `连接错误: ${err.message}` });
  }
});

app.get('/api/test/analyzer', authenticate, async (_req, res) => {
  if (!OPENROUTER_KEY) {
    return res.json({ success: false, message: '服务端未配置 OpenRouter API Key' });
  }
  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-pro',
        messages: [{ role: 'user', content: '回复OK' }],
        max_tokens: 5,
      }),
    });
    if (response.ok) {
      res.json({ success: true, message: 'OpenRouter 分析服务连接正常' });
    } else {
      const data = await response.json().catch(() => ({}));
      res.json({ success: false, message: `OpenRouter 连接失败: ${response.status} ${data.error?.message || ''}` });
    }
  } catch (err) {
    res.json({ success: false, message: `连接错误: ${err.message}` });
  }
});

// ==========================================
// 静态文件服务（API 路由之后）
// ==========================================
const distPath = resolve(__dirname, 'dist');

app.use(express.static(distPath));

// SPA fallback：非 API 的所有 GET 请求都返回 index.html（用正则兼容 Express 5）
app.get(/^(?!\/api\/).*$/, (req, res) => {
  res.sendFile(resolve(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ 服务启动于 http://localhost:${PORT}`);
  console.log(`   百炼 API Key: ${DASHSCOPE_KEY ? '已配置 ✓' : '未配置 ✗'}`);
  console.log(`   OpenRouter Key: ${OPENROUTER_KEY ? '已配置 ✓' : '未配置 ✗'}`);
});
