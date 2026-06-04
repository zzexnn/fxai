/**
 * 后端 API 代理服务器
 * 持有 API Key，转发前端请求到百炼和 OpenRouter
 * 生产模式下同时提供静态文件服务
 */

import express from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3001;
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// ==========================================
// 监测与安全策略
// ==========================================

const TELEMETRY_FILE = resolve(__dirname, 'telemetry.json');
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

// ---- 前端埋点数据接收接口 ----
app.post('/api/telemetry', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const logEntry = {
    ip: clientIp,
    ...req.body,
  };
  writeTelemetryLog(logEntry);
  res.json({ success: true });
});

// ---- OCR 接口 ----
app.post('/api/ocr', async (req, res) => {
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

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error('OCR 代理错误:', err);
    res.status(500).json({ error: `OCR 请求失败: ${err.message}` });
  }
});

// ---- AI 分析接口 (带指纹拦截与性能监控) ----
app.post('/api/analyze', async (req, res) => {
  if (!OPENROUTER_KEY) {
    return res.status(500).json({ error: '服务端未配置 OpenRouter API Key' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { model, messages, temperature, fingerprint } = req.body;

  // 使用上传的指纹，若无则使用 IP 作为兜底限额 Key
  const fp = fingerprint || clientIp;
  const mode = model.includes('claude') ? 'deep' : 'standard';

  // 1. 服务端配额拦截
  const allowed = checkAndRecordUsage(fp, mode);
  if (!allowed) {
    return res.status(429).json({
      error: `今日分析次数已用完（本设备每日标准限额 ${LIMITS.standard} 次，深度限额 ${LIMITS.deep} 次）`
    });
  }

  const startTime = Date.now();

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'X-Title': 'ReadingDiagnosis',
      },
      body: JSON.stringify({ model, messages, temperature }),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      writeTelemetryLog({
        timestamp: new Date().toISOString(),
        type: 'api_performance',
        fingerprint: fp,
        ip: clientIp,
        api: '/api/analyze',
        duration_ms: duration,
        status: 'failed',
        error: data.error?.message || 'API 请求失败',
        model
      });
      return res.status(response.status).json(data);
    }

    // 统计输入字符数
    const charCount = messages.map(m => m.content || '').join('').length;

    // 记录使用性能日志
    writeTelemetryLog({
      timestamp: new Date().toISOString(),
      type: 'api_performance',
      fingerprint: fp,
      ip: clientIp,
      api: '/api/analyze',
      duration_ms: duration,
      status: 'success',
      model,
      char_count: charCount
    });

    res.json(data);
  } catch (err) {
    const duration = Date.now() - startTime;
    writeTelemetryLog({
      timestamp: new Date().toISOString(),
      type: 'api_performance',
      fingerprint: fp,
      ip: clientIp,
      api: '/api/analyze',
      duration_ms: duration,
      status: 'failed',
      error: err.message,
      model
    });
    console.error('分析代理错误:', err);
    res.status(500).json({ error: `分析请求失败: ${err.message}` });
  }
});

// ---- 连接测试接口 ----
app.get('/api/test/ocr', async (_req, res) => {
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

app.get('/api/test/analyzer', async (_req, res) => {
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
