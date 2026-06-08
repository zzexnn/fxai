/**
 * 分析结果展示组件
 * 渲染个体诊断卡片 + 群体汇总表格
 */

import { escapeHtml } from '../utils/helpers.js';
import { exportAsPrint, exportAsJSON } from '../utils/export.js';
import { renderRemediationPanel } from './remediation-panel.js';

/**
 * 渲染分析结果
 * @param {HTMLElement} container - 结果容器
 * @param {object} analysisRecord - 分析记录
 */
export function renderResults(container, analysisRecord) {
  if (analysisRecord.questions && analysisRecord.questions.length > 1) {
    renderBatchResults(container, analysisRecord);
    return;
  }

  const { result } = analysisRecord;
  if (!result) return;

  // 清除旧结果
  clearResults(container);

  const section = document.createElement('div');
  section.className = 'result-section animate-fade-in-up';

  // 头部：标题 + 导出按钮
  const header = document.createElement('div');
  header.className = 'result-section__header';
  header.innerHTML = `
    <h3 class="result-section__title">📊 诊断结果</h3>
    <div class="result-section__actions no-print">
      <button class="btn btn--secondary btn--sm" id="export-print-btn">🖨️ 打印</button>
      <button class="btn btn--secondary btn--sm" id="export-json-btn">📥 导出JSON</button>
    </div>
  `;
  section.appendChild(header);

  // 题型信息行
  const typeInfo = document.createElement('div');
  typeInfo.style.cssText = 'display:flex; flex-wrap:wrap; gap:var(--space-2); margin-bottom:var(--space-5);';
  typeInfo.innerHTML = `
    <span class="badge badge--info">题型: ${escapeHtml(result.题型 || '未知')}</span>
    <span class="badge ${getConfBadgeClass(result.题型置信度)}">置信度: ${escapeHtml(result.题型置信度 || '-')}</span>
    <span class="badge ${getStatusBadgeClass(result.题型状态)}">${escapeHtml(result.题型状态 || '-')}</span>
    ${result.满分 != null ? `<span class="badge badge--accent">满分: ${escapeHtml(String(result.满分))}</span>` : ''}
    ${result.给分标准来源 ? `<span class="badge badge--neutral">给分: ${escapeHtml(result.给分标准来源)}</span>` : ''}
    <span class="badge badge--neutral">${escapeHtml(result.内容核实范围 || '-')}</span>
  `;
  section.appendChild(typeInfo);

  // 个体诊断
  const diagnoses = result.个体诊断 || [];
  diagnoses.forEach(diag => {
    const card = createDiagnosisCard(diag, result.满分);
    section.appendChild(card);
  });

  // 群体得分概况
  if (result.群体得分概况) {
    section.appendChild(createScoreOverview(result.群体得分概况));
  }

  // 群体汇总
  const summary = result.群体汇总;
  if (summary && summary.length > 0) {
    const summarySection = createSummaryTable(summary);
    section.appendChild(summarySection);
  }

  container.appendChild(section);

  // 渲染补救建议面板（在诊断结果之后）
  renderRemediationPanel(container, analysisRecord);

  // 绑定导出事件
  section.querySelector('#export-print-btn')?.addEventListener('click', () => exportAsPrint(analysisRecord));
  section.querySelector('#export-json-btn')?.addEventListener('click', () => exportAsJSON(analysisRecord));
}

/**
 * 渲染多题批量诊断结果
 */
function renderBatchResults(container, analysisRecord) {
  const questions = analysisRecord.questions || [];
  if (questions.length === 0) return;

  clearResults(container);

  const section = document.createElement('div');
  section.className = 'result-section result-section--batch animate-fade-in-up';

  const header = document.createElement('div');
  header.className = 'result-section__header';
  header.innerHTML = `
    <div>
      <h3 class="result-section__title">📊 批量诊断结果</h3>
      <div class="result-section__subtitle">共 ${questions.length} 道题，按题独立分析</div>
    </div>
    <div class="result-section__actions no-print">
      <button class="btn btn--secondary btn--sm" id="export-print-btn">🖨️ 打印</button>
      <button class="btn btn--secondary btn--sm" id="export-json-btn">📥 导出JSON</button>
    </div>
  `;
  section.appendChild(header);

  questions.forEach(questionRecord => {
    section.appendChild(createQuestionResultBlock(questionRecord));
  });

  container.appendChild(section);

  section.querySelector('#export-print-btn')?.addEventListener('click', () => exportAsPrint(analysisRecord));
  section.querySelector('#export-json-btn')?.addEventListener('click', () => exportAsJSON(analysisRecord));
}

