/**
 * 管理员后台监控页面 (隐藏路由)
 * 提供系统统计指标及详细的埋点/APM 日志报表
 */

import { Toast } from '../components/toast.js';

let statsContainer = null;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 格式化 ISO 时间为易读格式
 * @param {string} isoString
 */
function formatTime(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  } catch {
    return isoString;
  }
}

/**
 * 渲染管理员后台页面
 * @param {HTMLElement} container
 */
export function renderAdminPage(container) {
  statsContainer = container;
  container.innerHTML = '';

  // 页面骨架
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-6);">
      <div>
        <h2 style="margin-bottom:var(--space-2);">📊 系统运行监控后台</h2>
        <p style="font-size:var(--text-sm); color:var(--color-text-secondary);">
          仅授权管理员查看，聚合统计全站访客数、点击行为及 API 性能指标
        </p>
      </div>
      <div style="display:flex; gap:var(--space-2);">
        <button class="btn btn--secondary" id="admin-logout-btn">🔒 退出登录</button>
        <button class="btn btn--accent" id="admin-refresh-btn">🔄 刷新数据</button>
      </div>
    </div>

    <!-- 仪表盘统计区域 -->
    <div class="stats-grid" id="admin-stats-cards" style="margin-bottom:var(--space-6); display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:var(--space-4);">
      <!-- 今日数据 -->
      <div class="stat-card" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:var(--space-5); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-sm);">
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary); text-transform:uppercase; font-weight:var(--font-medium);">今日活跃设备 (UV)</div>
        <div class="stat-card__value" id="admin-today-uv" style="font-size:var(--text-3xl); font-weight:var(--font-bold); color:var(--color-accent); margin:var(--space-3) 0;">-</div>
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary); display:flex; justify-content:space-between;">
          <span id="admin-today-pv">PV 浏览量: -</span>
          <span id="admin-today-active-users">使用设备: -</span>
        </div>
      </div>

      <div class="stat-card" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:var(--space-5); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-sm);">
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary); text-transform:uppercase; font-weight:var(--font-medium);">今日诊断次数 (VV)</div>
        <div class="stat-card__value" id="admin-today-vv" style="font-size:var(--text-3xl); font-weight:var(--font-bold); color:var(--color-accent); margin:var(--space-3) 0;">-</div>
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary);">标准/深度 API 调用成功次数</div>
      </div>

      <!-- 累计数据 -->
      <div class="stat-card" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:var(--space-5); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-sm);">
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary); text-transform:uppercase; font-weight:var(--font-medium);">全站累计设备 (UV)</div>
        <div class="stat-card__value" id="admin-total-uv" style="font-size:var(--text-3xl); font-weight:var(--font-bold); color:var(--color-text-primary); margin:var(--space-3) 0;">-</div>
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary); display:flex; justify-content:space-between;">
          <span id="admin-total-pv">PV 浏览量: -</span>
          <span id="admin-total-active-users">使用设备: -</span>
        </div>
      </div>

      <div class="stat-card" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:var(--space-5); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-sm);">
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary); text-transform:uppercase; font-weight:var(--font-medium);">全站累计诊断 (VV)</div>
        <div class="stat-card__value" id="admin-total-vv" style="font-size:var(--text-3xl); font-weight:var(--font-bold); color:var(--color-text-primary); margin:var(--space-3) 0;">-</div>
        <div style="font-size:var(--text-xs); color:var(--color-text-secondary);">历史所有分析成功次数汇总</div>
      </div>
    </div>

    <!-- 详细日志列表板块 -->
    <div class="card" style="border:1px solid var(--color-border); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-md); margin-bottom:var(--space-6);">
      <div class="card__header" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="card__title">👥 账号与登录记录</div>
      </div>
      <div class="card__body">
        <form id="admin-create-user-form" style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:var(--space-3); align-items:end; margin-bottom:var(--space-5);">
          <div class="form-group">
            <label class="form-label" for="admin-new-username">账号</label>
            <input class="form-input" id="admin-new-username" name="username" autocomplete="off" placeholder="teacher01" pattern="[A-Za-z0-9]{3,32}" title="账号需为 3-32 位，只能包含字母和数字" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-new-display-name">显示名</label>
            <input class="form-input" id="admin-new-display-name" name="displayName" autocomplete="off" placeholder="王老师" />
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-new-password">初始密码</label>
            <input class="form-input" id="admin-new-password" name="password" type="password" autocomplete="new-password" required />
          </div>
          <button class="btn btn--primary" type="submit" id="admin-create-user-btn">创建账号</button>
        </form>
        <div style="margin-bottom:var(--space-5);">
          <h3 style="font-size:var(--text-base); margin-bottom:var(--space-3);">账号申请</h3>
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>申请时间</th>
                  <th>账号</th>
                  <th>单位</th>
                  <th>申请理由</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="admin-account-requests-tbody">
                <tr><td colspan="6" style="text-align:center; color:var(--color-text-secondary);">正在加载申请...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="table-wrapper" style="margin-bottom:var(--space-5);">
          <table class="table">
            <thead>
              <tr>
                <th>账号</th>
                <th>显示名</th>
                <th>角色</th>
                <th>创建时间</th>
                <th>最近登录</th>
              </tr>
            </thead>
            <tbody id="admin-users-tbody">
              <tr><td colspan="5" style="text-align:center; color:var(--color-text-secondary);">正在加载账号...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>账号</th>
                <th>状态</th>
                <th>IP 地址</th>
                <th>设备信息</th>
              </tr>
            </thead>
            <tbody id="admin-logins-tbody">
              <tr><td colspan="5" style="text-align:center; color:var(--color-text-secondary);">正在加载登录记录...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="border:1px solid var(--color-border); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-md);">
      <div class="card__header" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="card__title">🕒 实时操作与 APM 性能日志 (最近 50 条)</div>
      </div>
      <div class="card__body" style="padding:0; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:var(--text-sm);">
          <thead>
            <tr style="background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border);">
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">时间</th>
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">账号</th>
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">设备指纹</th>
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">类型</th>
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">操作/路径/耗时</th>
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">IP地址</th>
              <th style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); font-weight:var(--font-semibold);">详情参数</th>
            </tr>
          </thead>
          <tbody id="admin-logs-tbody">
            <tr>
              <td colspan="7" style="padding:var(--space-6); text-align:center; color:var(--color-text-secondary);">正在加载数据或验证鉴权...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // 绑定事件
  container.querySelector('#admin-refresh-btn').addEventListener('click', loadAdminData);
  container.querySelector('#admin-logout-btn').addEventListener('click', handleLogout);
  container.querySelector('#admin-create-user-form').addEventListener('submit', handleCreateUser);
  container.querySelector('#admin-account-requests-tbody').addEventListener('click', handleAccountRequestAction);

  // 触发数据加载（会检查或弹出密码验证）
  loadAdminData();
}

