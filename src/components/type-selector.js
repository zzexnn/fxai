/**
 * 题型选择/确认组件
 * 支持自动识别 + 手动选择
 */

import { getAllTypeNames } from '../data/question-types.js';
import { matchQuestionType } from '../utils/type-matcher.js';

let currentMatch = null;
let manualSelection = 'auto';
let hintEl = null;

/**
 * 创建题型选择器
 * @returns {HTMLElement}
 */
export function createTypeSelector() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; gap:var(--space-2);';

  const typeNames = getAllTypeNames();

  wrapper.innerHTML = `
    <label class="form-label">题型识别</label>
    <div style="display:flex; align-items:center; gap:var(--space-3);">
      <select class="form-input" id="type-select" style="flex:1;">
        <option value="auto">自动识别</option>
        ${typeNames.map(name => `<option value="${name}">${name}</option>`).join('')}
      </select>
      <span id="type-hint" style="font-size:var(--text-xs); color:var(--color-text-muted); white-space:nowrap;"></span>
    </div>
  `;

  const select = wrapper.querySelector('#type-select');
  hintEl = wrapper.querySelector('#type-hint');

  select.addEventListener('change', () => {
    manualSelection = select.value;
    if (manualSelection !== 'auto') {
      hintEl.innerHTML = `<span class="badge badge--info">手动选择</span>`;
    } else if (currentMatch) {
      showMatchHint();
    } else {
      hintEl.textContent = '';
    }
  });

  return wrapper;
}

/**
 * 根据题目文本更新自动匹配结果
 * @param {string} questionText
 */
export function updateTypeDetection(questionText) {
  if (!questionText || !questionText.trim()) {
    currentMatch = null;
    if (hintEl && manualSelection === 'auto') {
      hintEl.textContent = '';
    }
    return;
  }

  currentMatch = matchQuestionType(questionText);

  if (manualSelection === 'auto') {
    showMatchHint();
  }
}

/**
 * 显示匹配提示
 */
function showMatchHint() {
  if (!hintEl || !currentMatch) return;

  const { type, confidence } = currentMatch;

  if (!type) {
    hintEl.innerHTML = `<span class="badge badge--neutral">未匹配到题型</span>`;
    return;
  }

  const confMap = {
    high: { cls: 'badge--success', text: '高' },
    medium: { cls: 'badge--warning', text: '中' },
    low: { cls: 'badge--danger', text: '低' },
  };
  const conf = confMap[confidence] || confMap.low;

  hintEl.innerHTML = `
    <span class="badge badge--info">${type}</span>
    <span class="badge ${conf.cls}" style="margin-left:4px;">置信度: ${conf.text}</span>
  `;
}

/**
 * 获取当前选择的题型
 * @returns {string} 题型名或 'auto'
 */
export function getSelectedType() {
  return manualSelection;
}

/**
 * 获取最终确定的题型名
 * @returns {string|null}
 */
export function getResolvedType() {
  if (manualSelection !== 'auto') {
    return manualSelection;
  }
  return currentMatch ? currentMatch.type : null;
}
