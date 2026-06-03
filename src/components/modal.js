/**
 * 通用模态框组件
 * 支持自定义标题、内容、按钮文案
 * 点击遮罩层或按 ESC 可关闭
 */

/** 当前活跃的模态框元素 */
let currentBackdrop = null;
/** 当前的 ESC 监听器 */
let currentEscHandler = null;

export const Modal = {
  /**
   * 显示模态框
   * @param {object} options
   * @param {string} options.title - 标题
   * @param {string|HTMLElement} options.content - 内容（HTML 字符串或 DOM 元素）
   * @param {string} options.confirmText - 确认按钮文字
   * @param {string} options.cancelText - 取消按钮文字
   * @param {Function} options.onConfirm - 确认回调
   * @param {Function} options.onCancel - 取消回调
   * @param {boolean} options.showCancel - 是否显示取消按钮
   * @returns {Promise<boolean>} 确认返回 true，取消返回 false
   */
  show({
    title = '',
    content = '',
    confirmText = '确认',
    cancelText = '取消',
    onConfirm,
    onCancel,
    showCancel = true,
  } = {}) {
    // 先关闭已有的模态框
    Modal.close();

    return new Promise((resolve) => {
      // 创建遮罩层
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';

      // 创建模态框主体
      const modal = document.createElement('div');
      modal.className = 'modal animate-fade-in';

      // 头部
      const header = document.createElement('div');
      header.className = 'modal__header';

      const titleEl = document.createElement('h3');
      titleEl.className = 'modal__title';
      titleEl.textContent = title;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal__close';
      closeBtn.textContent = '×';

      header.appendChild(titleEl);
      header.appendChild(closeBtn);

      // 内容区
      const body = document.createElement('div');
      body.className = 'modal__body';
      if (typeof content === 'string') {
        body.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        body.appendChild(content);
      }

      // 底部按钮区
      const footer = document.createElement('div');
      footer.className = 'modal__footer';

      if (showCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn--secondary';
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener('click', () => handleClose(false));
        footer.appendChild(cancelBtn);
      }

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn--primary';
      confirmBtn.textContent = confirmText;
      confirmBtn.addEventListener('click', () => handleClose(true));
      footer.appendChild(confirmBtn);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      currentBackdrop = backdrop;

      /** 关闭处理 */
      function handleClose(confirmed) {
        Modal.close();
        if (confirmed && onConfirm) onConfirm();
        if (!confirmed && onCancel) onCancel();
        resolve(confirmed);
      }

      // 点击遮罩层关闭
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) handleClose(false);
      });

      // 关闭按钮
      closeBtn.addEventListener('click', () => handleClose(false));

      // ESC 键关闭
      currentEscHandler = (e) => {
        if (e.key === 'Escape') handleClose(false);
      };
      document.addEventListener('keydown', currentEscHandler);
    });
  },

  /** 关闭当前模态框 */
  close() {
    if (currentBackdrop && currentBackdrop.parentNode) {
      currentBackdrop.parentNode.removeChild(currentBackdrop);
    }
    currentBackdrop = null;
    if (currentEscHandler) {
      document.removeEventListener('keydown', currentEscHandler);
      currentEscHandler = null;
    }
  },
};
