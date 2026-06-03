/**
 * 题型自动匹配器
 * 根据题目文本与 testing_methods 的相似度匹配最可能的考点
 */

import { QUESTION_TYPES } from '../data/question-types.js';

/**
 * 从 testing_methods 中提取用于匹配的关键词片段
 * @param {string[]} methods - 考法列表
 * @returns {string[]} 提取的关键词
 */
function extractKeywords(methods) {
  if (!methods || methods.length === 0) return [];

  const keywords = new Set();

  for (const method of methods) {
    // 提取中文关键词片段（2-6字）
    // 去除模板占位符（×、……、/等）
    const cleaned = method.replace(/[×…/\\《》""（）()，。？?、\s]+/g, ' ');
    const segments = cleaned.split(' ').filter(s => s.length >= 2 && s.length <= 8);
    segments.forEach(s => keywords.add(s));
  }

  return [...keywords];
}

/**
 * 从考点名称中提取核心词
 * @param {string} pointName
 * @returns {string[]}
 */
function extractNameKeywords(pointName) {
  if (!pointName) return [];
  // 考点名称本身就是高权重关键词
  // 拆分为2-4字的片段
  const results = [pointName];
  const parts = pointName.split(/[的与及和]/);
  parts.forEach(p => {
    const trimmed = p.trim();
    if (trimmed.length >= 2) results.push(trimmed);
  });
  return results;
}

/**
 * 匹配题目文本对应的考点
 *
 * 逻辑：
 * 1. 每个考点：从 point_name 提取核心词（权重 3）+ 从 testing_methods 提取关键词（权重 1）
 * 2. 统计题目文本的关键词命中数作为 score
 * 3. 按 score 降序排列
 * 4. 唯一最高分 → confidence: 'high'
 * 5. 多个并列最高分 → confidence: 'low'
 * 6. 所有 score === 0 → confidence: 'none', type: null
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

    // 考点名称关键词（高权重）
    const nameKws = extractNameKeywords(qt.point_name);
    for (const kw of nameKws) {
      if (text.includes(kw)) {
        score += 3;
      }
    }

    // testing_methods 关键词（标准权重）
    const methodKws = extractKeywords(qt.testing_methods);
    for (const kw of methodKws) {
      if (text.includes(kw)) {
        score += 1;
      }
    }

    candidates.push({
      type: qt.point_name,
      score,
    });
  }

  // 按 score 降序排列
  candidates.sort((a, b) => b.score - a.score);

  // 所有 score 都是 0
  if (candidates[0].score === 0) {
    return { type: null, confidence: 'none', candidates };
  }

  const topScore = candidates[0].score;
  const topCandidates = candidates.filter(c => c.score === topScore);

  // 多个并列最高分 → low
  if (topCandidates.length > 1) {
    return {
      type: topCandidates[0].type,
      confidence: 'low',
      candidates,
    };
  }

  // 唯一最高分
  // 分数足够高 → high，否则 → medium
  const confidence = topScore >= 4 ? 'high' : 'medium';

  return {
    type: topCandidates[0].type,
    confidence,
    candidates,
  };
}
