/**
 * 题型知识库
 * 从 readskills.json 导入所有考点数据
 */

import skillsData from '../../readskills.json';

export const QUESTION_TYPES = skillsData;

/**
 * 按考点名称查找考点数据
 * @param {string} pointName - 考点名称
 * @returns {object|null}
 */
export function getQuestionType(pointName) {
  return QUESTION_TYPES.find(t => t.point_name === pointName) || null;
}

/**
 * 获取所有考点名称列表
 * @returns {string[]}
 */
export function getAllTypeNames() {
  return QUESTION_TYPES.map(t => t.point_name);
}
