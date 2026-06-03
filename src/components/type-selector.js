/**
 * 题型选择/确认组件
 * 支持自动识别 + 手动选择
 */

import { getAllTypeNames } from '../data/question-types.js';
import { matchQuestionType } from '../utils/type-matcher.js';

let currentMatch = null;
let manualSelection = 'auto';
let hintEl = null;

const CATEGORIES = {
  '标题相关': [
    '理解标题的含义',
    '分析标题的作用',
    '分析标题的妙处',
    '拟写合适的标题'
  ],
  '情节与结构': [
    '概括文章内容',
    '梳理文章的线索',
    '梳理故事情节',
    '分析情节的作用',
    '记叙顺序及作用',
    '分析段落的作用'
  ],
  '词句赏析': [
    '理解词语的含义',
    '赏析词语的表达效果',
    '理解句子的含义',
    '分析句子的作用',
    '赏析句子的表达效果',
    '仿写句子'
  ],
  '人物与环境': [
    '概括或分析人物形象',
    '分析环境描写的作用',
    '分析人称的作用'
  ],
  '主旨与情感': [
    '理解并分析文章主旨'
  ]
};

/**
 * 创建题型选择器
 * @returns {HTMLElement}
 */
export function createTypeSelector() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; gap:var(--space-2);';

  const typeNames = getAllTypeNames();
  const definedPoints = Object.values(CATEGORIES).flat();
  const extraPoints = typeNames.filter(name => !definedPoints.includes(name));

  // 拼接下拉菜单 options
  let optionsHtml = '<option value="auto">自动识别</option>';
  for (const [catName, points] of Object.entries(CATEGORIES)) {
    // 过滤出当前分类中实际存在于 readskills 中的考点
    const validPoints = points.filter(p => typeNames.includes(p));
    if (validPoints.length > 0) {
      optionsHtml += `<optgroup label="${catName}">`;
      validPoints.forEach(point => {
        optionsHtml += `<option value="${point}">${point}</option>`;
      });
      optionsHtml += `</optgroup>`;
    }
  }

  // 兜底显示其他未分类考点
  if (extraPoints.length > 0) {
    optionsHtml += '<optgroup label="其他考点">';
    extraPoints.forEach(point => {
      optionsHtml += `<option value="${point}">${point}</option>`;
    });
    optionsHtml += '</optgroup>';
  }

  wrapper.innerHTML = `
    <label class="form-label">题型识别</label>
    <div style="display:flex; align-items:center; gap:var(--space-3);">
      <select class="form-input" id="type-select" style="flex:1;">
        ${optionsHtml}
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
