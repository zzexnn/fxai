/**
 * 主分析页面
 * 包含文章输入、多题组输入、分析控制和结果展示
 */

import { createInputCard, getInputCardData, clearInputCard } from '../components/input-card.js';
import { renderResults, clearResults } from '../components/result-view.js';
import { showOcrPreview } from '../components/ocr-preview.js';
import { Toast } from '../components/toast.js';
import { getQuestionType } from '../data/question-types.js';
import { buildSystemPrompt, buildUserContent } from '../utils/prompt-builder.js';
import { generateId } from '../utils/helpers.js';
import { matchQuestionType } from '../utils/type-matcher.js';
import { recognizeImages } from '../services/ocr.js';
import { analyzeAnswers } from '../services/analyzer.js';
import { addHistory, findCachedResult } from '../services/storage.js';
import { getRemaining, getLimit, recordUsage } from '../services/limits.js';
import { getDeviceFingerprint } from '../services/fingerprint.js';
import { trackAction } from '../utils/telemetry.js';

let lastRecord = null;
const MAX_QUESTION_GROUPS = 3;
const MODEL_BY_MODE = {
  deep: 'anthropic/claude-sonnet-4.6',
  standard: 'deepseek/deepseek-v4-pro',
};

/**
 * 渲染分析页面
 * @param {HTMLElement} container
 */
export function renderAnalysisPage(container) {
  lastRecord = null;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:var(--space-6);';
  header.innerHTML = `
    <h2 style="margin-bottom:var(--space-2);">答案诊断</h2>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary);">
      一篇文章最多配 3 道题，每道题独立诊断题型、参考答案和学生作答
    </p>
  `;
  container.appendChild(header);

  const articleCard = createInputCard({ id: 'article', title: '文章', icon: '📄', required: false, placeholder: '粘贴文章原文...' });
  articleCard.classList.add('analysis-article-card');
  container.appendChild(articleCard);

  const questionList = document.createElement('div');
  questionList.className = 'question-groups';
  questionList.id = 'question-groups';
  container.appendChild(questionList);

  const groupToolbar = document.createElement('div');
  groupToolbar.className = 'question-groups__toolbar';
  groupToolbar.innerHTML = `
    <button class="btn btn--secondary btn--sm" id="add-question-group-btn">＋ 添加题目</button>
    <span class="question-groups__limit">最多 3 道题</span>
  `;
  container.appendChild(groupToolbar);

  addQuestionGroup(questionList, 1);

  const actions = document.createElement('div');
  actions.className = 'analysis-actions';

  const deepRemaining = getRemaining('deep');
  const deepLimit = getLimit('deep');
  const stdRemaining = getRemaining('standard');
  const stdLimit = getLimit('standard');

  actions.innerHTML = `
    <div class="analysis-actions__header">
      <span class="analysis-actions__title">分析设置</span>
      <span class="analysis-actions__hint">按题逐个分析，缓存命中不扣次数</span>
    </div>
    <div class="form-label">分析模式</div>
    <div class="radio-group" id="mode-selector">
      <div class="radio-option radio-option--selected ${stdRemaining <= 0 ? 'radio-option--disabled' : ''}" data-mode="standard">
        <div class="radio-option__indicator"></div>
        <span class="radio-option__label">⚡ 标准分析</span>
        <span class="radio-option__meta" id="std-remaining">剩余 ${stdRemaining}/${stdLimit}</span>
      </div>
      <div class="radio-option ${deepRemaining <= 0 ? 'radio-option--disabled' : ''}" data-mode="deep">
        <div class="radio-option__indicator"></div>
        <span class="radio-option__label">✨ 深度分析</span>
        <span class="radio-option__meta" id="deep-remaining">剩余 ${deepRemaining}/${deepLimit}</span>
      </div>
    </div>
    <button class="btn btn--accent btn--lg analysis-actions__submit" id="submit-btn" style="width:100%; margin-top:var(--space-3);">
      🔍 开始分析
    </button>
  `;
  container.appendChild(actions);

  const resultContainer = document.createElement('div');
  resultContainer.id = 'result-container';
  container.appendChild(resultContainer);

  let selectedMode = 'standard';

  const addGroupBtn = groupToolbar.querySelector('#add-question-group-btn');
  addGroupBtn.addEventListener('click', () => {
    const count = questionList.querySelectorAll('.question-group').length;
    if (count >= MAX_QUESTION_GROUPS) {
      Toast.show('最多只能添加 3 道题', 'warning');
      return;
    }
    addQuestionGroup(questionList, count + 1);
    updateQuestionGroupControls(questionList, addGroupBtn);
  });

  const modeSelector = actions.querySelector('#mode-selector');
  modeSelector.addEventListener('click', (e) => {
    const option = e.target.closest('.radio-option');
    if (!option || option.classList.contains('radio-option--disabled')) return;

    const mode = option.dataset.mode;
    selectedMode = mode;

    modeSelector.querySelectorAll('.radio-option').forEach(o => o.classList.remove('radio-option--selected'));
    option.classList.add('radio-option--selected');
  });

  const submitBtn = actions.querySelector('#submit-btn');
  submitBtn.addEventListener('click', () => handleSubmit(selectedMode, resultContainer, submitBtn));

  updateQuestionGroupControls(questionList, addGroupBtn);
}

