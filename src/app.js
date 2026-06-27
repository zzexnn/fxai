/**
 * App Shell — 导航栏 + 页面容器 + Hash 路由
 */

import { renderAnalysisPage } from './pages/analysis.js';
import { renderHistoryPage } from './pages/history.js';
import { renderSettingsPage } from './pages/settings.js';
import { renderAdminPage } from './pages/admin.js';
import { getRemaining, getLimit } from './services/limits.js';
import { getDeviceFingerprint } from './services/fingerprint.js';
import { applyAccount, getCurrentUser, login, logout, refreshSession } from './services/auth.js';
import { trackPV } from './utils/telemetry.js';

const routes = {
  '#analysis': { render: renderAnalysisPage, label: '答案诊断', icon: '🔍' },
  '#history':  { render: renderHistoryPage,  label: '分析记录', icon: '📋' },
  '#settings': { render: renderSettingsPage, label: '设置',     icon: '⚙️' },
  '#admin':    { render: renderAdminPage,     label: '系统监控', icon: '📊', hidden: true },
};

let pageContainer = null;
let rootElement = null;
let navElement = null;
let isAppMounted = false;
let hashChangeHandler = null;
let usageChangeHandler = null;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unmountShell() {
  if (hashChangeHandler) {
    window.removeEventListener('hashchange', hashChangeHandler);
    hashChangeHandler = null;
  }
  if (usageChangeHandler) {
    window.removeEventListener('usage-changed', usageChangeHandler);
    usageChangeHandler = null;
  }
  pageContainer = null;
  navElement = null;
  isAppMounted = false;
}

/**
 * 创建并挂载应用
 * @param {HTMLElement} rootEl - 挂载点 #app
 */
export function createApp(rootEl) {
  rootElement = rootEl;
  // 静默初始化设备指纹
  getDeviceFingerprint();

  rootEl.innerHTML = '';
  renderAuthGate();

  window.addEventListener('auth-changed', () => {
    unmountShell();
    rootEl.innerHTML = '';
    if (getCurrentUser()) {
      mountShell(rootEl);
    } else {
      renderAuthGate();
    }
  });

  window.addEventListener('auth-required', () => {
    unmountShell();
    rootEl.innerHTML = '';
    renderLoginScreen('登录已失效，请重新登录');
  });
}

async function renderAuthGate() {
  if (window.location.hash === '#admin') {
    renderAdminStandalone();
    return;
  }

  const cachedUser = getCurrentUser();
  if (!cachedUser) {
    renderLoginScreen();
    return;
  }

  renderLoadingScreen();
  const user = await refreshSession();
  if (user) {
    mountShell(rootElement);
  } else {
    renderLoginScreen('登录已失效，请重新登录');
  }
}

function renderAdminStandalone() {
  rootElement.innerHTML = '';
  const container = document.createElement('main');
  container.className = 'main';
  container.id = 'page-container';
  rootElement.appendChild(container);
  trackPV('#admin');
  renderAdminPage(container);

  hashChangeHandler = () => {
    if (window.location.hash !== '#admin') {
      unmountShell();
      renderAuthGate();
    }
  };
  window.addEventListener('hashchange', hashChangeHandler);
}

