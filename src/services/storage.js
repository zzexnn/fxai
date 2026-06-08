/**
 * 本地存储服务
 * 封装 localStorage，提供历史记录 CRUD
 */

const STORAGE_KEYS = {
  HISTORY: 'fxai_history',
};

/** 历史记录最大保存条数 */
const MAX_HISTORY = 50;

// ==================== 历史记录管理 ====================

/**
 * 获取所有历史记录（按时间倒序）
 * @returns {Array<object>}
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 确保按时间倒序
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
}

/**
 * 添加一条历史记录
 * 自动限制总条数不超过 MAX_HISTORY，超出时删除最旧的
 * @param {object} record - 诊断记录
 */
export function addHistory(record) {
  const list = getHistory();
  // 插入到头部（最新的在前）
  list.unshift(record);
  // 超出上限时截断
  if (list.length > MAX_HISTORY) {
    list.length = MAX_HISTORY;
  }
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
}

/**
 * 根据 ID 获取单条历史记录
 * @param {string} id - 记录 ID
 * @returns {object|null}
 */
export function getHistoryById(id) {
  const list = getHistory();
  return list.find(r => r.id === id) || null;
}

/**
 * 根据 ID 删除一条历史记录
 * @param {string} id - 记录 ID
 */
export function deleteHistory(id) {
  const list = getHistory();
  const filtered = list.filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(filtered));
}

/**
 * 清空所有历史记录
 */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.HISTORY);
}

/**
 * 检查是否有完全相同输入的缓存结果
 * @param {object} inputs - 包含 question, article, referenceAnswer, studentAnswers 的输入对象
 * @returns {object|null} 匹配到的已有诊断记录，若无则返回 null
 */
export function findCachedResult(inputs) {
  const list = getHistory();

  for (const record of list) {
    if (Array.isArray(record.questions)) {
      const matchedQuestion = record.questions.find(question => inputsMatch(question.inputs, inputs));
      if (matchedQuestion) {
        return {
          ...matchedQuestion,
          parentId: record.id,
          timestamp: record.timestamp,
        };
      }
    } else if (inputsMatch(record.inputs, inputs)) {
      return record;
    }
  }

  return null;
}

function inputsMatch(recInputs, inputs) {
  if (!recInputs) return false;

  if ((recInputs.question || '').trim() !== (inputs.question || '').trim()) return false;
  if ((recInputs.article || '').trim() !== (inputs.article || '').trim()) return false;
  if ((recInputs.referenceAnswer || '').trim() !== (inputs.referenceAnswer || '').trim()) return false;

  // 分值不同视为不同输入（改了分值需重新评分，不命中旧缓存）
  const normScore = (v) => (v === 0 ? 0 : (v ?? null));
  if (normScore(recInputs.totalScore) !== normScore(inputs.totalScore)) return false;

  const s1 = recInputs.studentAnswers || [];
  const s2 = inputs.studentAnswers || [];
  if (s1.length !== s2.length) return false;

  for (let i = 0; i < s1.length; i++) {
    if ((s1[i] || '').trim() !== (s2[i] || '').trim()) return false;
  }

  return true;
}
