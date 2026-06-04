import { getDeviceFingerprint } from '../services/fingerprint.js';

const TELEMETRY_ENDPOINT = `${import.meta.env.BASE_URL}api/telemetry`.replace(/\/+$/, '');

/**
 * 上报埋点日志到后端
 * @param {object} payload - 埋点数据
 */
async function reportLog(payload) {
  try {
    const fingerprint = getDeviceFingerprint();
    const data = {
      timestamp: new Date().toISOString(),
      fingerprint,
      ...payload
    };

    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(() => {}); // 忽略网络报错，不影响主要业务体验
  } catch (e) {
    console.warn('[Telemetry] 埋点上报失败:', e);
  }
}

/**
 * 记录 Page View (PV) 页面访问情况
 * @param {string} page - 页面标识 (如 '#analysis')
 */
export function trackPV(page) {
  reportLog({
    type: 'pv',
    page
  });
}

/**
 * 记录行为操作 Action 情况
 * @param {string} action - 操作名称 (如 'click_analyze')
 * @param {object} [metadata] - 伴随参数
 */
export function trackAction(action, metadata = {}) {
  reportLog({
    type: 'action',
    action,
    metadata
  });
}
