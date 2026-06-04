/**
 * 前端图片自动识别与裁剪组件
 * 提供基于白底黑字边缘检测的自动裁剪框，并允许用户手动拖拽调整
 */

// 动态注入裁剪组件所需的 CSS 样式
const styles = `
  .cropper-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: inherit;
  }
  .cropper-content {
    background: var(--color-bg, #ffffff);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-5, 20px);
    max-width: 90%;
    max-height: 90%;
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
    width: 640px;
    box-shadow: var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1));
    border: 1px solid var(--color-border-light, #e2e8f0);
    box-sizing: border-box;
  }
  .cropper-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border-light, #e2e8f0);
    padding-bottom: var(--space-3, 12px);
  }
  .cropper-title {
    margin: 0;
    font-size: var(--text-lg, 18px);
    font-weight: var(--weight-bold, 700);
    color: var(--color-text, #1e293b);
  }
  .cropper-close {
    background: none;
    border: none;
    font-size: var(--text-xl, 20px);
    cursor: pointer;
    color: var(--color-text-muted, #94a3b8);
    transition: color 0.2s;
  }
  .cropper-close:hover {
    color: var(--color-text, #1e293b);
  }
  .cropper-description {
    font-size: var(--text-xs, 12px);
    color: var(--color-text-secondary, #64748b);
    margin: 0;
    line-height: 1.5;
  }
  .cropper-workspace {
    position: relative;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #0f172a;
    border-radius: var(--radius-md, 8px);
    max-height: 50vh;
    min-height: 200px;
    box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.06);
  }
  .cropper-img {
    max-width: 100%;
    max-height: 50vh;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
  }
  .cropper-box {
    position: absolute;
    border: 2px solid #10b981;
    box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.65);
    cursor: move;
    box-sizing: border-box;
    touch-action: none;
  }
  .cropper-handle {
    position: absolute;
    right: -8px;
    bottom: -8px;
    width: 16px;
    height: 16px;
    background: #10b981;
    border: 2px solid #ffffff;
    border-radius: 50%;
    cursor: se-resize;
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.2);
    touch-action: none;
  }
  .cropper-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3, 12px);
    border-top: 1px solid var(--color-border-light, #e2e8f0);
    padding-top: var(--space-4, 16px);
  }
`;

let cssInjected = false;
function injectStyles() {
  if (cssInjected) return;
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
  cssInjected = true;
}

/**
 * 读取图片并分析像素投影来识别白底黑字文档中的“核心文字内容边界” (Bounding Box)
 * @param {HTMLImageElement} img
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function detectTextBounds(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // 为了提升检测速度，缩小尺寸进行边界分析
  const maxScanSize = 400;
  let scanW = img.naturalWidth;
  let scanH = img.naturalHeight;
  if (scanW > maxScanSize || scanH > maxScanSize) {
    if (scanW > scanH) {
      scanH = Math.round((scanH * maxScanSize) / scanW);
      scanW = maxScanSize;
    } else {
      scanW = Math.round((scanW * maxScanSize) / scanH);
      scanH = maxScanSize;
    }
  }

  canvas.width = scanW;
  canvas.height = scanH;
  ctx.drawImage(img, 0, 0, scanW, scanH);

  try {
    const imgData = ctx.getImageData(0, 0, scanW, scanH);
    const data = imgData.data;

    // 1. 计算全局平均亮度，支持自适应二值化
    let totalLuminance = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalLuminance += (r * 0.299 + g * 0.587 + b * 0.114);
    }
    const avgLuminance = totalLuminance / (scanW * scanH);
    // 阈值设置为比平均亮度更暗的值以过滤白底背景
    const threshold = Math.min(140, avgLuminance * 0.82);

    let minX = scanW;
    let maxX = 0;
    let minY = scanH;
    let maxY = 0;

    // 2. 检索暗色像素（即文字块）的最小包围盒
    for (let y = 0; y < scanH; y++) {
      for (let x = 0; x < scanW; x++) {
        const idx = (y * scanW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const v = r * 0.299 + g * 0.587 + b * 0.114;

        if (v < threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 3. 判断是否检测到有效的文字包围盒，未检测到则兜底截取中央 80% 区域
    if (minX >= maxX || minY >= maxY) {
      return {
        x: Math.round(img.naturalWidth * 0.1),
        y: Math.round(img.naturalHeight * 0.1),
        width: Math.round(img.naturalWidth * 0.8),
        height: Math.round(img.naturalHeight * 0.8)
      };
    }

    // 映射回原图物理像素宽高，并加入些许 Padding
    const scale = img.naturalWidth / scanW;
    const padding = 15;
    const padMinX = Math.max(0, minX - padding);
    const padMinY = Math.max(0, minY - padding);
    const padMaxX = Math.min(scanW, maxX + padding);
    const padMaxY = Math.min(scanH, maxY + padding);

    return {
      x: Math.round(padMinX * scale),
      y: Math.round(padMinY * scale),
      width: Math.round((padMaxX - padMinX) * scale),
      height: Math.round((padMaxY - padMinY) * scale)
    };
  } catch (e) {
    console.error('[Cropper] 自动识别出错，启用默认截取框:', e);
    return {
      x: Math.round(img.naturalWidth * 0.1),
      y: Math.round(img.naturalHeight * 0.1),
      width: Math.round(img.naturalWidth * 0.8),
      height: Math.round(img.naturalHeight * 0.8)
    };
  }
}

/**
 * 启动图片自动裁剪与确认流程
 * @param {File} file - 原始图片文件
 * @returns {Promise<File>} 裁剪后的图片文件（若点击不裁剪则返回原文件）
 */
