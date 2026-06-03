/**
 * 设置页面
 * 使用统计 + 服务状态检测
 */

import { testOcrConnection } from '../services/ocr.js';
import { testAnalyzerConnection } from '../services/analyzer.js';
import { getTodayUsage, getLimit } from '../services/limits.js';
import { Toast } from '../components/toast.js';

/**
 * 渲染设置页面
 * @param {HTMLElement} container
 */
export function renderSettingsPage(container) {
  container.innerHTML = '';

  const usage = getTodayUsage();
  const deepLimit = getLimit('deep');
  const stdLimit = getLimit('standard');

  container.innerHTML = `
    <h2 style="margin-bottom:var(--space-6);">设置</h2>

    <div class="settings-section">
      <div class="settings-section__title">📊 今日使用统计</div>
      <div class="settings-section__desc">使用次数每日零点自动重置</div>
      <div class="stats-grid" style="margin-top:var(--space-4);">
        <div class="stat-card">
          <div class="stat-card__value">${usage.deep}/${deepLimit}</div>
          <div class="stat-card__label">深度分析 (Claude Sonnet 4.6)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${usage.standard}/${stdLimit}</div>
          <div class="stat-card__label">标准分析 (DeepSeek v4pro)</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section__title">🔗 服务状态</div>
      <div class="settings-section__desc">检测后端 API 服务是否正常连接</div>
      <div style="display:flex; gap:var(--space-3); margin-top:var(--space-4);">
        <button class="btn btn--secondary" id="test-ocr-btn">🔍 测试 OCR 服务</button>
        <button class="btn btn--secondary" id="test-analyzer-btn">🤖 测试分析服务</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section__title">ℹ️ 关于</div>
      <div class="settings-section__desc">
        初中语文阅读题答案诊断助手 v1.0<br>
        帮助老师高效分析学生主观题作答中的失分点，定位错因，辅助讲评。
      </div>
    </div>
  `;

  // 测试 OCR 连接
  container.querySelector('#test-ocr-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '测试中...';
    try {
      const result = await testOcrConnection();
      Toast.show(result.message, result.success ? 'success' : 'error');
    } catch (err) {
      Toast.show(`测试失败: ${err.message}`, 'error');
    }
    btn.disabled = false;
    btn.textContent = '🔍 测试 OCR 服务';
  });

  // 测试分析连接
  container.querySelector('#test-analyzer-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '测试中...';
    try {
      const result = await testAnalyzerConnection();
      Toast.show(result.message, result.success ? 'success' : 'error');
    } catch (err) {
      Toast.show(`测试失败: ${err.message}`, 'error');
    }
    btn.disabled = false;
    btn.textContent = '🤖 测试分析服务';
  });
}