function createQuestionResultBlock(questionRecord) {
  const result = questionRecord.result || {};
  const block = document.createElement('section');
  block.className = 'question-result';

  const cacheBadge = questionRecord.isFromCache ? '<span class="badge badge--success">复用缓存</span>' : '';
  block.innerHTML = `
    <div class="question-result__header">
      <div>
        <div class="question-result__eyebrow">第 ${questionRecord.index} 题</div>
        <h4 class="question-result__title">${escapeHtml(questionRecord.questionType || result.题型 || '未知题型')}</h4>
      </div>
      <div class="question-result__badges">
        ${cacheBadge}
        <span class="badge ${getConfBadgeClass(result.题型置信度)}">置信度: ${escapeHtml(result.题型置信度 || '-')}</span>
        <span class="badge ${getStatusBadgeClass(result.题型状态)}">${escapeHtml(result.题型状态 || '-')}</span>
        ${result.满分 != null ? `<span class="badge badge--accent">满分: ${escapeHtml(String(result.满分))}</span>` : ''}
        ${result.给分标准来源 ? `<span class="badge badge--neutral">给分: ${escapeHtml(result.给分标准来源)}</span>` : ''}
      </div>
    </div>
    <div class="question-result__inputs">
      <div class="question-result__input">
        <div class="question-result__label">题目</div>
        <div class="question-result__text">${escapeHtml(questionRecord.inputs?.question || '')}</div>
      </div>
      <div class="question-result__input">
        <div class="question-result__label">参考答案</div>
        <div class="question-result__text">${escapeHtml(questionRecord.inputs?.referenceAnswer || '')}</div>
      </div>
      <div class="question-result__input">
        <div class="question-result__label">学生作答</div>
        <div class="question-result__text">${escapeHtml((questionRecord.inputs?.studentAnswers || []).join('\n\n'))}</div>
      </div>
    </div>
  `;

  const diagnoses = result.个体诊断 || [];
  diagnoses.forEach(diag => {
    block.appendChild(createDiagnosisCard(diag, result.满分));
  });

  if (result.群体得分概况) {
    block.appendChild(createScoreOverview(result.群体得分概况));
  }

  const summary = result.群体汇总;
  if (summary && summary.length > 0) {
    block.appendChild(createSummaryTable(summary));
  }

  return block;
}

/**
 * 创建单个学生诊断卡片
 * @param {object} diag - 个体诊断对象
 * @param {number} [fullScore] - 本题满分（来自 result.满分）
 */
