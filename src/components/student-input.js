/**
 * 学生回答专用输入组件
 * 支持多份答卷，每份答卷可独立选择文字/图片输入
 */

import { readFileAsDataURL } from '../utils/helpers.js';

/** 内部状态 */
let entries = [];
let nextIndex = 1;
let containerEl = null;

/**
 * 创建学生回答输入区域
 * @returns {HTMLElement}
 */
export function createStudentInput() {
  entries = [];
  nextIndex = 1;

  const wrapper = document.createElement('div');
  wrapper.className = 'student-input-wrapper';
  containerEl = wrapper;

  // 答卷列表容器
  const listEl = document.createElement('div');
  listEl.className = 'student-entries';
  listEl.id = 'student-entries';
  wrapper.appendChild(listEl);

  // 添加答卷按钮
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--secondary btn--sm';
  addBtn.style.marginTop = 'var(--space-3)';
  addBtn.innerHTML = '＋ 添加答卷';
  addBtn.addEventListener('click', () => addEntry(listEl));
  wrapper.appendChild(addBtn);

  // 初始添加一份答卷
  addEntry(listEl);

  return wrapper;
}

/**
 * 添加一份新答卷
 */
function addEntry(listEl) {
  const index = nextIndex++;
  const entryId = `student-${index}`;
  const entry = { id: entryId, index, mode: 'text', images: [] };
  entries.push(entry);

  const entryEl = document.createElement('div');
  entryEl.className = 'student-entry';
  entryEl.dataset.entryId = entryId;
  entryEl.style.cssText = 'border:1px solid var(--color-border-light); border-radius:var(--radius-lg); padding:var(--space-4); margin-bottom:var(--space-3); position:relative;';

  const canDelete = entries.length > 1;

  entryEl.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-3);">
      <span style="font-size:var(--text-sm); font-weight:var(--weight-semibold); color:var(--color-text-secondary);">
        📋 答卷${index}
      </span>
      ${canDelete ? `<button class="btn btn--ghost btn--sm entry-delete" data-entry-id="${entryId}" title="删除此答卷">✕</button>` : ''}
    </div>
    <div class="tabs" style="margin-bottom:var(--space-3);">
      <button class="tabs__item tabs__item--active" data-tab="text" data-entry-id="${entryId}">文字输入</button>
      <button class="tabs__item" data-tab="image" data-entry-id="${entryId}">图片上传</button>
    </div>
    <div id="${entryId}-text-panel">
      <textarea class="form-input form-textarea" id="${entryId}-textarea" placeholder="粘贴该生作答内容..." style="min-height:80px;"></textarea>
    </div>
    <div id="${entryId}-image-panel" style="display:none;">
      <div class="upload-zone" id="${entryId}-upload-zone" style="padding:var(--space-6) var(--space-4);">
        <div class="upload-zone__icon">📷</div>
        <div class="upload-zone__text">拖拽图片到此处，或点击选择</div>
      </div>
      <input type="file" id="${entryId}-file-input" accept="image/*" multiple style="display:none;" />
      <div class="image-grid" id="${entryId}-image-grid"></div>
    </div>
  `;

  listEl.appendChild(entryEl);
  bindEntryEvents(entryEl, entry);
  updateDeleteButtons(listEl);
}

/**
 * 绑定单个答卷的事件
 */
function bindEntryEvents(entryEl, entry) {
  const id = entry.id;

  // Tab 切换
  entryEl.querySelectorAll('.tabs__item').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabType = tab.dataset.tab;
      entryEl.querySelectorAll('.tabs__item').forEach(t => t.classList.remove('tabs__item--active'));
      tab.classList.add('tabs__item--active');
      entry.mode = tabType;
      entryEl.querySelector(`#${id}-text-panel`).style.display = tabType === 'text' ? '' : 'none';
      entryEl.querySelector(`#${id}-image-panel`).style.display = tabType === 'image' ? '' : 'none';
    });
  });

  // 上传区域
  const uploadZone = entryEl.querySelector(`#${id}-upload-zone`);
  const fileInput = entryEl.querySelector(`#${id}-file-input`);
  const imageGrid = entryEl.querySelector(`#${id}-image-grid`);

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('upload-zone--dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('upload-zone--dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('upload-zone--dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) { entry.images.push(...files); renderGrid(entry, imageGrid); }
  });

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    if (files.length) { entry.images.push(...files); renderGrid(entry, imageGrid); }
    fileInput.value = '';
  });

  imageGrid.addEventListener('click', e => {
    const rmBtn = e.target.closest('.image-grid__remove');
    if (!rmBtn) return;
    const idx = parseInt(rmBtn.dataset.index, 10);
    entry.images.splice(idx, 1);
    renderGrid(entry, imageGrid);
  });

  // 删除答卷
  const deleteBtn = entryEl.querySelector('.entry-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      entries = entries.filter(e => e.id !== id);
      entryEl.remove();
      updateDeleteButtons(entryEl.parentElement || document.getElementById('student-entries'));
    });
  }
}

/**
 * 更新删除按钮可见性（只剩1份时不可删除）
 */
function updateDeleteButtons(listEl) {
  if (!listEl) return;
  const entryEls = listEl.querySelectorAll('.student-entry');
  entryEls.forEach(el => {
    const btn = el.querySelector('.entry-delete');
    if (entries.length <= 1) {
      if (btn) btn.style.display = 'none';
    } else {
      // 如果没有删除按钮，需要添加
      if (!btn) {
        const entryId = el.dataset.entryId;
        const header = el.querySelector('div');
        const newBtn = document.createElement('button');
        newBtn.className = 'btn btn--ghost btn--sm entry-delete';
        newBtn.dataset.entryId = entryId;
        newBtn.title = '删除此答卷';
        newBtn.textContent = '✕';
        newBtn.addEventListener('click', () => {
          entries = entries.filter(e => e.id !== entryId);
          el.remove();
          updateDeleteButtons(listEl);
        });
        header.appendChild(newBtn);
      } else {
        btn.style.display = '';
      }
    }
  });
}

/**
 * 渲染图片缩略图网格
 */
async function renderGrid(entry, gridEl) {
  gridEl.innerHTML = '';
  for (let i = 0; i < entry.images.length; i++) {
    const file = entry.images[i];
    const item = document.createElement('div');
    item.className = 'image-grid__item';
    try {
      const url = await readFileAsDataURL(file);
      item.innerHTML = `<img class="image-grid__img" src="${url}" alt="${file.name}">`;
    } catch {
      item.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:var(--text-xs);">预览失败</div>';
    }
    const rmBtn = document.createElement('button');
    rmBtn.className = 'image-grid__remove';
    rmBtn.dataset.index = i;
    rmBtn.textContent = '×';
    item.appendChild(rmBtn);
    gridEl.appendChild(item);
  }
}

/**
 * 获取所有答卷数据
 * @returns {Array<{ mode: 'text'|'image', text: string, images: File[] }>}
 */
export function getStudentInputData() {
  return entries.map(entry => {
    const textarea = document.querySelector(`#${entry.id}-textarea`);
    return {
      mode: entry.mode,
      text: textarea ? textarea.value.trim() : '',
      images: [...entry.images],
    };
  });
}

/**
 * 清空所有答卷，重置为1份空答卷
 */
export function clearStudentInput() {
  entries = [];
  nextIndex = 1;
  if (containerEl) {
    const listEl = containerEl.querySelector('#student-entries');
    if (listEl) {
      listEl.innerHTML = '';
      addEntry(listEl);
    }
  }
}
