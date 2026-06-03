/**
 * OCR 图片识别服务
 * 通过后端代理调用百炼 qwen3-vl API
 */

import { readFileAsDataURL } from '../utils/helpers.js';

const OCR_ENDPOINT = '/api/ocr';

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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OCR 请求失败: ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

/**
 * 对多张图片批量 OCR（并行调用）
 * @param {File[]} files - 图片文件数组
 * @returns {Promise<string[]>} 每张图片识别的文字数组
 */
export async function recognizeImages(files) {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const dataURL = await readFileAsDataURL(file);
      return ocrSingleImage(dataURL);
    })
  );

  return results.map((r) =>
    r.status === 'fulfilled' ? r.value : '[识别失败]'
  );
}

/**
 * 测试 OCR 服务连接
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testOcrConnection() {
  try {
    const res = await fetch('/api/test/ocr');
    return await res.json();
  } catch (err) {
    return { success: false, message: `连接错误: ${err.message}` };
  }
}
