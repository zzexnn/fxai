const AUTH_BASE = `${import.meta.env.BASE_URL}api/auth`.replace(/\/+$/, '');
const TOKEN_KEY = 'fxai_auth_token';
const USER_KEY = 'fxai_auth_user';

let currentUser = null;

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getCurrentUser() {
  if (currentUser) return currentUser;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    currentUser = JSON.parse(raw);
    return currentUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function storeSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  currentUser = user;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  currentUser = null;
}

export function authHeaders(extra = {}) {
  const token = getAuthToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchWithAuth(url, options = {}) {
  const headers = authHeaders(options.headers || {});
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth-required'));
  }

  return res;
}

export async function login(username, password) {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `登录失败: ${res.status}`);
  }

  storeSession(data);
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: data.user }));
  return data.user;
}

export async function applyAccount({ username, password, organization, reason }) {
  const res = await fetch(`${AUTH_BASE}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, organization, reason }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `申请提交失败: ${res.status}`);
  }

  return data.request;
}

export async function logout() {
  try {
    await fetchWithAuth(`${AUTH_BASE}/logout`, { method: 'POST' });
  } catch {
    // 本地退出优先，不因网络失败阻断。
  } finally {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth-changed'));
  }
}

export async function refreshSession() {
  const token = getAuthToken();
  if (!token) return null;

  const res = await fetchWithAuth(`${AUTH_BASE}/me`);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.user) {
    storeSession({ token, user: data.user });
    return data.user;
  }
  return null;
}
