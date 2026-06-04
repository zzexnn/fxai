/**
 * 通用输入卡片组件
 * 支持文字输入和图片上传两种模式
 * 图片上传支持拖拽、点击选择、缩略图预览
 */

import { readFileAsDataURL } from '../utils/helpers.js';

/** 每个卡片的状态：id → { mode, images } */
const cardStates = new Map();

/**
 * 创建输入卡片
 * @param {object} options
 * @param {string} options.id - 唯一标识
 * @param {string} options.title - 标题
 * @param {string} options.icon - 图标 emoji
 * @param {boolean} options.required - 是否必填
 * @param {string} options.placeholder - 输入提示文字
 * @returns {HTMLElement} 卡片元素
 */
export function createInputCard({ id, title, icon, required = false, placeholder = '' }) {
  // 初始化状态
  cardStates.set(id, { mode: 'text', images: [] });

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.cardId = id;

  const badgeClass = required ? 'card__badge card__badge--required' : 'card__badge card__badge--optional';
  const badgeText = required ? '必填' : '选填';

  card.innerHTML = `
    <div class="card__header">
      <div class="card__title">
        <span class="card__title-icon">${icon}</span>${title}
      </div>
      <span class="${badgeClass}">${badgeText}</span>
    </div>
    <div class="card__body">
      <div class="tabs">
        <button class="tabs__item tabs__item--active" data-tab="text">文字输入</button>
        <button class="tabs__item" data-tab="image">图片上传</button>
      </div>
      <div id="${id}-text-panel">
        <textarea class="form-input form-textarea" id="${id}-textarea" placeholder="${placeholder}"></textarea>
      </div>
      <div id="${id}-image-panel" style="display:none;">
        <div style="display:flex; gap:var(--space-3); margin-bottom:var(--space-3);">
          <div class="upload-zone" id="${id}-upload-zone" style="flex:1; padding:var(--space-4) var(--space-2);">
            <div class="upload-zone__icon">🖼️</div>
            <div class="upload-zone__text" style="font-size:var(--text-xs); margin-top:var(--space-1);">选择相册照片</div>
          </div>
          <div class="upload-zone" id="${id}-camera-zone" style="flex:1; padding:var(--space-4) var(--space-2);">
            <div class="upload-zone__icon">📷</div>
            <div class="upload-zone__text" style="font-size:var(--text-xs); margin-top:var(--space-1);">直接拍照上传</div>
          </div>
        </div>
        <input type="file" id="${id}-file-input" accept="image/*" multiple style="display:none;" />
        <input type="file" id="${id}-camera-input" accept="image/*" capture="environment" style="display:none;" />
        <div class="image-grid" id="${id}-image-grid"></div>
      </div>
    </div>
  `;

  // 获取 DOM 引用
  const tabs = card.querySelectorAll('.tabs__item');
  const textPanel = card.querySelector(`#${id}-text-panel`);
  const imagePanel = card.querySelector(`#${id}-image-panel`);
  const uploadZone = card.querySelector(`#${id}-upload-zone`);
  const cameraZone = card.querySelector(`#${id}-camera-zone`);
  const fileInput = card.querySelector(`#${id}-file-input`);
  const cameraInput = card.querySelector(`#${id}-camera-input`);
  const imageGrid = card.querySelector(`#${id}-image-grid`);

  // Tab 切换
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabType = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove('tabs__item--active'));
      tab.classList.add('tabs__item--active');

      const state = cardStates.get(id);
      state.mode = tabType;

      if (tabType === 'text') {
        textPanel.style.display = '';
        imagePanel.style.display = 'none';
      } else {
        textPanel.style.display = 'none';
        imagePanel.style.display = '';
      }
    });
  });

  // 点击上传区域触发文件选择 / 拍照选择
  uploadZone.addEventListener('click', () => fileInput.click());
  cameraZone.addEventListener('click', () => cameraInput.click());

  // 拖拽上传
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('upload-zone--dragover');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('upload-zone--dragover');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('upload-zone--dragover');
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) addImages(id, files, imageGrid);
  });

  // 文件选择
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    if (files.length > 0) addImages(id, files, imageGrid);
    fileInput.value = '';
  });

  // 拍照选择
  cameraInput.addEventListener('change', () => {
    const files = Array.from(cameraInput.files);
    if (files.length > 0) addImages(id, files, imageGrid);
    cameraInput.value = '';
  });

  // 图片网格事件委托（删除按钮）
  imageGrid.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.image-grid__remove');
    if (!removeBtn) return;
    const index = parseInt(removeBtn.dataset.index, 10);
    removeImage(id, index, imageGrid);
  });

  return card;
}