async function handleAccountRequestAction(event) {
  const button = event.target.closest('[data-request-action]');
  if (!button) return;

  const pwd = sessionStorage.getItem('admin_password');
  if (!pwd) {
    Toast.show('请先完成管理员验证', 'warning');
    loadAdminData();
    return;
  }

  const requestId = button.dataset.requestId;
  const action = button.dataset.requestAction;
  const actionText = action === 'approve' ? '批准' : '拒绝';
  button.disabled = true;
  button.textContent = `${actionText}中...`;

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/admin/account-requests/${requestId}/${action}`.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pwd,
      },
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || `${actionText}失败: ${res.status}`);
    }
    Toast.show(action === 'approve' ? '申请已批准，账号已创建' : '申请已拒绝', 'success');
    loadAdminData();
  } catch (err) {
    Toast.show(err.message, 'error');
    button.disabled = false;
    button.textContent = actionText;
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  const pwd = sessionStorage.getItem('admin_password');
  if (!pwd) {
    Toast.show('请先完成管理员验证', 'warning');
    loadAdminData();
    return;
  }

  const form = event.currentTarget;
  const submitBtn = form.querySelector('#admin-create-user-btn');
  const formData = new FormData(form);
  const payload = {
    username: String(formData.get('username') || '').trim(),
    displayName: String(formData.get('displayName') || '').trim(),
    password: String(formData.get('password') || ''),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = '创建中...';

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/admin/users`.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pwd
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || `创建失败: ${res.status}`);
    }
    Toast.show(`账号 ${payload.username} 已创建`, 'success');
    form.reset();
    loadAdminData();
  } catch (err) {
    Toast.show(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '创建账号';
  }
}

/**
 * 退出登录
 */
function handleLogout() {
  sessionStorage.removeItem('admin_password');
  Toast.show('已退出管理员会话', 'info');
  window.location.hash = '#analysis'; // 弹回主页
}

/**
 * 获取管理员数据
 */
