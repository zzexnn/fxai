/**
 * 历史记录页面
 * 按时间倒序展示过往分析记录，支持查看、导出、删除
 */

import { getHistory, getHistoryById, deleteHistory, clearHistory } from '../services/storage.js';
import { renderResults } from '../components/result-view.js';
import { exportAsPrint, exportAsJSON } from '../utils/export.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { formatDateTime, truncate, escapeHtml } from '../utils/helpers.js';

/**
 * 渲染历史记录页面
 * @param {HTMLElement} container
 */
export function renderHistoryPage(container) {
  container.innerHTML = '';

  const history = getHistory();

  // 页面头部
  const header = document.createElement('div');
  header.className = 'history-header';
  header.innerHTML = `
    <h2>分析记录</h2>
    ${history.length > 0
      ? '<button class="btn btn--danger btn--sm" id="clear-all-btn">清空全部</button>'
      : ''
    }
  `;
  container.appendChild(header);

  // 列表或空状态
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state__icon">📋</div>
      <div class="empty-state__title">暂无分析记录</div>
      <div class="empty-state__desc">完成分析后将自动保存在这里</div>
    `;
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'history-list';

  history.forEach(record => {
    const item = createHistoryItem(record);
    list.appendChild(item);
  });

  container.appendChild(list);

  // 事件委托
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('history-view')) {
      handleView(id);
    } else if (btn.classList.contains('history-export')) {
      handleExport(id);
    } else if (btn.classList.contains('history-delete')) {
      await handleDelete(id, container);
    }
  });

  // 清空全部
  const clearBtn = header.querySelector('#clear-all-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const confirmed = await Modal.show({
        title: '确认清空',
        content: '确定要清空所有分析记录吗？此操作不可撤销。',
        confirmText: '清空',
        cancelText: '取消',
      });
      if (confirmed) {
        clearHistory();
        renderHistoryPage(container);
        Toast.show('已清空所有记录', 'success');
      }
    });
  }
}

/**
 * 创建单条历史记录项
 */
function createHistoryItem(record) {
  const item = document.createElement('div');
  item.className = 'history-item';
  item.dataset.id = record.id;

  const isDeep = record.mode === 'deep';
  const iconClass = isDeep ? 'history-item__icon--deep' : 'history-item__icon--standard';
  const iconEmoji = isDeep ? '✨' : '⚡';
  const modeText = isDeep ? '深度分析' : '标准分析';
  const questionCount = Array.isArray(record.questions) ? record.questions.length : 0;
  const questionPreview = questionCount > 1
    ? `批量分析 ${questionCount} 题`
    : truncate(record.inputs?.question || '(无题目)', 40);
  const typeText = questionCount > 1 ? '多题批量' : (record.questionType || '未知题型');
  const time = formatDateTime(new Date(record.timestamp));

  item.innerHTML = `
    <div class="history-item__icon ${iconClass}">${iconEmoji}</div>
    <div class="history-item__content">
      <div class="history-item__title">${escapeHtml(questionPreview)}</div>
      <div class="history-item__meta">
        <span>${escapeHtml(typeText)}</span>
        <span>${modeText}</span>
        <span>${time}</span>
      </div>
    </div>
    <div class="history-item__actions">
      <button class="btn btn--ghost btn--sm history-view" data-id="${record.id}" title="查看详情">👁</button>
      <button class="btn btn--ghost btn--sm history-export" data-id="${record.id}" title="打印导出">🖨️</button>
      <button class="btn btn--ghost btn--sm history-delete" data-id="${record.id}" title="删除">🗑️</button>
    </div>
  `;

  return item;
}

/**
 * 查看详情
 */
function handleView(id) {
  const record = getHistoryById(id);
  if (!record) {
    Toast.show('记录不存在', 'error');
    return;
  }

  const contentEl = document.createElement('div');
  contentEl.style.cssText = 'max-height:60vh; overflow-y:auto;';
  renderResults(contentEl, record);

  Modal.show({
    title: '📊 诊断详情',
    content: contentEl,
    confirmText: '关闭',
    showCancel: false,
  });
}

/**
 * 导出
 */
function handleExport(id) {
  const record = getHistoryById(id);
  if (!record) {
    Toast.show('记录不存在', 'error');
    return;
  }
  exportAsPrint(record);
}

/**
 * 删除
 */
async function handleDelete(id, container) {
  const confirmed = await Modal.show({
    title: '确认删除',
    content: '确定要删除这条分析记录吗？',
    confirmText: '删除',
    cancelText: '取消',
  });

  if (confirmed) {
    deleteHistory(id);
    renderHistoryPage(container);
    Toast.show('已删除', 'success');
  }
}
