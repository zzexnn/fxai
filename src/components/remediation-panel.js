/**
 * 补救建议面板组件
 * 根据诊断结果自动分类错因，展示补救建议，调用 AI 生成变式题/知识讲解
 */

import { escapeHtml } from '../utils/helpers.js';
import { getQuestionType, QUESTION_TYPES } from '../data/question-types.js';
import {
  buildVariantSystemPrompt,
  buildVariantUserContent,
  buildKnowledgeSystemPrompt,
  buildKnowledgeUserContent,
} from '../utils/remediation-builder.js';
import { generateVariant, generateKnowledge } from '../services/remediation.js';
import { canUse, recordUsage, getRemaining, getLimit } from '../services/limits.js';
import { Toast } from './toast.js';

/**
 * 模糊匹配考点数据
 * 依次尝试：精确匹配 → 包含匹配 → 关键词匹配
 * @param {string} questionType - 前端匹配的题型
 * @param {string} aiType - AI 返回的题型名
 * @returns {object|null}
 */
function findSkillData(questionType, aiType) {
  // 1. 精确匹配 point_name
  if (questionType) {
    const exact = getQuestionType(questionType);
    if (exact) return exact;
  }
  if (aiType) {
    const exact = getQuestionType(aiType);
    if (exact) return exact;
  }

  // 2. 包含匹配：point_name 包含 aiType 或反过来
  const candidates = [questionType, aiType].filter(Boolean);
  for (const name of candidates) {
    const found = QUESTION_TYPES.find(t =>
      t.point_name.includes(name) || name.includes(t.point_name)
    );
    if (found) return found;
  }

  // 3. 关键词匹配：拆分名称为关键词，匹配 point_name
  for (const name of candidates) {
    const keywords = name.replace(/[的与及和]/g, ' ').split(/\s+/).filter(s => s.length >= 2);
    let bestMatch = null;
    let bestScore = 0;
    for (const t of QUESTION_TYPES) {
      let score = 0;
      for (const kw of keywords) {
        if (t.point_name.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = t;
      }
    }
    if (bestMatch && bestScore >= 1) return bestMatch;
  }

  return null;
}

/**
 * 从诊断结果中提取错因分类
 * @param {object} result - AI 诊断结果
 * @returns {{ technique: string[], knowledge: string[], attitude: string[] }}
 */
function classifyErrors(result) {
  const errors = { technique: [], knowledge: [], attitude: [] };
  const diagList = result.个体诊断 || [];

  for (const diag of diagList) {
    if (diag.无失分) continue;
    for (const point of (diag.失分点 || [])) {
      const category = point.错因大类 || '';
      const reason = point.错因细类 || point.缺失要点 || '';
      if (!reason) continue;

      if (category === '技巧规范') {
        if (!errors.technique.includes(reason)) errors.technique.push(reason);
      } else if (category === '知识盲区' || category === '审题问题') {
        if (!errors.knowledge.includes(reason)) errors.knowledge.push(reason);
      } else if (category === '习惯态度') {
        if (!errors.attitude.includes(reason)) errors.attitude.push(reason);
      } else {
        // 未知分类归入技巧规范
        if (!errors.technique.includes(reason)) errors.technique.push(reason);
      }
    }
  }

  return errors;
}

/**
 * 统计各错因的人数
 * @param {object} result
 * @returns {Map<string, number>}
 */
function countErrorStudents(result) {
  const counts = new Map();
  for (const diag of (result.个体诊断 || [])) {
    if (diag.无失分) continue;
    const seen = new Set();
    for (const point of (diag.失分点 || [])) {
      const reason = point.错因细类 || point.缺失要点 || '';
      if (reason && !seen.has(reason)) {
        seen.add(reason);
        counts.set(reason, (counts.get(reason) || 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * 渲染补救建议面板
 * @param {HTMLElement} container - 渲染容器
 * @param {object} analysisRecord - 完整的分析记录
 */
export function renderRemediationPanel(container, analysisRecord) {
  const { result, inputs, mode, questionType } = analysisRecord;
  if (!result || !result.个体诊断) {
    console.log('[Remediation] No result or individual diagnosis found in record.');
    return;
  }

  console.log('[Remediation] renderRemediationPanel inputs:', { questionType, aiType: result.题型 });

  const errors = classifyErrors(result);
  const errorCounts = countErrorStudents(result);
  const hasArticle = inputs?.article && inputs.article !== '未提供' && inputs.article.trim().length > 0;

  // 尝试多种方式匹配考点数据
  const skillData = findSkillData(questionType, result.题型);
  console.log('[Remediation] findSkillData result:', skillData);

  // 检查是否显示面板：
  // 1. 存在失分点 (hasErrors)
  // 2. 匹配到了考点知识 (skillData)，可供进行巩固拓展
  const hasErrors = errors.technique.length > 0 || errors.knowledge.length > 0 || errors.attitude.length > 0;
  if (!hasErrors && !skillData) {
    console.log('[Remediation] Not rendering remediation panel because no errors found and no skill data matched.');
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'remediation-panel animate-fade-in-up';

  let html = `
    <div class="remediation-panel__header">
      <h3 class="remediation-panel__title">💡 补救与拓展建议</h3>
      <p class="remediation-panel__desc">根据诊断结果，AI 建议以下补救或巩固方案。点击按钮生成对应材料。</p>
    </div>
    <div class="remediation-panel__cards">
  `;

  // 1. 变式训练 / 巩固训练
  const showVariantCard = errors.technique.length > 0 || (skillData && !hasErrors);
  if (showVariantCard) {
    const isRemedy = errors.technique.length > 0;
    const title = isRemedy ? '变式训练 (纠错)' : '巩固训练 (防错)';
    const desc = isRemedy 
      ? '学生答题方向正确但技巧不规范。基于同一篇文章生成同考点练习题，强化薄弱环节。'
      : '学生作答表现优异，可生成同考点巩固训练题，进一步加深理解。';
    
    let errorTags = '';
    if (isRemedy) {
      errorTags = errors.technique.map(r => {
        const count = errorCounts.get(r) || 0;
        return `<span class="badge badge--warning">${escapeHtml(r)}${count > 0 ? `(${count}人)` : ''}</span>`;
      }).join(' ');
    } else {
      errorTags = `<span class="badge badge--success">考点: ${escapeHtml(skillData.point_name)}</span>`;
    }

    const variantDisabled = !hasArticle || !skillData;
    const variantWarn = !hasArticle ? '⚠️ 未上传文章，无法生成变式题' : !skillData ? '⚠️ 未匹配到考点知识，无法生成变式题' : '';
    html += `
      <div class="remediation-card remediation-card--variant">
        <div class="remediation-card__icon">⚡</div>
        <div class="remediation-card__content">
          <div class="remediation-card__title">${title}</div>
          <div class="remediation-card__desc">${desc}</div>
          <div class="remediation-card__errors">${errorTags}</div>
          ${variantWarn ? `<div class="remediation-card__warn">${variantWarn}</div>` : ''}
        </div>
        <button class="btn btn--accent btn--sm remediation-card__btn" id="gen-variant-btn" ${variantDisabled ? 'disabled' : ''}>
          ✅ ${isRemedy ? '生成变式题' : '生成巩固题'}
        </button>
      </div>
    `;
  }

  // 2. 知识讲解 / 拓展提优
  const showKnowledgeCard = errors.knowledge.length > 0 || (skillData && !hasErrors);
  if (showKnowledgeCard) {
    const isRemedy = errors.knowledge.length > 0;
    const title = isRemedy ? '知识讲解 (补缺)' : '知识拓展 (提优)';
    const desc = isRemedy
      ? '学生存在概念不清或审题偏差。提供答题技巧讲解和标准范例，帮助学生建立正确认知。'
      : '提供该考点的精讲内容、标准答题技巧与精选范例，用于教学分发或自主复习。';
    
    let errorTags = '';
    if (isRemedy) {
      errorTags = errors.knowledge.map(r => {
        const count = errorCounts.get(r) || 0;
        return `<span class="badge badge--info">${escapeHtml(r)}${count > 0 ? `(${count}人)` : ''}</span>`;
      }).join(' ');
    } else {
      errorTags = `<span class="badge badge--success">考点: ${escapeHtml(skillData.point_name)}</span>`;
    }

    const knowledgeDisabled = !skillData;
    html += `
      <div class="remediation-card remediation-card--knowledge">
        <div class="remediation-card__icon">📖</div>
        <div class="remediation-card__content">
          <div class="remediation-card__title">${title}</div>
          <div class="remediation-card__desc">${desc}</div>
          <div class="remediation-card__errors">${errorTags}</div>
          ${knowledgeDisabled ? '<div class="remediation-card__warn">⚠️ 未匹配到考点知识，无法生成知识卡片</div>' : ''}
        </div>
        <button class="btn btn--primary btn--sm remediation-card__btn" id="gen-knowledge-btn" ${knowledgeDisabled ? 'disabled' : ''}>
          📖 ${isRemedy ? '生成知识卡片' : '生成拓展卡片'}
        </button>
      </div>
    `;
  }

  // 3. 习惯态度
  if (errors.attitude.length > 0) {
    html += `
      <div class="remediation-card remediation-card--attitude">
        <div class="remediation-card__icon">📋</div>
        <div class="remediation-card__content">
          <div class="remediation-card__title">习惯态度</div>
          <div class="remediation-card__desc">
            学生存在书写习惯或态度问题（如空白、字迹潦草），需要老师单独沟通，无法通过练习解决。
          </div>
          <div class="remediation-card__errors">
            ${errors.attitude.map(r => `<span class="badge badge--neutral">${escapeHtml(r)}</span>`).join(' ')}
          </div>
        </div>
      </div>
    `;
  }

  html += '</div>';

  // 结果展示区
  html += '<div id="remediation-result"></div>';

  panel.innerHTML = html;
  container.appendChild(panel);

  // ---- 绑定事件 ----
  const resultArea = panel.querySelector('#remediation-result');

  // 生成变式题
  const variantBtn = panel.querySelector('#gen-variant-btn');
  if (variantBtn && !variantBtn.disabled) {
    variantBtn.addEventListener('click', () =>
      handleGenerateVariant(variantBtn, resultArea, {
        skillData,
        errors: errors.technique,
        article: inputs.article,
        question: inputs.question,
        mode,
      })
    );
  }

  // 生成知识卡片
  const knowledgeBtn = panel.querySelector('#gen-knowledge-btn');
  if (knowledgeBtn && !knowledgeBtn.disabled) {
    knowledgeBtn.addEventListener('click', () =>
      handleGenerateKnowledge(knowledgeBtn, resultArea, {
        skillData,
        errors: errors.knowledge,
        article: inputs.article,
        mode,
      })
    );
  }
}

/**
 * 处理变式题生成
 */
async function handleGenerateVariant(btn, resultArea, ctx) {
  if (!canUse(ctx.mode)) {
    Toast.show(`今日${ctx.mode === 'deep' ? '深度' : '标准'}分析次数已用完`, 'warning');
    return;
  }

  btn.disabled = true;
  const origText = btn.innerHTML;
  btn.innerHTML = '<span class="btn__spinner"></span> 生成中...';
  Toast.show('正在生成变式训练题...', 'info');

  try {
    const systemPrompt = buildVariantSystemPrompt(ctx.skillData, ctx.errors);
    const userContent = buildVariantUserContent(ctx.article, ctx.question);

    const result = await generateVariant({ systemPrompt, userContent, mode: ctx.mode });

    // 记录使用次数
    recordUsage(ctx.mode);
    window.dispatchEvent(new CustomEvent('usage-changed'));

    // 渲染结果
    renderVariantResult(resultArea, result);
    Toast.show('变式题生成完成！', 'success');
  } catch (err) {
    console.error('变式题生成失败:', err);
    Toast.show(`生成失败: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}

/**
 * 处理知识讲解生成
 */
async function handleGenerateKnowledge(btn, resultArea, ctx) {
  if (!canUse(ctx.mode)) {
    Toast.show(`今日${ctx.mode === 'deep' ? '深度' : '标准'}分析次数已用完`, 'warning');
    return;
  }

  btn.disabled = true;
  const origText = btn.innerHTML;
  btn.innerHTML = '<span class="btn__spinner"></span> 生成中...';
  Toast.show('正在生成知识讲解...', 'info');

  try {
    const systemPrompt = buildKnowledgeSystemPrompt(ctx.skillData, ctx.errors);
    const userContent = buildKnowledgeUserContent(ctx.article);

    const result = await generateKnowledge({ systemPrompt, userContent, mode: ctx.mode });

    // 记录使用次数
    recordUsage(ctx.mode);
    window.dispatchEvent(new CustomEvent('usage-changed'));

    // 渲染结果
    renderKnowledgeResult(resultArea, result);
    Toast.show('知识卡片生成完成！', 'success');
  } catch (err) {
    console.error('知识讲解生成失败:', err);
    Toast.show(`生成失败: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}

/**
 * 渲染变式题结果
 */
function renderVariantResult(container, result) {
  // 移除之前的变式题结果
  const existing = container.querySelector('.variant-result');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'variant-result animate-fade-in-up';
  el.innerHTML = `
    <div class="variant-result__header">
      <span class="variant-result__icon">📝</span>
      <span class="variant-result__title">变式训练题</span>
    </div>
    <div class="variant-result__question">
      <div class="variant-result__label">题目</div>
      <div class="variant-result__text">${escapeHtml(result.question)}</div>
    </div>
    <details class="variant-result__answer">
      <summary class="variant-result__answer-toggle">📋 查看参考答案</summary>
      <div class="variant-result__answer-content">${escapeHtml(result.referenceAnswer).replace(/\n/g, '<br>')}</div>
    </details>
    ${result.focusPoints && result.focusPoints.length > 0 ? `
      <div class="variant-result__focus">
        <div class="variant-result__label">⚠️ 关注要点</div>
        <ul class="variant-result__focus-list">
          ${result.focusPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
  `;

  container.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 渲染知识讲解结果
 */
function renderKnowledgeResult(container, result) {
  // 移除之前的知识结果
  const existing = container.querySelector('.knowledge-result');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'knowledge-result animate-fade-in-up';

  let html = `
    <div class="knowledge-result__header">
      <span class="knowledge-result__icon">📖</span>
      <span class="knowledge-result__title">知识讲解</span>
    </div>
    <div class="knowledge-result__technique">
      <div class="knowledge-result__label">答题技巧</div>
      <div class="knowledge-result__text">${escapeHtml(result.technique).replace(/\n/g, '<br>')}</div>
    </div>
  `;

  // 范例
  if (result.example) {
    html += `
      <div class="knowledge-result__example">
        <div class="knowledge-result__label">📌 范例</div>
        ${result.example.context ? `
          <div class="knowledge-result__example-section">
            <div class="knowledge-result__sublabel">语境</div>
            <div class="knowledge-result__blockquote">${escapeHtml(result.example.context).replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}
        <div class="knowledge-result__example-section">
          <div class="knowledge-result__sublabel">题目</div>
          <div class="knowledge-result__text">${escapeHtml(result.example.question)}</div>
        </div>
        <div class="knowledge-result__example-section">
          <div class="knowledge-result__sublabel">标准答案</div>
          <div class="knowledge-result__answer">${escapeHtml(result.example.answer).replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    `;
  }

  // 易错提醒
  if (result.commonMistakes && result.commonMistakes.length > 0) {
    html += `
      <div class="knowledge-result__mistakes">
        <div class="knowledge-result__label">⚠️ 易错提醒</div>
        <ul class="knowledge-result__mistake-list">
          ${result.commonMistakes.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  el.innerHTML = html;
  container.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
