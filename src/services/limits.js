/**
 * 每日使用次数限制管理
 * 深度模式：3 次/天
 * 标准模式：10 次/天
 */

import { formatDate } from '../utils/helpers.js';

const STORAGE_KEY = 'fxai_usage_limits';

/** 各模式每日限额 */
const LIMITS = {
  deep: 3,
  standard: 10,
};

/**
 * 本地混淆加密函数 (Salt-Shuffled Base64)
 */
function obfuscate(str) {
  try {
    const utf8Bytes = new TextEncoder().encode(str);
    const base64 = btoa(String.fromCharCode(...utf8Bytes));
    // 在 Base64 数据前后注入无意义盐值，并反转字符串
    return 'fx_salt_' + base64.split('').reverse().join('') + '_hash';
  } catch {
    return btoa(str);
  }
}

/**
 * 本地解密还原函数
 */
function deobfuscate(str) {
  try {
    if (!str.startsWith('fx_salt_') || !str.endsWith('_hash')) {
      throw new Error('解密格式异常');
    }
    const clean = str.substring(8, str.length - 5);
    const reversed = clean.split('').reverse().join('');
    const binary = atob(reversed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    throw new Error('解密还原失败: ' + e.message);
  }
}

/**
 * 获取今日的使用数据
 * 如果存储的日期不是今天，自动重置
 * @returns {{ date: string, deep: number, standard: number }}
 */
function getUsageData() {
  const today = formatDate(new Date());

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: today, deep: 0, standard: 0 };

    const decrypted = deobfuscate(raw);
    const data = JSON.parse(decrypted);
    // 日期不是今天，自动重置
    if (data.date !== today) {
      return { date: today, deep: 0, standard: 0 };
    }
    return {
      date: today,
      deep: data.deep || 0,
      standard: data.standard || 0,
    };
  } catch (err) {
    // 篡改或解析失败，重置为今日初始值
    const initial = { date: today, deep: 0, standard: 0 };
    saveUsageData(initial);
    return initial;
  }
}

/**
 * 保存使用数据
 * @param {{ date: string, deep: number, standard: number }} data
 */
function saveUsageData(data) {
  const raw = JSON.stringify(data);
  localStorage.setItem(STORAGE_KEY, obfuscate(raw));
}

/**
 * 检查指定模式今日是否还可以使用
 * @param {'deep'|'standard'} mode
 * @returns {boolean}
 */
export function canUse(mode) {
  const data = getUsageData();
  const limit = LIMITS[mode];
  if (limit === undefined) return false;
  return (data[mode] || 0) < limit;
}

/**
 * 获取指定模式今日剩余次数
 * @param {'deep'|'standard'} mode
 * @returns {number}
 */
export function getRemaining(mode) {
  const data = getUsageData();
  const limit = LIMITS[mode];
  if (limit === undefined) return 0;
  const used = data[mode] || 0;
  return Math.max(0, limit - used);
}

/**
 * 获取指定模式的每日限额
 * @param {'deep'|'standard'} mode
 * @returns {number}
 */
export function getLimit(mode) {
  return LIMITS[mode] || 0;
}

/**
 * 记录一次使用（消耗一次配额）
 * @param {'deep'|'standard'} mode
 */
export function recordUsage(mode) {
  const data = getUsageData();
  if (!(mode in LIMITS)) return;
  data[mode] = (data[mode] || 0) + 1;
  saveUsageData(data);
}

/**
 * 获取今日各模式的已使用次数
 * @returns {{ deep: number, standard: number }}
 */
export function getTodayUsage() {
  const data = getUsageData();
  return {
    deep: data.deep || 0,
    standard: data.standard || 0,
  };
}