/**
 * 处理分析提交
 */
async function handleSubmit(mode, resultContainer, submitBtn) {
  trackAction('click_analyze', { mode });

  const rawGroups = collectQuestionGroups();
  if (rawGroups.length === 0) {
    Toast.show('请至少保留 1 道题目', 'warning');
    return;
  }

  const invalidGroup = rawGroups.find(group => {
    return !hasInput(group.questionData) || !hasInput(group.referenceData) || !hasInput(group.studentData);
  });
  if (invalidGroup) {
    trackAction('validation_failed', { reason: 'incomplete_question_group', groupIndex: invalidGroup.index });
    Toast.show(`请补全第 ${invalidGroup.index} 题的题目、参考答案和学生作答`, 'warning');
    return;
  }

  const articleData = getInputCardData('article');

  setLoading(submitBtn, true);

  try {
    const ocrTasks = [];

    if (articleData.mode === 'image' && articleData.images.length > 0) {
      ocrTasks.push({ label: '文章', images: articleData.images, field: 'article' });
    }

    const questionItems = rawGroups.map(group => ({
      index: group.index,
      questionText: group.questionData.mode === 'text' ? group.questionData.text : '',
      referenceText: group.referenceData.mode === 'text' ? group.referenceData.text : '',
      studentText: group.studentData.mode === 'text' ? group.studentData.text : '',
    }));

    rawGroups.forEach(group => {
      if (group.questionData.mode === 'image' && group.questionData.images.length > 0) {
        ocrTasks.push({ label: `第${group.index}题 - 题目`, images: group.questionData.images, field: `question-${group.index}` });
      }
      if (group.referenceData.mode === 'image' && group.referenceData.images.length > 0) {
        ocrTasks.push({ label: `第${group.index}题 - 参考答案`, images: group.referenceData.images, field: `reference-${group.index}` });
      }
      if (group.studentData.mode === 'image' && group.studentData.images.length > 0) {
        ocrTasks.push({ label: `第${group.index}题 - 学生作答`, images: group.studentData.images, field: `student-${group.index}` });
      }
    });

    let articleText = articleData.mode === 'text' ? articleData.text : '';

    if (ocrTasks.length > 0) {
      Toast.show('正在识别图片文字...', 'info');

      const ocrResults = [];
      for (const task of ocrTasks) {
        try {
          const texts = await recognizeImages(task.images);
          const combinedText = texts.join('\n\n');
          ocrResults.push({ label: task.label, text: combinedText, field: task.field });
        } catch (err) {
          ocrResults.push({ label: task.label, text: `[识别失败: ${err.message}]`, field: task.field });
        }
      }

      const confirmed = await showOcrPreview(ocrResults);
      if (!confirmed) {
        setLoading(submitBtn, false);
        return;
      }

      confirmed.forEach(item => {
        if (item.field === 'article') articleText = item.text;
        else {
          const [field, indexText] = item.field.split('-');
          const index = parseInt(indexText, 10);
          const target = questionItems.find(q => q.index === index);
          if (!target) return;
          if (field === 'question') target.questionText = item.text;
          if (field === 'reference') target.referenceText = item.text;
          if (field === 'student') target.studentText = item.text;
        }
      });
    }

    const preparedItems = questionItems.map(item => {
      const inputPayload = {
        question: item.questionText.trim(),
        article: articleText,
        referenceAnswer: item.referenceText.trim(),
        studentAnswers: [item.studentText.trim()].filter(t => t.length > 0),
      };
      const cachedRecord = findCachedResult(inputPayload);
      return { ...item, inputPayload, cachedRecord };
    });

    const emptyAfterOcr = preparedItems.find(item => {
      return !item.inputPayload.question || !item.inputPayload.referenceAnswer || item.inputPayload.studentAnswers.length === 0;
    });
    if (emptyAfterOcr) {
      Toast.show(`第 ${emptyAfterOcr.index} 题识别结果不完整，请在 OCR 预览中补全后再分析`, 'warning');
      return;
    }

    const pendingCount = preparedItems.filter(item => !item.cachedRecord).length;
    if (pendingCount > getRemaining(mode)) {
      trackAction('limit_exceeded', { mode, required: pendingCount });
      Toast.show(`本次需要 ${pendingCount} 次${mode === 'deep' ? '深度' : '标准'}分析额度，当前剩余 ${getRemaining(mode)} 次`, 'warning');
      return;
    }

    const fingerprint = getDeviceFingerprint();
    const questionRecords = [];
    let usedCount = 0;
    let cacheCount = 0;

    for (let i = 0; i < preparedItems.length; i++) {
      const item = preparedItems[i];
      let result;
      let questionType;
      let modelUsed;
      let isFromCache = false;

      if (item.cachedRecord) {
        result = item.cachedRecord.result;
        questionType = item.cachedRecord.questionType || result.题型 || '未知';
        modelUsed = item.cachedRecord.modelUsed || MODEL_BY_MODE[mode];
        isFromCache = true;
        cacheCount += 1;
        trackAction('cache_hit', { mode, groupIndex: item.index });
      } else {
        const match = matchQuestionType(item.questionText);
        const resolvedType = match.type;
        const typeKnowledge = resolvedType ? getQuestionType(resolvedType) : null;
        const systemPrompt = buildSystemPrompt(typeKnowledge);
        const userContent = buildUserContent({
          question: item.questionText,
          article: articleText,
          referenceAnswer: item.referenceText,
          studentAnswers: item.inputPayload.studentAnswers,
        });

        Toast.show(`正在分析第 ${item.index} 题（${i + 1}/${preparedItems.length}）...`, 'info');

        result = await analyzeAnswers({
          systemPrompt,
          userContent,
          mode,
          fingerprint,
        });
        questionType = resolvedType || result.题型 || '未知';
        modelUsed = MODEL_BY_MODE[mode];
        usedCount += 1;
      }

      questionRecords.push({
        index: item.index,
        inputs: item.inputPayload,
        questionType,
        mode: item.cachedRecord ? item.cachedRecord.mode || mode : mode,
        result,
        modelUsed,
        isFromCache,
      });
    }

    const record = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      isBatch: questionRecords.length > 1,
      inputs: {
        article: articleText,
        question: questionRecords.length === 1 ? questionRecords[0].inputs.question : `${questionRecords.length} 道题目`,
        referenceAnswer: questionRecords.length === 1 ? questionRecords[0].inputs.referenceAnswer : '见各题参考答案',
        studentAnswers: questionRecords.length === 1 ? questionRecords[0].inputs.studentAnswers : [],
      },
      questionType: questionRecords.length === 1 ? questionRecords[0].questionType : `批量分析 ${questionRecords.length} 题`,
      mode,
      questions: questionRecords,
      result: questionRecords.length === 1 ? questionRecords[0].result : null,
      modelUsed: MODEL_BY_MODE[mode],
    };

    renderResults(resultContainer, record);
    lastRecord = record;

    addHistory(record);

    for (let i = 0; i < usedCount; i++) {
      recordUsage(mode);
    }

    if (usedCount > 0) {
      window.dispatchEvent(new CustomEvent('usage-changed'));
      updateUsageLabels();
    }

    trackAction('analyze_success', {
      mode,
      questionCount: questionRecords.length,
      usedCount,
      cacheCount,
    });

    const cacheText = cacheCount > 0 ? `，其中 ${cacheCount} 题复用缓存` : '';
    Toast.show(`分析完成${cacheText}`, 'success');

    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('分析失败:', err);
    trackAction('analyze_failed', {
      mode,
      error: err.message,
    });
    Toast.show(`分析失败: ${err.message}`, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
}

/**
 * 设置按钮 loading 状态
 */
function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="btn__spinner"></span> 分析中...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || '🔍 开始分析';
  }
}

