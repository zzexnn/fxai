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
 * 获取今日的使用数据
 * 如果存储的日期不是今天，自动重置
 * @returns {{ date: string, deep: number, standard: number }}
 */
function getUsageData() {
  const today = formatDate(new Date());

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: today, deep: 0, standard: 0 };

    const data = JSON.parse(raw);
    // 日期不是今天，自动重置
    if (data.date !== today) {
      return { date: today, deep: 0, standard: 0 };
    }
    return {
      date: today,
      deep: data.deep || 0,
      standard: data.standard || 0,
    };
  } catch {
    return { date: today, deep: 0, standard: 0 };
  }
}

/**
 * 保存使用数据
 * @param {{ date: string, deep: number, standard: number }} data
 */
function saveUsageData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