export function cropImage(file) {
  injectStyles();

  return new Promise((resolve) => {
    // 1. 将 File 读取为 Image
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        // 2. 执行自动文字区域检测
        const autoBox = detectTextBounds(img);
        
        // 3. 展现 Modal
        showCropperModal(file, img, autoBox, resolve);
      };
    };
    reader.onerror = () => {
      resolve(file); // 失败则兜底使用原文件
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 显示裁剪微调弹窗
 */
function showCropperModal(originalFile, img, initialBox, resolve) {
  const modal = document.createElement('div');
  modal.className = 'cropper-modal';

  modal.innerHTML = `
    <div class="cropper-content">
      <div class="cropper-header">
        <h3 class="cropper-title">📸 智能内容裁剪</h3>
        <button class="cropper-close" id="cropper-close">✕</button>
      </div>
      <p class="cropper-description">
        已自动识别文字主体（绿框内）。若内容不全或有杂边，请整体拖拽框体，或按住右下角手柄进行微调。
      </p>
      
      <div class="cropper-workspace" id="cropper-workspace">
        <img class="cropper-img" id="cropper-img" src="${img.src}" />
        <div class="cropper-box" id="cropper-box">
          <div class="cropper-handle" id="cropper-handle"></div>
        </div>
      </div>
      
      <div class="cropper-footer">
        <button class="btn btn--secondary" id="cropper-cancel" style="padding:var(--space-2) var(--space-4);">直接用原图</button>
        <button class="btn btn--accent" id="cropper-confirm" style="padding:var(--space-2) var(--space-4);">裁剪并保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cropperImg = modal.querySelector('#cropper-img');
  const cropperBox = modal.querySelector('#cropper-box');
  const cropperHandle = modal.querySelector('#cropper-handle');
  const workspace = modal.querySelector('#cropper-workspace');

  let activeBox = { ...initialBox }; // 物理像素单位的裁剪区域
  
  // 图片加载并渲染在容器中后，计算在屏幕上的实际布局大小
  cropperImg.onload = () => {
    initCropperPosition();
  };
  
  // 如果由于缓存图片已经渲染完毕，直接调用初始化
  if (cropperImg.complete) {
    initCropperPosition();
  }

  function initCropperPosition() {
    const renderedW = cropperImg.clientWidth;
    const renderedH = cropperImg.clientHeight;
    const scale = renderedW / img.naturalWidth;

    // 应用初始框样式到 DOM 节点上
    updateDOMBox(scale);
    setupInteraction(scale);
  }

  function updateDOMBox(scale) {
    cropperBox.style.left = `${activeBox.x * scale}px`;
    cropperBox.style.top = `${activeBox.y * scale}px`;
    cropperBox.style.width = `${activeBox.width * scale}px`;
    cropperBox.style.height = `${activeBox.height * scale}px`;
  }

  function setupInteraction(initialScale) {
    let scale = initialScale;
    
    // 随窗口缩放动态重新计算比例
    const resizeObserver = new ResizeObserver(() => {
      const renderedW = cropperImg.clientWidth;
      if (renderedW > 0) {
        scale = renderedW / img.naturalWidth;
        updateDOMBox(scale);
      }
    });
    resizeObserver.observe(cropperImg);

    let isMoving = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;

    // 监听 Pointer 事件以同时完美适配手机 Touch 与电脑 Mouse
    cropperBox.addEventListener('pointerdown', (e) => {
      if (e.target === cropperHandle) return; // 交给 handle 处理
      e.preventDefault();
      
      isMoving = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = activeBox.x;
      startTop = activeBox.y;
      
      cropperBox.setPointerCapture(e.pointerId);
    });

    cropperHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = activeBox.width;
      startHeight = activeBox.height;
      
      cropperHandle.setPointerCapture(e.pointerId);
    });

    const handlePointerMove = (e) => {
      if (isMoving) {
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;
        
        let newX = startLeft + dx;
        let newY = startTop + dy;

        // 边界保护
        newX = Math.max(0, Math.min(img.naturalWidth - activeBox.width, newX));
        newY = Math.max(0, Math.min(img.naturalHeight - activeBox.height, newY));

        activeBox.x = newX;
        activeBox.y = newY;
        updateDOMBox(scale);
      } else if (isResizing) {
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        let newW = startWidth + dx;
        let newH = startHeight + dy;

        // 限制最小尺寸为 40 物理像素
        newW = Math.max(40, Math.min(img.naturalWidth - activeBox.x, newW));
        newH = Math.max(40, Math.min(img.naturalHeight - activeBox.y, newH));

        activeBox.width = newW;
        activeBox.height = newH;
        updateDOMBox(scale);
      }
    };

    const handlePointerUp = (e) => {
      if (isMoving) {
        isMoving = false;
        cropperBox.releasePointerCapture(e.pointerId);
      }
      if (isResizing) {
        isResizing = false;
        cropperHandle.releasePointerCapture(e.pointerId);
      }
    };

    cropperBox.addEventListener('pointermove', handlePointerMove);
    cropperBox.addEventListener('pointerup', handlePointerUp);
    cropperHandle.addEventListener('pointermove', handlePointerMove);
    cropperHandle.addEventListener('pointerup', handlePointerUp);
  }

  // 关闭销毁逻辑
  function destroy(resultFile) {
    modal.remove();
    resolve(resultFile);
  }

  // 点击事件绑定
  modal.querySelector('#cropper-close').addEventListener('click', () => destroy(originalFile));
  modal.querySelector('#cropper-cancel').addEventListener('click', () => destroy(originalFile));
  
  modal.querySelector('#cropper-confirm').addEventListener('click', () => {
    // 4. 执行 Canvas 裁剪图片
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 对坐标取整，避免次像素插值模糊
    const clipX = Math.round(activeBox.x);
    const clipY = Math.round(activeBox.y);
    const clipW = Math.round(activeBox.width);
    const clipH = Math.round(activeBox.height);

    canvas.width = clipW;
    canvas.height = clipH;

    ctx.drawImage(img, clipX, clipY, clipW, clipH, 0, 0, clipW, clipH);

    canvas.toBlob((blob) => {
      if (blob) {
        const croppedFile = new File([blob], originalFile.name, {
          type: originalFile.type,
          lastModified: Date.now()
        });
        destroy(croppedFile);
      } else {
        destroy(originalFile); // 转换失败兜底使用原图
      }
    }, originalFile.type, 0.92); // 保持 92% 高清晰度
  });
}