function addQuestionGroup(listEl, index) {
  const group = document.createElement('section');
  group.className = 'question-group';
  group.dataset.index = String(index);
  group.innerHTML = `
    <div class="question-group__header">
      <div>
        <div class="question-group__eyebrow">题组</div>
        <h3 class="question-group__title">第 ${index} 题</h3>
      </div>
      <button class="btn btn--ghost btn--sm question-group__remove" type="button">删除</button>
    </div>
    <div class="question-group__fields"></div>
  `;

  const fields = group.querySelector('.question-group__fields');
  fields.appendChild(createInputCard({
    id: getQuestionFieldId(index, 'question'),
    title: '题目',
    icon: '📝',
    required: true,
    placeholder: `粘贴第 ${index} 题题目...`,
  }));
  fields.appendChild(createInputCard({
    id: getQuestionFieldId(index, 'reference'),
    title: '参考答案',
    icon: '✅',
    required: true,
    placeholder: `粘贴第 ${index} 题参考答案...`,
  }));
  fields.appendChild(createInputCard({
    id: getQuestionFieldId(index, 'student'),
    title: '学生作答',
    icon: '✏️',
    required: true,
    placeholder: `粘贴第 ${index} 题学生作答...`,
  }));

  group.querySelector('.question-group__remove').addEventListener('click', () => {
    clearInputCard(getQuestionFieldId(index, 'question'));
    clearInputCard(getQuestionFieldId(index, 'reference'));
    clearInputCard(getQuestionFieldId(index, 'student'));
    group.remove();
    renumberQuestionGroups(listEl);
    const addBtn = document.querySelector('#add-question-group-btn');
    updateQuestionGroupControls(listEl, addBtn);
  });

  listEl.appendChild(group);
}

