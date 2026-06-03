/**
 * 主分析页面
 * 包含输入区域、题型选择、分析控制和结果展示
 */

import { createInputCard, getInputCardData, clearInputCard } from '../components/input-card.js';
import { createStudentInput, getStudentInputData, clearStudentInput } from '../components/student-input.js';
import { createTypeSelector, updateTypeDetection, getResolvedType } from '../components/type-selector.js';
import { renderResults, clearResults } from '../components/result-view.js';
import { showOcrPreview } from '../components/ocr-preview.js';
import { Toast } from '../components/toast.js';
import { getQuestionType } from '../data/question-types.js';
import { buildSystemPrompt, buildUserContent } from '../utils/prompt-builder.js';
import { generateId, formatDateTime, debounce } from '../utils/helpers.js';
import { recognizeImages } from '../services/ocr.js';
import { analyzeAnswers } from '../services/analyzer.js';
import { addHistory } from '../services/storage.js';
import { canUse, getRemaining, getLimit, recordUsage } from '../services/limits.js';

/**
 * 渲染分析页面
 * @param {HTMLElement} container
 */
export function renderAnalysisPage(container) {
  container.innerHTML = '';

  // 页面标题
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:var(--space-6);';
  header.innerHTML = `
    <h2 style="margin-bottom:var(--space-2);">答案诊断</h2>
    <p style="font-size:var(--text-sm); color:var(--color-text-secondary);">
      上传题目和学生回答，AI 将诊断作答中的失分点并归类错因
    </p>
  `;
  container.appendChild(header);

  // 输入网格 (2x2)
  const grid = document.createElement('div');
  grid.className = 'analysis-grid';

  const articleCard = createInputCard({ id: 'article', title: '文章', icon: '📄', required: false, placeholder: '粘贴文章原文...' });
  const questionCard = createInputCard({ id: 'question', title: '题目', icon: '📝', required: true, placeholder: '粘贴题目内容...' });
  const referenceCard = createInputCard({ id: 'reference', title: '参考答案', icon: '✅', required: false, placeholder: '粘贴参考答案...' });

  // 学生回答区域包装为卡片样式
  const studentWrapper = document.createElement('div');
  studentWrapper.className = 'card';
  studentWrapper.innerHTML = `
    <div class="card__header">
      <div class="card__title"><span class="card__title-icon">✏️</span>学生回答</div>
      <span class="card__badge card__badge--required">必填</span>
    </div>
  `;
  const studentBody = document.createElement('div');
  studentBody.className = 'card__body';
  studentBody.appendChild(createStudentInput());
  studentWrapper.appendChild(studentBody);

  grid.appendChild(articleCard);
  grid.appendChild(questionCard);
  grid.appendChild(referenceCard);
  grid.appendChild(studentWrapper);
  container.appendChild(grid);

  // 分析控制区域
  const actions = document.createElement('div');
  actions.className = 'analysis-actions';

  const deepRemaining = getRemaining('deep');
  const deepLimit = getLimit('deep');
  const stdRemaining = getRemaining('standard');
  const stdLimit = getLimit('standard');

  actions.innerHTML = `
    <div class="analysis-actions__header">
      <span class="analysis-actions__title">分析设置</span>
    </div>
    <div id="type-selector-container"></div>
    <div class="divider"></div>
    <div class="form-label">分析模式</div>
    <div class="radio-group" id="mode-selector">
      <div class="radio-option radio-option--selected ${!canUse('standard') ? 'radio-option--disabled' : ''}" data-mode="standard">
        <div class="radio-option__indicator"></div>
        <span class="radio-option__label">⚡ 标准分析</span>
        <span class="radio-option__meta" id="std-remaining">剩余 ${stdRemaining}/${stdLimit}</span>
      </div>
      <div class="radio-option ${!canUse('deep') ? 'radio-option--disabled' : ''}" data-mode="deep">
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

  // 题型选择器插入
  const typeSelectorContainer = actions.querySelector('#type-selector-container');
  typeSelectorContainer.appendChild(createTypeSelector());

  // 结果区域
  const resultContainer = document.createElement('div');
  resultContainer.id = 'result-container';
  container.appendChild(resultContainer);

  // ---- 事件绑定 ----

  let selectedMode = 'standard';

  // 题目输入变化 → 更新题型检测
  const questionTextarea = document.querySelector('#question-textarea');
  if (questionTextarea) {
    const debouncedDetect = debounce((text) => updateTypeDetection(text), 500);
    questionTextarea.addEventListener('input', () => debouncedDetect(questionTextarea.value));
  }

  // 分析模式切换
  const modeSelector = actions.querySelector('#mode-selector');
  modeSelector.addEventListener('click', (e) => {
    const option = e.target.closest('.radio-option');
    if (!option || option.classList.contains('radio-option--disabled')) return;

    const mode = option.dataset.mode;
    selectedMode = mode;

    modeSelector.querySelectorAll('.radio-option').forEach(o => o.classList.remove('radio-option--selected'));
    option.classList.add('radio-option--selected');
  });

  // 开始分析
  const submitBtn = actions.querySelector('#submit-btn');
  submitBtn.addEventListener('click', () => handleSubmit(selectedMode, resultContainer, submitBtn));
}

/**
 * 处理分析提交
 */
async function handleSubmit(mode, resultContainer, submitBtn) {
  // 1. 校验必填
  const questionData = getInputCardData('question');
  const studentData = getStudentInputData();

  const hasQuestion = questionData.mode === 'text' ? questionData.text.length > 0 : questionData.images.length > 0;
  const hasStudent = studentData.some(s => s.mode === 'text' ? s.text.length > 0 : s.images.length > 0);

  if (!hasQuestion) {
    Toast.show('请输入题目内容或上传题目图片', 'warning');
    return;
  }
  if (!hasStudent) {
    Toast.show('请输入至少一份学生回答', 'warning');
    return;
  }

  // 2. 检查使用次数
  if (!canUse(mode)) {
    Toast.show(`今日${mode === 'deep' ? '深度' : '标准'}分析次数已用完`, 'warning');
    return;
  }

  // 4. 收集所有输入
  const articleData = getInputCardData('article');
  const referenceData = getInputCardData('reference');

  // 5. 处理图片 OCR
  setLoading(submitBtn, true);

  try {
    // 收集需要 OCR 的图片
    const ocrTasks = [];

    if (articleData.mode === 'image' && articleData.images.length > 0) {
      ocrTasks.push({ label: '文章', images: articleData.images, field: 'article' });
    }
    if (questionData.mode === 'image' && questionData.images.length > 0) {
      ocrTasks.push({ label: '题目', images: questionData.images, field: 'question' });
    }
    if (referenceData.mode === 'image' && referenceData.images.length > 0) {
      ocrTasks.push({ label: '参考答案', images: referenceData.images, field: 'reference' });
    }
    studentData.forEach((s, i) => {
      if (s.mode === 'image' && s.images.length > 0) {
        ocrTasks.push({ label: `答卷${i + 1}`, images: s.images, field: `student-${i}` });
      }
    });

    // 准备最终文本
    let articleText = articleData.mode === 'text' ? articleData.text : '';
    let questionText = questionData.mode === 'text' ? questionData.text : '';
    let referenceText = referenceData.mode === 'text' ? referenceData.text : '';
    let studentTexts = studentData.map(s => s.mode === 'text' ? s.text : '');

    // 如有图片需要 OCR
    if (ocrTasks.length > 0) {

      Toast.show('正在识别图片文字...', 'info');

      // 并行 OCR 所有图片
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

      // 显示 OCR 预览
      const confirmed = await showOcrPreview(ocrResults);
      if (!confirmed) {
        setLoading(submitBtn, false);
        return;
      }

      // 将确认后的文字填回
      confirmed.forEach(item => {
        if (item.field === 'article') articleText = item.text;
        else if (item.field === 'question') questionText = item.text;
        else if (item.field === 'reference') referenceText = item.text;
        else if (item.field.startsWith('student-')) {
          const idx = parseInt(item.field.split('-')[1], 10);
          studentTexts[idx] = item.text;
        }
      });
    }

    // 6. 题型匹配
    // 先用 OCR 后的题目文字再次触发检测
    if (questionText) {
      updateTypeDetection(questionText);
    }

    const resolvedType = getResolvedType();
    const typeKnowledge = resolvedType ? getQuestionType(resolvedType) : null;

    // 7. 拼装 Prompt
    const systemPrompt = buildSystemPrompt(typeKnowledge);
    const userContent = buildUserContent({
      question: questionText,
      article: articleText,
      referenceAnswer: referenceText,
      studentAnswers: studentTexts.filter(t => t.length > 0),
    });

    // 8. 调用 AI 分析
    Toast.show(`正在进行${mode === 'deep' ? '深度' : '标准'}分析，请稍候...`, 'info');

    const result = await analyzeAnswers({
      systemPrompt,
      userContent,
      mode,
    });

    // 9. 构建记录并展示
    const record = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      inputs: {
        question: questionText,
        article: articleText,
        referenceAnswer: referenceText,
        studentAnswers: studentTexts.filter(t => t.length > 0),
      },
      questionType: resolvedType || result.题型 || '未知',
      mode,
      result,
      modelUsed: mode === 'deep' ? 'anthropic/claude-sonnet-4.6' : 'deepseek/deepseek-v4-pro',
    };

    // 显示结果
    renderResults(resultContainer, record);

    // 保存历史
    addHistory(record);

    // 记录使用次数
    recordUsage(mode);

    // 刷新导航栏使用量
    window.dispatchEvent(new CustomEvent('usage-changed'));

    // 更新按钮旁的剩余次数显示
    const stdEl = document.querySelector('#std-remaining');
    const deepEl = document.querySelector('#deep-remaining');
    if (stdEl) stdEl.textContent = `剩余 ${getRemaining('standard')}/${getLimit('standard')}`;
    if (deepEl) deepEl.textContent = `剩余 ${getRemaining('deep')}/${getLimit('deep')}`;

    Toast.show('分析完成！', 'success');

    // 滚动到结果区域
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('分析失败:', err);
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
