/**
 * 诊断报告导出功能
 * 支持打印（HTML）和 JSON 文件下载两种方式
 */

import { formatDateTime, escapeHtml } from './helpers.js';

/**
 * 生成学生得分文本（得分 / 满分）
 * @param {object} student - 个体诊断对象
 * @param {number} [fullScore] - 本题满分
 * @returns {string}
 */
function formatStudentScore(student, fullScore) {
  if (student.得分 == null) return '';
  const text = fullScore != null ? `${student.得分} / ${fullScore}` : `${student.得分}`;
  return `<span style="color:#1a237e;font-weight:bold;margin-left:8px;">得分：${escapeHtml(text)}</span>`;
}

/**
 * 生成失分点表格 HTML
 * @param {Array} failPoints - 失分点数组
 * @returns {string}
 */
function buildFailPointsTable(failPoints) {
  if (!failPoints || failPoints.length === 0) {
    return '<p style="color:#4caf50;font-weight:bold;">✅ 无失分</p>';
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>缺失要点</th>
          <th>错因细类</th>
          <th>错因大类</th>
          <th>依据</th>
          <th>需人工确认</th>
        </tr>
      </thead>
      <tbody>`;

  for (const fp of failPoints) {
    html += `
        <tr>
          <td>${escapeHtml(fp.缺失要点 || '')}</td>
          <td>${escapeHtml(fp.错因细类 || '')}</td>
          <td>${escapeHtml(fp.错因大类 || '')}</td>
          <td>${escapeHtml(fp.依据 || '')}</td>
          <td>${fp.需人工确认 ? '⚠️ 是' : '否'}</td>
        </tr>`;
  }

  html += `
      </tbody>
    </table>`;
  return html;
}

/**
 * 生成群体汇总表格 HTML
 * @param {Array} summary - 群体汇总数组
 * @returns {string}
 */
function buildGroupSummaryTable(summary) {
  if (!summary || summary.length === 0) {
    return '<p>暂无群体汇总数据</p>';
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>错因细类</th>
          <th>人数</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>`;

  for (const item of summary) {
    html += `
        <tr>
          <td>${escapeHtml(item.错因细类 || '')}</td>
          <td>${item.人数 ?? ''}</td>
          <td>${escapeHtml(String(item.占比 || ''))}</td>
        </tr>`;
  }

  html += `
      </tbody>
    </table>`;
  return html;
}

/**
 * 以打印方式导出诊断报告
 * 生成美观的 HTML 页面并在新窗口中打开，触发打印
 * @param {object} analysisRecord - 分析记录
 * @param {string} analysisRecord.id - 记录 ID
 * @param {number} analysisRecord.timestamp - 时间戳
 * @param {object} analysisRecord.inputs - 输入数据
 * @param {string} analysisRecord.questionType - 题型
 * @param {string} analysisRecord.mode - 模式（deep/standard）
 * @param {object} analysisRecord.result - 分析结果（JSON）
 * @param {string} analysisRecord.modelUsed - 使用的模型
 */
export function exportAsPrint(analysisRecord) {
  if (analysisRecord.questions && analysisRecord.questions.length > 1) {
    exportBatchAsPrint(analysisRecord);
    return;
  }

  const { timestamp, questionType, mode, result, modelUsed } = analysisRecord;
  const time = formatDateTime(timestamp);
  const modeLabel = mode === 'deep' ? '深度模式' : '标准模式';
  const r = result || {};

  let individualHtml = '';
  if (r.个体诊断 && r.个体诊断.length > 0) {
    for (const student of r.个体诊断) {
      individualHtml += `
        <div class="student-card">
          <h3>${escapeHtml(student.学生标识 || '未知')}${formatStudentScore(student, r.满分)}</h3>
          <div class="field">
            <span class="label">识别原文：</span>
            <span>${escapeHtml(student.识别原文 || '')}</span>
          </div>
          ${student.无失分
            ? '<p style="color:#4caf50;font-weight:bold;">✅ 无失分</p>'
            : buildFailPointsTable(student.失分点)}
        </div>`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>阅读诊断报告 - ${escapeHtml(questionType || '')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif;
      color: #333; padding: 40px; line-height: 1.6;
      max-width: 900px; margin: 0 auto;
    }
    h1 { text-align: center; color: #1a237e; margin-bottom: 8px; font-size: 22px; }
    .meta { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
    .meta span { margin: 0 12px; }
    .section-title {
      font-size: 16px; font-weight: bold; color: #1a237e;
      border-bottom: 2px solid #1a237e; padding-bottom: 4px;
      margin: 24px 0 12px;
    }
    .info-grid {
      display: grid; grid-template-columns: 120px 1fr;
      gap: 8px 16px; margin-bottom: 20px; font-size: 14px;
    }
    .info-grid .label { font-weight: bold; color: #555; }
    .student-card {
      border: 1px solid #e0e0e0; border-radius: 8px;
      padding: 16px; margin-bottom: 16px; background: #fafafa;
    }
    .student-card h3 { color: #333; font-size: 15px; margin-bottom: 8px; }
    .student-card .field { font-size: 13px; margin-bottom: 6px; }
    .student-card .field .label { font-weight: bold; }
    table {
      width: 100%; border-collapse: collapse;
      font-size: 13px; margin-top: 8px;
    }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    tr:nth-child(even) { background: #fafafa; }
    @media print {
      body { padding: 20px; }
      .student-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>📊 阅读诊断报告</h1>
  <div class="meta">
    <span>📅 ${escapeHtml(time)}</span>
    <span>📝 ${escapeHtml(questionType || '未知题型')}</span>
    <span>⚙️ ${escapeHtml(modeLabel)}</span>
    <span>🤖 ${escapeHtml(modelUsed || '')}</span>
  </div>

  <div class="section-title">📋 基本信息</div>
  <div class="info-grid">
    <span class="label">题型：</span><span>${escapeHtml(r.题型 || questionType || '')}</span>
    <span class="label">题型置信度：</span><span>${escapeHtml(r.题型置信度 || '')}</span>
    <span class="label">题型状态：</span><span>${escapeHtml(r.题型状态 || '')}</span>
    ${r.满分 != null ? `<span class="label">本题满分：</span><span>${escapeHtml(String(r.满分))}</span>` : ''}
    ${r.给分标准来源 ? `<span class="label">给分标准来源：</span><span>${escapeHtml(r.给分标准来源)}</span>` : ''}
    <span class="label">内容核实范围：</span><span>${escapeHtml(r.内容核实范围 || '')}</span>
  </div>

  <div class="section-title">🧑‍🎓 个体诊断</div>
  ${individualHtml || '<p>暂无个体诊断数据</p>'}

  <div class="section-title">📈 群体汇总</div>
  ${buildGroupSummaryTable(r.群体汇总)}
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }
}

function exportBatchAsPrint(analysisRecord) {
  const { timestamp, mode, modelUsed, questions } = analysisRecord;
  const time = formatDateTime(timestamp);
  const modeLabel = mode === 'deep' ? '深度模式' : '标准模式';

  const questionHtml = (questions || []).map(question => {
    const r = question.result || {};
    let individualHtml = '';
    if (r.个体诊断 && r.个体诊断.length > 0) {
      for (const student of r.个体诊断) {
        individualHtml += `
          <div class="student-card">
            <h4>${escapeHtml(student.学生标识 || '学生')}${formatStudentScore(student, r.满分)}</h4>
            <div class="field">
              <span class="label">识别原文：</span>
              <span>${escapeHtml(student.识别原文 || '')}</span>
            </div>
            ${student.无失分
              ? '<p style="color:#4caf50;font-weight:bold;">✅ 无失分</p>'
              : buildFailPointsTable(student.失分点)}
          </div>`;
      }
    }

    return `
      <section class="question-block">
        <h2>第 ${question.index} 题：${escapeHtml(question.questionType || r.题型 || '未知题型')}</h2>
        <div class="info-grid">
          <span class="label">题目：</span><span>${escapeHtml(question.inputs?.question || '')}</span>
          <span class="label">参考答案：</span><span>${escapeHtml(question.inputs?.referenceAnswer || '')}</span>
          <span class="label">学生作答：</span><span>${escapeHtml((question.inputs?.studentAnswers || []).join('\n\n'))}</span>
          <span class="label">题型置信度：</span><span>${escapeHtml(r.题型置信度 || '')}</span>
          <span class="label">题型状态：</span><span>${escapeHtml(r.题型状态 || '')}</span>
          ${r.满分 != null ? `<span class="label">本题满分：</span><span>${escapeHtml(String(r.满分))}</span>` : ''}
          ${r.给分标准来源 ? `<span class="label">给分标准来源：</span><span>${escapeHtml(r.给分标准来源)}</span>` : ''}
        </div>
        ${individualHtml || '<p>暂无个体诊断数据</p>'}
        ${buildGroupSummaryTable(r.群体汇总)}
      </section>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>阅读批量诊断报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif;
      color: #333; padding: 40px; line-height: 1.6;
      max-width: 960px; margin: 0 auto;
    }
    h1 { text-align: center; color: #1a237e; margin-bottom: 8px; font-size: 22px; }
    h2 { color: #1a237e; font-size: 17px; margin-bottom: 12px; }
    h4 { color: #333; font-size: 15px; margin-bottom: 8px; }
    .meta { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
    .meta span { margin: 0 12px; }
    .question-block {
      border: 1px solid #ddd; border-radius: 8px;
      padding: 18px; margin-bottom: 22px; break-inside: avoid;
    }
    .info-grid {
      display: grid; grid-template-columns: 120px 1fr;
      gap: 8px 16px; margin-bottom: 18px; font-size: 14px;
      white-space: pre-wrap;
    }
    .label { font-weight: bold; color: #555; }
    .student-card {
      border: 1px solid #e0e0e0; border-radius: 8px;
      padding: 14px; margin-bottom: 14px; background: #fafafa;
    }
    .field { font-size: 13px; margin-bottom: 6px; }
    table {
      width: 100%; border-collapse: collapse;
      font-size: 13px; margin-top: 8px;
    }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    tr:nth-child(even) { background: #fafafa; }
    @media print {
      body { padding: 20px; }
      .question-block, .student-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>📊 阅读批量诊断报告</h1>
  <div class="meta">
    <span>📅 ${escapeHtml(time)}</span>
    <span>📝 共 ${(questions || []).length} 题</span>
    <span>⚙️ ${escapeHtml(modeLabel)}</span>
    <span>🤖 ${escapeHtml(modelUsed || '')}</span>
  </div>
  ${questionHtml}
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }
}

/**
 * 以 JSON 文件方式导出诊断报告
 * 创建 Blob 并触发浏览器下载
 * @param {object} analysisRecord - 分析记录
 */
export function exportAsJSON(analysisRecord) {
  const { questionType, timestamp } = analysisRecord;
  const dateStr = formatDateTime(timestamp).replace(/[:\s]/g, '_');
  const typeName = questionType || '未知题型';
  const fileName = `诊断报告_${typeName}_${dateStr}.json`;

  const jsonStr = JSON.stringify(analysisRecord, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // 清理
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
