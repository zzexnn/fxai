/**
 * App Shell — 导航栏 + 页面容器 + Hash 路由
 */

import { renderAnalysisPage } from './pages/analysis.js';
import { renderHistoryPage } from './pages/history.js';
import { renderSettingsPage } from './pages/settings.js';
import { getRemaining, getLimit } from './services/limits.js';

const routes = {
  '#analysis': { render: renderAnalysisPage, label: '答案诊断', icon: '🔍' },
  '#history':  { render: renderHistoryPage,  label: '分析记录', icon: '📋' },
  '#settings': { render: renderSettingsPage, label: '设置',     icon: '⚙️' },
};

let pageContainer = null;

/**
 * 创建并挂载应用
 * @param {HTMLElement} rootEl - 挂载点 #app
 */
export function createApp(rootEl) {
  // 导航栏
  const nav = document.createElement('nav');
  nav.className = 'nav no-print';

  nav.innerHTML = `
    <div class="nav__brand">
      <div class="nav__brand-icon">诊</div>
      <span>阅读诊断助手</span>
    </div>
    <div class="nav__links">
      ${Object.entries(routes).map(([hash, { label, icon }]) =>
        `<a class="nav__link" href="${hash}" data-route="${hash}">${icon} ${label}</a>`
      ).join('')}
    </div>
    <div class="nav__right">
      <div class="nav__usage" id="nav-usage">
        <span class="nav__usage-item">
          <span class="nav__usage-dot nav__usage-dot--deep"></span>
          深度 <span id="nav-deep-count">${getRemaining('deep')}/${getLimit('deep')}</span>
        </span>
        <span class="nav__usage-item">
          <span class="nav__usage-dot nav__usage-dot--standard"></span>
          标准 <span id="nav-std-count">${getRemaining('standard')}/${getLimit('standard')}</span>
        </span>
      </div>
    </div>
  `;

  rootEl.appendChild(nav);

  // 页面容器
  pageContainer = document.createElement('main');
  pageContainer.className = 'main';
  pageContainer.id = 'page-container';
  rootEl.appendChild(pageContainer);

  // 路由逻辑
  const navigate = () => {
    const hash = window.location.hash || '#analysis';
    const route = routes[hash] || routes['#analysis'];

    // 更新导航高亮
    nav.querySelectorAll('.nav__link').forEach(link => {
      link.classList.toggle('nav__link--active', link.dataset.route === hash);
    });

    // 渲染页面
    route.render(pageContainer);
  };

  window.addEventListener('hashchange', navigate);

  // 监听使用量变化事件
  window.addEventListener('usage-changed', refreshUsageDisplay);

  // 默认路由
  if (!window.location.hash) {
    window.location.hash = '#analysis';
  } else {
    navigate();
  }
}

/**
 * 刷新导航栏使用量显示
 */
export function refreshUsageDisplay() {
  const deepEl = document.querySelector('#nav-deep-count');
  const stdEl = document.querySelector('#nav-std-count');
  if (deepEl) deepEl.textContent = `${getRemaining('deep')}/${getLimit('deep')}`;
  if (stdEl) stdEl.textContent = `${getRemaining('standard')}/${getLimit('standard')}`;
}