async function loadAdminData() {
  let pwd = sessionStorage.getItem('admin_password');

  if (!pwd) {
    pwd = prompt('🔑 请输入后台管理员访问密码:');
    if (pwd === null) {
      Toast.show('已取消访问，正在跳转回主页...', 'warning');
      window.location.hash = '#analysis';
      return;
    }
    if (!pwd.trim()) {
      Toast.show('密码不能为空！', 'warning');
      loadAdminData();
      return;
    }
    sessionStorage.setItem('admin_password', pwd.trim());
  }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/telemetry/stats`.replace(/\/+$/, ''), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pwd
      }
    });

    if (res.status === 401) {
      sessionStorage.removeItem('admin_password');
      Toast.show('管理员密码错误！', 'error');
      // 重新请求密码
      loadAdminData();
      return;
    }

    if (!res.ok) {
      throw new Error(`服务异常: ${res.status}`);
    }

    const result = await res.json();
    if (result.success && result.data) {
      renderStats(result.data);
    } else {
      throw new Error(result.error || '获取统计失败');
    }
  } catch (err) {
    Toast.show(`加载失败: ${err.message}`, 'error');
    const tbody = document.querySelector('#admin-logs-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding:var(--space-6); text-align:center; color:var(--color-error);">
            数据加载失败: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

/**
 * 渲染后台统计指标及日志列表
 */
function renderStats(data) {
  const { today, total, recentLogs } = data;

  // 1. 填充指标卡片
  const todayUvEl = document.querySelector('#admin-today-uv');
  const todayPvEl = document.querySelector('#admin-today-pv');
  const todayVvEl = document.querySelector('#admin-today-vv');
  const todayActiveEl = document.querySelector('#admin-today-active-users');

  const totalUvEl = document.querySelector('#admin-total-uv');
  const totalPvEl = document.querySelector('#admin-total-pv');
  const totalVvEl = document.querySelector('#admin-total-vv');
  const totalActiveEl = document.querySelector('#admin-total-active-users');

  if (todayUvEl) todayUvEl.textContent = today.uv;
  if (todayPvEl) todayPvEl.textContent = `PV 浏览量: ${today.pv}`;
  if (todayVvEl) todayVvEl.textContent = today.analyzeCount;
  if (todayActiveEl) todayActiveEl.textContent = `使用设备: ${today.analyzeUv}`;

  if (totalUvEl) totalUvEl.textContent = total.uv;
  if (totalPvEl) totalPvEl.textContent = `PV 浏览量: ${total.pv}`;
  if (totalVvEl) totalVvEl.textContent = total.analyzeCount;
  if (totalActiveEl) totalActiveEl.textContent = `使用设备: ${total.analyzeUv}`;

  renderAuthStats(data.auth || {});

  // 2. 填充日志列表
  const tbody = document.querySelector('#admin-logs-tbody');
  if (!tbody) return;

  if (!recentLogs || recentLogs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:var(--space-6); text-align:center; color:var(--color-text-secondary);">
          暂无任何访问日志
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = recentLogs.map(log => {
    let typeTag = '';
    let actionDesc = '-';
    let detailDesc = '-';

    // 根据不同类型解析
    if (log.type === 'pv') {
      typeTag = '<span style="background:rgba(99,102,241,0.1); color:#6366f1; padding:2px 6px; border-radius:4px; font-size:var(--text-xs); font-weight:var(--font-medium);">PV 访问</span>';
      actionDesc = `切换至 ${log.page || '未知页面'}`;
      detailDesc = `路由: ${log.page || '-'}`;
    } else if (log.type === 'action') {
      typeTag = '<span style="background:rgba(245,158,11,0.1); color:#f59e0b; padding:2px 6px; border-radius:4px; font-size:var(--text-xs); font-weight:var(--font-medium);">行为操作</span>';
      actionDesc = `触发动作: ${log.action || '未知'}`;
      if (log.action === 'analyze_success') {
        detailDesc = `诊断成功 (${log.metadata?.mode === 'deep' ? '深度' : '标准'}${log.metadata?.isFromCache ? '/缓存复用' : ''})`;
      } else if (log.action === 'analyze_failed') {
        detailDesc = `<span style="color:var(--color-error);">诊断失败: ${log.metadata?.error || '未知错误'}</span>`;
      } else if (log.action === 'validation_failed') {
        detailDesc = `验证拦截: ${log.metadata?.reason || '-'}`;
      } else if (log.action === 'limit_exceeded') {
        detailDesc = `<span style="color:var(--color-warning);">超配额拦截 (${log.metadata?.mode === 'deep' ? '深度' : '标准'})</span>`;
      } else {
        detailDesc = JSON.stringify(log.metadata) || '-';
      }
    } else if (log.type === 'api_performance') {
      const isSuccess = log.status === 'success';
      typeTag = isSuccess 
        ? '<span style="background:rgba(16,185,129,0.1); color:#10b981; padding:2px 6px; border-radius:4px; font-size:var(--text-xs); font-weight:var(--font-medium);">AI 分析</span>'
        : '<span style="background:rgba(239,68,68,0.1); color:#ef4444; padding:2px 6px; border-radius:4px; font-size:var(--text-xs); font-weight:var(--font-medium);">AI 异常</span>';
      
      actionDesc = `耗时: <strong style="color:var(--color-text-primary);">${log.duration_ms || 0}ms</strong>`;
      
      const charCount = log.char_count ? ` | ${log.char_count}字` : '';
      const modelShort = log.model ? log.model.split('/').pop() : '未知';
      detailDesc = isSuccess
        ? `模型: ${modelShort}${charCount}`
        : `<span style="color:var(--color-error);">错误: ${log.error || '调用出错'} (${modelShort})</span>`;
    }

    const fpShort = log.fingerprint ? log.fingerprint.slice(0, 10) + '..' : '未知';
    const clientIp = log.ip || '-';
    const username = log.username || '-';
    const detailTitle = detailDesc.replace(/<[^>]*>/g, '');

    return `
      <tr style="border-bottom:1px solid var(--color-border); transition:background 0.2s;" onmouseover="this.style.background='var(--color-bg-secondary)'" onmouseout="this.style.background='transparent'">
        <td style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary); white-space:nowrap;">${formatTime(log.timestamp)}</td>
        <td style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary);">${escapeHtml(username)}</td>
        <td style="padding:var(--space-3) var(--space-4); font-family:monospace; color:var(--color-text-secondary);" title="${escapeHtml(log.fingerprint || '')}">${escapeHtml(fpShort)}</td>
        <td style="padding:var(--space-3) var(--space-4);">${typeTag}</td>
        <td style="padding:var(--space-3) var(--space-4);">${actionDesc}</td>
        <td style="padding:var(--space-3) var(--space-4); color:var(--color-text-secondary);">${escapeHtml(clientIp)}</td>
        <td style="padding:var(--space-3) var(--space-4); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--color-text-secondary);" title="${escapeHtml(detailTitle)}">${detailDesc}</td>
      </tr>
    `;
  }).join('');
}

function renderAuthStats(auth) {
  const usersTbody = document.querySelector('#admin-users-tbody');
  const loginsTbody = document.querySelector('#admin-logins-tbody');
  const requestsTbody = document.querySelector('#admin-account-requests-tbody');

  if (requestsTbody) {
    const requests = auth.accountRequests || [];
    requestsTbody.innerHTML = requests.length
      ? requests.map(request => {
          const status = request.status || 'pending';
          const statusText = status === 'approved' ? '已批准' : status === 'rejected' ? '已拒绝' : '待审核';
          const statusClass = status === 'approved' ? 'badge--success' : status === 'rejected' ? 'badge--danger' : 'badge--warning';
          const actions = status === 'pending'
            ? `
              <div style="display:flex; gap:var(--space-2);">
                <button class="btn btn--primary btn--sm" type="button" data-request-action="approve" data-request-id="${escapeHtml(request.id)}">批准</button>
                <button class="btn btn--secondary btn--sm" type="button" data-request-action="reject" data-request-id="${escapeHtml(request.id)}">拒绝</button>
              </div>
            `
            : `<span style="color:var(--color-text-muted);">${formatTime(request.reviewedAt)}</span>`;
          return `
            <tr>
              <td>${formatTime(request.createdAt)}</td>
              <td><strong>${escapeHtml(request.username)}</strong></td>
              <td>${escapeHtml(request.organization || '-')}</td>
              <td title="${escapeHtml(request.reason || '')}" style="max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(request.reason || '-')}</td>
              <td><span class="badge ${statusClass}">${statusText}</span></td>
              <td>${actions}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="6" style="text-align:center; color:var(--color-text-secondary);">暂无账号申请</td></tr>';
  }

  if (usersTbody) {
    const users = auth.users || [];
    usersTbody.innerHTML = users.length
      ? users.map(user => `
          <tr>
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td>${escapeHtml(user.displayName || user.username)}</td>
            <td><span class="badge ${user.role === 'admin' ? 'badge--accent' : 'badge--neutral'}">${escapeHtml(user.role || 'user')}</span></td>
            <td>${formatTime(user.createdAt)}</td>
            <td>${formatTime(user.lastLoginAt)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="text-align:center; color:var(--color-text-secondary);">暂无账号</td></tr>';
  }

  if (loginsTbody) {
    const loginEvents = auth.loginEvents || [];
    loginsTbody.innerHTML = loginEvents.length
      ? loginEvents.map(event => {
          const success = event.status === 'success';
          return `
            <tr>
              <td>${formatTime(event.timestamp)}</td>
              <td>${escapeHtml(event.username || '-')}</td>
              <td><span class="badge ${success ? 'badge--success' : 'badge--danger'}">${success ? '成功' : '失败'}</span></td>
              <td>${escapeHtml(event.ip || '-')}</td>
              <td title="${escapeHtml(event.userAgent || '')}" style="max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(event.userAgent || '-')}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="5" style="text-align:center; color:var(--color-text-secondary);">暂无登录记录</td></tr>';
  }
}