function renderLoadingScreen() {
  rootElement.innerHTML = `
    <main class="auth-screen">
      <section class="auth-panel">
        <div class="auth-panel__brand">
          <div class="nav__brand-icon">诊</div>
          <div>
            <h1>阅读诊断助手</h1>
            <p>正在验证登录状态</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderLoginScreen(message = '', mode = 'login') {
  const isApplyMode = mode === 'apply';
  rootElement.innerHTML = `
    <main class="auth-screen">
      <section class="auth-panel ${isApplyMode ? 'auth-panel--wide' : ''}">
        <div class="auth-panel__brand">
          <div class="nav__brand-icon">诊</div>
          <div>
            <h1>阅读诊断助手</h1>
            <p>${isApplyMode ? '填写信息后等待管理员审核' : '请使用管理员分配的账号登录'}</p>
          </div>
        </div>
        <div class="auth-tabs" role="tablist" aria-label="账号入口">
          <button class="auth-tabs__item ${!isApplyMode ? 'auth-tabs__item--active' : ''}" type="button" id="auth-login-tab">登录</button>
          <button class="auth-tabs__item ${isApplyMode ? 'auth-tabs__item--active' : ''}" type="button" id="auth-apply-tab">申请账号</button>
        </div>
        ${isApplyMode ? renderAccountApplyForm(message) : renderLoginForm(message)}
      </section>
    </main>
  `;

  rootElement.querySelector('#auth-login-tab').addEventListener('click', () => renderLoginScreen('', 'login'));
  rootElement.querySelector('#auth-apply-tab').addEventListener('click', () => renderLoginScreen('', 'apply'));

  if (isApplyMode) {
    bindAccountApplyForm();
    return;
  }

  const form = rootElement.querySelector('#login-form');
  const errorEl = rootElement.querySelector('#login-error');
  const submitBtn = rootElement.querySelector('#login-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = '登录中...';

    try {
      await login(username, password);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '登录';
    }
  });
}

function renderLoginForm(message = '') {
  return `
    <form class="auth-form" id="login-form">
      <div class="form-group">
        <label class="form-label" for="login-username">账号</label>
        <input class="form-input" id="login-username" name="username" autocomplete="username" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">密码</label>
        <input class="form-input" id="login-password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <div class="auth-form__error" id="login-error">${escapeHtml(message)}</div>
      <button class="btn btn--primary btn--lg" type="submit" id="login-submit">登录</button>
    </form>
  `;
}

function renderAccountApplyForm(message = '') {
  return `
    <form class="auth-form" id="account-apply-form">
      <div class="auth-form__grid">
        <div class="form-group">
          <label class="form-label" for="apply-username">账号名</label>
          <input class="form-input" id="apply-username" name="username" autocomplete="username" placeholder="teacher01" pattern="[A-Za-z0-9]{3,32}" title="账号需为 3-32 位，只能包含字母和数字" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="apply-password">密码</label>
          <input class="form-input" id="apply-password" name="password" type="password" autocomplete="new-password" minlength="6" required />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="apply-organization">单位</label>
        <input class="form-input" id="apply-organization" name="organization" autocomplete="organization" placeholder="学校 / 教研组 / 机构名称" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="apply-reason">申请理由</label>
        <textarea class="form-input form-textarea auth-form__textarea" id="apply-reason" name="reason" placeholder="请简单说明使用场景或申请原因" required></textarea>
      </div>
      <div class="auth-form__error" id="apply-error">${escapeHtml(message)}</div>
      <button class="btn btn--primary btn--lg" type="submit" id="apply-submit">提交申请</button>
    </form>
  `;
}

function bindAccountApplyForm() {
  const form = rootElement.querySelector('#account-apply-form');
  const errorEl = rootElement.querySelector('#apply-error');
  const submitBtn = rootElement.querySelector('#apply-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      username: String(formData.get('username') || '').trim(),
      password: String(formData.get('password') || ''),
      organization: String(formData.get('organization') || '').trim(),
      reason: String(formData.get('reason') || '').trim(),
    };

    errorEl.classList.remove('auth-form__error--success');
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    try {
      await applyAccount(payload);
      form.reset();
      errorEl.classList.add('auth-form__error--success');
      errorEl.textContent = '申请已提交，请等待管理员审核。审核通过后即可使用该账号登录。';
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '提交申请';
    }
  });
}

function mountShell(rootEl) {
  if (isAppMounted) return;
  isAppMounted = true;

  // 导航栏
  const nav = document.createElement('nav');
  nav.className = 'nav no-print';
  navElement = nav;
  const user = getCurrentUser();
  const displayName = escapeHtml(user?.displayName || user?.username || '已登录');
  const username = escapeHtml(user?.username || '');

  nav.innerHTML = `
    <div class="nav__brand">
      <div class="nav__brand-icon">诊</div>
      <span>阅读诊断助手</span>
    </div>
    <div class="nav__links">
      ${Object.entries(routes)
        .filter(([_, value]) => !value.hidden)
        .map(([hash, { label, icon }]) =>
          `<a class="nav__link" href="${hash}" data-route="${hash}">${icon} ${label}</a>`
        ).join('')}
    </div>
    <div class="nav__right">
      <div class="nav__user" title="${username}">
        ${displayName}
      </div>
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
      <button class="btn btn--secondary btn--sm" id="nav-logout-btn" type="button">退出</button>
    </div>
  `;

  rootEl.appendChild(nav);
  nav.querySelector('#nav-logout-btn').addEventListener('click', () => {
    logout();
  });

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

    // 监测页面访问 (PV)
    trackPV(hash);

    // 渲染页面
    route.render(pageContainer);
  };

  hashChangeHandler = navigate;
  window.addEventListener('hashchange', hashChangeHandler);

  // 监听使用量变化事件
  usageChangeHandler = refreshUsageDisplay;
  window.addEventListener('usage-changed', usageChangeHandler);

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
  if (!navElement) return;
  if (deepEl) deepEl.textContent = `${getRemaining('deep')}/${getLimit('deep')}`;
  if (stdEl) stdEl.textContent = `${getRemaining('standard')}/${getLimit('standard')}`;
}
