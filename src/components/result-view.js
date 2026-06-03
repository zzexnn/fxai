/**
 * 分析结果展示组件
 * 渲染个体诊断卡片 + 群体汇总表格
 */

import { escapeHtml } from '../utils/helpers.js';
import { exportAsPrint, exportAsJSON } from '../utils/export.js';

/**
 * 渲染分析结果
 * @param {HTMLElement} container - 结果容器
 * @param {object} analysisRecord - 分析记录
 */
export function renderResults(container, analysisRecord) {
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
    <span class="badge badge--neutral">${escapeHtml(result.内容核实范围 || '-')}</span>
  `;
  section.appendChild(typeInfo);

  // 个体诊断
  const diagnoses = result.个体诊断 || [];
  diagnoses.forEach(diag => {
    const card = createDiagnosisCard(diag);
    section.appendChild(card);
  });

  // 群体汇总
  const summary = result.群体汇总;
  if (summary && summary.length > 0) {
    const summarySection = createSummaryTable(summary);
    section.appendChild(summarySection);
  }

  container.appendChild(section);

  // 绑定导出事件
  section.querySelector('#export-print-btn')?.addEventListener('click', () => exportAsPrint(analysisRecord));
  section.querySelector('#export-json-btn')?.addEventListener('click', () => exportAsJSON(analysisRecord));
}

/**
 * 创建单个学生诊断卡片
 */
function createDiagnosisCard(diag) {
  const card = document.createElement('div');
  card.className = 'result-card';

  // 头部
  const headerHtml = `
    <div class="result-card__header">
      <span class="result-card__student">${escapeHtml(diag.学生标识 || '学生')}</span>
      ${diag.无失分 ? '<span class="badge badge--success">✓ 无失分</span>' : ''}
    </div>
  `;

  // 识别原文
  const originalHtml = `
    <div class="result-card__original-label">识别原文</div>
    <div class="result-card__original">${escapeHtml(diag.识别原文 || '无')}</div>
  `;

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

  card.innerHTML = headerHtml + originalHtml + lossPointsHtml;
  return card;
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
  const existing = container.querySelector('.result-section');
  if (existing) existing.remove();
}

function getConfBadgeClass(conf) {
  const map = { '高': 'badge--success', '中': 'badge--warning', '低': 'badge--danger' };
  return map[conf] || 'badge--neutral';
}

function getStatusBadgeClass(status) {
  const map = { '正常': 'badge--success', '存疑': 'badge--warning', '未收录': 'badge--danger', '复合题': 'badge--info' };
  return map[status] || 'badge--neutral';
}
