/**
 * 全局 Toast 通知组件
 * 在页面右上角显示短暂的消息提示
 */

/** 类型对应的图标映射 */
const ICONS = {
  success: '✓',
  warning: '⚠',
  error: '✕',
  info: 'ℹ',
};

/**
 * 获取或创建 toast 容器
 * @returns {HTMLElement}
 */
function getContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export const Toast = {
  /**
   * 显示一条 toast 消息
   * @param {string} message - 消息内容
   * @param {'success'|'warning'|'error'|'info'} type - 消息类型
   */
  show(message, type = 'info') {
    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type} animate-fade-in`;

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = ICONS[type] || ICONS.info;

    const text = document.createTextNode(message);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast__close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => removeToast(toast));

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    // 3秒后自动移除
    const timer = setTimeout(() => removeToast(toast), 3000);
    // 手动关闭时取消定时器
    toast._timer = timer;
  },
};

/**
 * 移除 toast 元素（带淡出效果）
 * @param {HTMLElement} toast
 */
function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  clearTimeout(toast._timer);
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(100%)';
  toast.style.transition = 'opacity 0.3s, transform 0.3s';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}