function updateQuestionGroupControls(listEl, addBtn) {
  const groups = [...listEl.querySelectorAll('.question-group')];
  groups.forEach((group, idx) => {
    const removeBtn = group.querySelector('.question-group__remove');
    if (removeBtn) removeBtn.style.display = groups.length > 1 && idx === groups.length - 1 ? '' : 'none';
  });
  if (addBtn) {
    addBtn.disabled = groups.length >= MAX_QUESTION_GROUPS;
  }
}

function renumberQuestionGroups(listEl) {
  const groups = [...listEl.querySelectorAll('.question-group')];
  groups.forEach((group, idx) => {
    const number = idx + 1;
    group.dataset.index = String(number);
    const title = group.querySelector('.question-group__title');
    if (title) title.textContent = `第 ${number} 题`;
  });
}

function collectQuestionGroups() {
  return [...document.querySelectorAll('.question-group')].map(group => {
    const index = parseInt(group.dataset.index, 10);
    return {
      index,
      questionData: getInputCardData(getQuestionFieldId(index, 'question')),
      referenceData: getInputCardData(getQuestionFieldId(index, 'reference')),
      studentData: getInputCardData(getQuestionFieldId(index, 'student')),
    };
  });
}

function getQuestionFieldId(index, field) {
  return `q${index}-${field}`;
}

function hasInput(data) {
  return data.mode === 'text' ? data.text.length > 0 : data.images.length > 0;
}

function updateUsageLabels() {
  const stdEl = document.querySelector('#std-remaining');
  const deepEl = document.querySelector('#deep-remaining');
  if (stdEl) stdEl.textContent = `剩余 ${getRemaining('standard')}/${getLimit('standard')}`;
  if (deepEl) deepEl.textContent = `剩余 ${getRemaining('deep')}/${getLimit('deep')}`;
}
