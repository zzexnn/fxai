/**
 * 题型自动匹配器
 * 根据题目文本中的关键词命中情况，匹配最可能的题型
 */

import { QUESTION_TYPES } from '../data/question-types.js';

/**
 * 从识别前提中提取用于匹配的关键词
 * 将前提描述拆分为可检索的短语
 * @param {string} premise - 识别前提文本
 * @returns {string[]}
 */
function extractPremiseKeywords(premise) {
  if (!premise) return [];
  // 提取前提中有意义的短词/短语，用于在题目文本中检索
  // 去除常见的修饰词和连接词
  const stopWords = ['要求', '否则', '不属于', '此题型', '必须', '出现', '题中'];
  // 按标点和空格拆分
  const segments = premise.split(/[,，。、/()（）]/);
  const keywords = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.length >= 2 && !stopWords.some(sw => trimmed === sw)) {
      keywords.push(trimmed);
    }
  }
  return keywords;
}

/**
 * 检查识别前提是否被满足
 * @param {string} premise - 识别前提
 * @param {string} text - 题目文本
 * @returns {boolean}
 */
function checkPremise(premise, text) {
  if (!premise) return true;
  const keywords = extractPremiseKeywords(premise);
  if (keywords.length === 0) return true;
  // 前提关键词中至少有一个在文本中出现
  return keywords.some(kw => text.includes(kw));
}

/**
 * 匹配题目文本对应的题型
 *
 * 逻辑：
 * 1. 每个题型统计「识别关键词」在 questionText 中的命中数作为 score
 * 2. 如果「识别前提」中的关键词也命中，score += 2（加权）
 * 3. 按 score 降序排列
 * 4. 最高分且满足前提 → confidence: 'high'
 * 5. 最高分但不满足前提 → confidence: 'medium'
 * 6. 最高分有多个并列 → confidence: 'low'
 * 7. 所有 score === 0 → confidence: 'none', type: null
 *
 * @param {string} questionText - 题目文本
 * @returns {{ type: string|null, confidence: 'high'|'medium'|'low'|'none', candidates: Array<{type: string, score: number}> }}
 */
export function matchQuestionType(questionText) {
  if (!questionText || typeof questionText !== 'string') {
    return { type: null, confidence: 'none', candidates: [] };
  }

  const text = questionText.trim();
  const candidates = [];

  for (const qt of QUESTION_TYPES) {
    let score = 0;

    // 统计识别关键词命中数
    for (const keyword of qt.识别关键词) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }

    // 检查识别前提是否满足，满足则加权
    const premiseMet = checkPremise(qt.识别前提, text);
    if (premiseMet && score > 0) {
      score += 2;
    }

    candidates.push({
      type: qt.题型,
      score,
      premiseMet,
    });
  }

  // 按 score 降序排列
  candidates.sort((a, b) => b.score - a.score);

  // 构建返回结果（不暴露 premiseMet 内部字段到外部）
  const resultCandidates = candidates.map(({ type, score }) => ({ type, score }));

  // 所有 score 都是 0
  if (candidates[0].score === 0) {
    return { type: null, confidence: 'none', candidates: resultCandidates };
  }

  const topScore = candidates[0].score;
  const topCandidates = candidates.filter(c => c.score === topScore);

  // 多个并列最高分 → low
  if (topCandidates.length > 1) {
    return {
      type: topCandidates[0].type,
      confidence: 'low',
      candidates: resultCandidates,
    };
  }

  // 唯一最高分
  const best = topCandidates[0];
  const confidence = best.premiseMet ? 'high' : 'medium';

  return {
    type: best.type,
    confidence,
    candidates: resultCandidates,
  };
}
