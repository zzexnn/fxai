/**
 * 补救 Prompt 构建器
 * 构建变式题生成和知识讲解的 Prompt
 */

/**
 * 构建变式题生成的系统 Prompt
 * @param {object} skillData - readskills.json 中的考点对象
 * @param {string[]} errorReasons - 学生的失分原因列表
 * @returns {string}
 */
export function buildVariantSystemPrompt(skillData, errorReasons) {
  const errorsStr = errorReasons && errorReasons.length > 0
    ? errorReasons.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '本次诊断无明显失分（学生答题表现优异），请生成一道同考点的巩固练习题。';

  return `# 角色
你是一名初中语文命题助手。你需要根据给定的文章和考点，生成一道变式训练题，帮助学生克服特定的失分问题。

# 考点信息
- 考点名称: ${skillData.point_name}
- 文体: ${skillData.genre}
- 评分维度分类: ${skillData.scoring_points ? skillData.scoring_points.join(', ') : '无'}
- 答题方法: ${skillData.answering_methods.map(m => m.name + ': ' + m.description).join('\n  ')}
- 答题模板: ${skillData.answering_templates.join('\n  ')}

# 学生的失分原因
${errorsStr}

# 要求
1. 变式题必须基于给定的文章内容出题，但不能与原题重复
2. 变式题应针对学生的薄弱环节（如有）或考点核心设计，让学生在练习中弥补失分点或巩固能力
3. 同时给出详细的参考答案，答案必须覆盖所有得分维度
4. 参考答案需逐步展示答题思路，标注每个步骤对应哪个得分维度
5. 给出"关注要点"提醒，帮助学生注意自己容易遗漏或需要加深理解的部分

# 约束
- 题目难度与中考难度持平
- 题目表述清晰、无歧义
- 参考答案规范、完整

# 输出格式
只输出 JSON，不要任何额外文字，不要 Markdown 代码块标记。结构如下:
{
  "question": "变式题题目文本",
  "referenceAnswer": "详细的参考答案（含思路标注）",
  "focusPoints": ["关注要点1", "关注要点2"]
}`;
}

/**
 * 构建变式题生成的用户消息
 * @param {string} article - 文章原文
 * @param {string} originalQuestion - 原始题目
 * @returns {string}
 */
export function buildVariantUserContent(article, originalQuestion) {
  return `【文章原文】：
${article}

【原始题目（不可重复）】：
${originalQuestion}

请基于以上文章，生成一道与原题不同的变式训练题。`;
}

/**
 * 构建知识讲解+范例的系统 Prompt
 * @param {object} skillData - readskills.json 中的考点对象
 * @param {string[]} knowledgeGaps - 学生的知识盲区/审题问题
 * @returns {string}
 */
export function buildKnowledgeSystemPrompt(skillData, knowledgeGaps) {
  const gapsStr = knowledgeGaps && knowledgeGaps.length > 0
    ? knowledgeGaps.map((g, i) => `${i + 1}. ${g}`).join('\n')
    : '本次诊断无明显知识盲区（学生答题表现优异），请生成一份通用拓展精讲与范例。';

  return `# 角色
你是一名初中语文教学助手。你需要针对 student 在特定考点上暴露的知识盲区，提供清晰的答题技巧讲解和完整的范例。

# 考点信息
- 考点名称: ${skillData.point_name}
- 文体: ${skillData.genre}
- 评分维度分类:
${skillData.scoring_points ? skillData.scoring_points.map(p => `  - ${p}`).join('\n') : '  - 无'}
- 答题方法:
${skillData.answering_methods.map(m => `  - ${m.name}: ${m.description}`).join('\n')}
- 答题模板:
${skillData.answering_templates.map(t => `  - ${t}`).join('\n')}

# 学生的问题
${gapsStr}

# 要求
1. **技巧讲解**：用简明易懂的语言讲解该考点的答题技巧和方法
   - 重点解释学生缺失的知识点（如有），无错因时讲解考点的通识技巧和高频考向
   - 使用"第一步…第二步…"的结构化讲解方式
   - 用通俗语言，避免过于学术化
2. **完整范例**：提供一个典型的范例
   - 范例需包含：语境/背景文段 + 题目 + 标准答案
   - 标准答案需逐步展示答题思路
   - 范例须能针对并覆盖学生缺失的知识点（无错因时提供该考点的典型答题示范）
3. **易错提醒**：列出该考点常见的易错点

# 约束
- 范例难度与中考难度持平
- 讲解需要对初中生来说通俗易懂
- 范例的文段可以自拟，但需要有文学性

# 输出格式
只输出 JSON，不要任何额外文字，不要 Markdown 代码块标记。结构如下:
{
  "technique": "答题技巧讲解文本（可包含换行）",
  "example": {
    "context": "范例的语境/背景文段",
    "question": "范例的题目",
    "answer": "范例的标准答案（含思路标注）"
  },
  "commonMistakes": ["易错点1", "易错点2"]
}`;
}

/**
 * 构建知识讲解的用户消息
 * @param {string} [article] - 文章原文（可选，有则更贴合）
 * @returns {string}
 */
export function buildKnowledgeUserContent(article) {
  if (article) {
    return `以下是学生正在阅读的文章，请结合此文章设计范例（但范例也可以使用自拟文段）：

【文章原文】：
${article}

请根据上述考点信息和学生问题，生成技巧讲解和范例。`;
  }
  return '请根据上述考点信息和学生问题，生成技巧讲解和范例。范例文段请自拟。';
}
