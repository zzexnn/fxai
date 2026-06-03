/**
 * OCR 识别结果预览/编辑模态框
 * 用户可在此修正识别错误后确认
 */

import { Modal } from './modal.js';

/**
 * 显示 OCR 预览模态框
 * @param {Array<{ label: string, text: string }>} ocrResults - OCR 识别结果
 * @returns {Promise<Array<{ label: string, text: string }>|null>} 确认后的结果，取消返回 null
 */
export function showOcrPreview(ocrResults) {
  // 构建内容
  const contentEl = document.createElement('div');

  ocrResults.forEach((item, index) => {
    const preview = document.createElement('div');
    preview.className = 'ocr-preview';

    preview.innerHTML = `
      <div class="ocr-preview__label">
        <span style="color:var(--color-primary-light);">🔍</span>
        ${item.label}
      </div>
      <textarea class="ocr-preview__text" data-ocr-index="${index}">${item.text}</textarea>
    `;

    contentEl.appendChild(preview);
  });

  return Modal.show({
    title: '📝 OCR 识别结果确认',
    content: contentEl,
    confirmText: '确认使用',
    cancelText: '取消',
  }).then(confirmed => {
    if (!confirmed) return null;

    // 读取修改后的值
    const textareas = contentEl.querySelectorAll('.ocr-preview__text');
    return ocrResults.map((item, index) => ({
      label: item.label,
      text: textareas[index] ? textareas[index].value.trim() : item.text,
      field: item.field,
    }));
  });
}
