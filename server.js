/**
 * 后端 API 代理服务器
 * 持有 API Key，转发前端请求到百炼和 OpenRouter
 * 生产模式下同时提供静态文件服务
 */

import express from 'express';
import { readFileSync, existsSync } from 'fs';
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
// API 路由（必须在静态文件之前）
// ==========================================

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

// ---- AI 分析接口 ----
app.post('/api/analyze', async (req, res) => {
  if (!OPENROUTER_KEY) {
    return res.status(500).json({ error: '服务端未配置 OpenRouter API Key' });
  }

  try {
    const { model, messages, temperature } = req.body;
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
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
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
