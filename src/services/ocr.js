/**
 * OCR 图片识别服务
 * 通过后端代理调用百炼 qwen3-vl API
 */

import { readFileAsDataURL, compressImage } from '../utils/helpers.js';

const OCR_ENDPOINT = `${import.meta.env.BASE_URL}api/ocr`.replace(/\/+$/, '');

function formatApiError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.code) return `${error.code}${error.param ? ` (${error.param})` : ''}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * 对单张图片进行 OCR 识别
 * @param {string} dataURL - 图片的 dataURL
 * @returns {Promise<string>} 识别出的文字
 */
async function ocrSingleImage(dataURL) {
  const res = await fetch(OCR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataURL } },
          { type: 'text', text: '请逐字识别图片中的所有手写或印刷文字内容，保持原始排版格式。无法辨认的字标记为【无法辨认】。' },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let errMsg = `OCR 请求失败: ${res.status}`;
    try {
      const errJson = JSON.parse(errBody);
      errMsg = formatApiError(errJson.error) || errJson.message || errMsg;
    } catch {
      if (errBody) errMsg += ` - ${errBody.slice(0, 200)}`;
    }
    throw new Error(errMsg);
  }

  const data = await res.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('OCR 返回数据格式异常');
  }

  return data.choices[0].message.content;
}

/**
 * 对多张图片批量 OCR（并行调用）
 * 发送前自动压缩图片到 2MB 以内
 * @param {File[]} files - 图片文件数组
 * @returns {Promise<string[]>} 每张图片识别的文字数组，失败的包含错误信息
 */
export async function recognizeImages(files) {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      // 先压缩图片，减少传输体积
      const compressed = await compressImage(file, 2);
      const dataURL = await readFileAsDataURL(compressed);
      return ocrSingleImage(dataURL);
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`图片 ${i + 1} OCR 失败:`, r.reason);
    return `[识别失败: ${r.reason?.message || '未知错误'}]`;
  });
}

/**
 * 测试 OCR 服务连接
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testOcrConnection() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/test/ocr`.replace(/\/+$/, ''));
    return await res.json();
  } catch (err) {
    return { success: false, message: `连接错误: ${err.message}` };
  }
}