function createDiagnosisCard(diag, fullScore) {
  const card = document.createElement('div');
  card.className = 'result-card';

  // 得分徽标
  const hasScore = diag.得分 != null;
  const max = fullScore != null ? fullScore : null;
  let scoreBadge = '';
  if (hasScore) {
    const scoreText = max != null ? `${diag.得分} / ${max}` : `${diag.得分}`;
    scoreBadge = `<span class="badge badge--accent result-card__score">得分: ${escapeHtml(scoreText)}</span>`;
  }

  // 头部
  const headerHtml = `
    <div class="result-card__header">
      <span class="result-card__student">${escapeHtml(diag.学生标识 || '学生')}</span>
      ${scoreBadge}
      ${diag.无失分 ? '<span class="badge badge--success">✓ 无失分</span>' : ''}
    </div>
  `;

  // 识别原文
  const originalHtml = `
    <div class="result-card__original-label">识别原文</div>
    <div class="result-card__original">${escapeHtml(diag.识别原文 || '无')}</div>
  `;

  // 得分要点明细
  let scorePointsHtml = '';
  const scorePoints = diag.得分要点 || [];
  if (scorePoints.length > 0) {
    const rows = scorePoints.map(p => {
      const verdict = p.判定 || '';
      const verdictClass = verdict === '答到' ? 'badge--success'
        : verdict === '部分答到' ? 'badge--warning'
        : 'badge--danger';
      const gained = p.实得分 ?? '';
      const full = p.应得分 ?? '';
      return `
        <tr>
          <td>${escapeHtml(p.要点 || p.类别 || '')}</td>
          <td style="text-align:center;">${escapeHtml(String(gained))} / ${escapeHtml(String(full))}</td>
          <td style="text-align:center;"><span class="badge ${verdictClass}">${escapeHtml(verdict || '-')}</span></td>
          <td>${escapeHtml(p.说明 || '')}</td>
        </tr>
      `;
    }).join('');
    scorePointsHtml = `
      <div class="score-points">
        <div class="score-points__title">📝 得分要点</div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>要点</th>
                <th style="text-align:center;">实得/应得</th>
                <th style="text-align:center;">判定</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 失分点
  let lossPointsHtml = '';
  const points = diag.失分点 || [];
  if (points.length > 0) {
    lossPointsHtml = points.map(point => `
      <div class="loss-point">
        <div class="loss-point__header">
          <span style="color:var(--color-warning);">⚠</span>
          <span class="loss-point__title">${escapeHtml(point.缺失要点 || '')}</span>
        </div>
        <div class="loss-point__detail">
          <span class="badge badge--warning">${escapeHtml(point.错因细类 || '')}</span>
          <span class="badge badge--neutral">${escapeHtml(point.错因大类 || '')}</span>
        </div>
        <div class="loss-point__evidence">${escapeHtml(point.依据 || '')}</div>
        ${point.需人工确认 ? '<div class="loss-point__review">👁 需老师确认</div>' : ''}
      </div>
    `).join('');
  }

  card.innerHTML = headerHtml + originalHtml + scorePointsHtml + lossPointsHtml;
  return card;
}

/**
 * 创建群体得分概况
 * @param {object} overview - { 平均分, 最高分, 最低分, 满分 }
 */
function createScoreOverview(overview) {
  const section = document.createElement('div');
  section.className = 'summary-section score-overview';

  const cell = (label, value) => `
    <div class="score-overview__cell">
      <div class="score-overview__value">${escapeHtml(String(value ?? '-'))}</div>
      <div class="score-overview__label">${escapeHtml(label)}</div>
    </div>
  `;

  section.innerHTML = `
    <div class="summary-section__title">🎯 群体得分概况</div>
    <div class="score-overview__grid" style="display:flex; flex-wrap:wrap; gap:var(--space-3);">
      ${cell('平均分', overview.平均分)}
      ${cell('最高分', overview.最高分)}
      ${cell('最低分', overview.最低分)}
      ${cell('满分', overview.满分)}
    </div>
  `;

  return section;
}

/**
 * 创建群体汇总表格
 */
function createSummaryTable(summary) {
  const section = document.createElement('div');
  section.className = 'summary-section';

  let rows = summary.map(item => `
    <tr>
      <td>${escapeHtml(item.错因细类 || '')}</td>
      <td style="text-align:center;">${item.人数 || 0}</td>
      <td style="text-align:center;">${escapeHtml(String(item.占比 || ''))}</td>
    </tr>
  `).join('');

  section.innerHTML = `
    <div class="summary-section__title">📈 群体汇总</div>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>错因细类</th>
            <th style="text-align:center;">人数</th>
            <th style="text-align:center;">占比</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  return section;
}

/**
 * 清除结果区域
 */
export function clearResults(container) {
  container.querySelectorAll('.result-section').forEach(el => el.remove());
  container.querySelectorAll('.remediation-panel').forEach(el => el.remove());
}

function getConfBadgeClass(conf) {
  const map = { '高': 'badge--success', '中': 'badge--warning', '低': 'badge--danger' };
  return map[conf] || 'badge--neutral';
}

function getStatusBadgeClass(status) {
  const map = { '正常': 'badge--success', '存疑': 'badge--warning', '未收录': 'badge--danger', '复合题': 'badge--info' };
  return map[status] || 'badge--neutral';
}