/**
 * 添加图片到卡片状态并刷新网格
 * @param {string} id - 卡片 ID
 * @param {File[]} files - 图片文件数组
 * @param {HTMLElement} gridEl - 图片网格元素
 */
async function addImages(id, files, gridEl) {
  const state = cardStates.get(id);
  state.images.push(...files);
  await renderImageGrid(id, gridEl);
}

/**
 * 移除指定位置的图片并刷新网格
 * @param {string} id - 卡片 ID
 * @param {number} index - 图片索引
 * @param {HTMLElement} gridEl - 图片网格元素
 */
async function removeImage(id, index, gridEl) {
  const state = cardStates.get(id);
  state.images.splice(index, 1);
  await renderImageGrid(id, gridEl);
}

/**
 * 渲染图片缩略图网格
 * @param {string} id - 卡片 ID
 * @param {HTMLElement} gridEl - 图片网格元素
 */
async function renderImageGrid(id, gridEl) {
  const state = cardStates.get(id);
  gridEl.innerHTML = '';

  for (let i = 0; i < state.images.length; i++) {
    const file = state.images[i];
    const item = document.createElement('div');
    item.className = 'image-grid__item';

    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = document.createElement('img');
      img.className = 'image-grid__img';
      img.src = dataUrl;
      img.alt = file.name;
      item.appendChild(img);
    } catch {
      const fallback = document.createElement('div');
      fallback.textContent = '预览失败';
      item.appendChild(fallback);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-grid__remove';
    removeBtn.dataset.index = i;
    removeBtn.textContent = '×';
    item.appendChild(removeBtn);

    gridEl.appendChild(item);
  }
}

/**
 * 获取卡片的输入数据
 * @param {string} id - 卡片 ID
 * @returns {{ mode: 'text'|'image', text: string, images: File[] }}
 */
export function getInputCardData(id) {
  const state = cardStates.get(id);
  if (!state) return { mode: 'text', text: '', images: [] };

  const textarea = document.querySelector(`#${id}-textarea`);
  return {
    mode: state.mode,
    text: textarea ? textarea.value.trim() : '',
    images: [...state.images],
  };
}

/**
 * 清空卡片内容，重置为文字模式
 * @param {string} id - 卡片 ID
 */
export function clearInputCard(id) {
  const state = cardStates.get(id);
  if (!state) return;

  // 重置状态
  state.mode = 'text';
  state.images = [];

  // 清空 textarea
  const textarea = document.querySelector(`#${id}-textarea`);
  if (textarea) textarea.value = '';

  // 清空图片网格
  const grid = document.querySelector(`#${id}-image-grid`);
  if (grid) grid.innerHTML = '';

  // 切回文字模式 Tab
  const card = document.querySelector(`[data-card-id="${id}"]`);
  if (card) {
    const tabs = card.querySelectorAll('.tabs__item');
    tabs.forEach((t) => {
      t.classList.toggle('tabs__item--active', t.dataset.tab === 'text');
    });
    const textPanel = card.querySelector(`#${id}-text-panel`);
    const imagePanel = card.querySelector(`#${id}-image-panel`);
    if (textPanel) textPanel.style.display = '';
    if (imagePanel) imagePanel.style.display = 'none';
  }
}
