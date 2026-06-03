/**
 * 补救 API 调用服务
 * 复用 /api/analyze 后端接口，只是 Prompt 不同
 */

const ANALYZE_ENDPOINT = '/api/analyze';

const MODELS = {
  deep: 'anthropic/claude-sonnet-4.6',
  standard: 'deepseek/deepseek-v4-pro',
};

/**
 * 从模型返回的文本中提取 JSON
 * @param {string} text
 * @returns {object}
 */
function extractJSON(text) {
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`JSON 解析失败: ${err.message}\n原始内容: ${cleaned.slice(0, 200)}...`);
  }
}

/**
 * 生成变式训练题
 * @param {object} params
 * @param {string} params.systemPrompt - 系统提示词
 * @param {string} params.userContent - 用户消息
 * @param {'deep'|'standard'} params.mode - 分析模式
 * @returns {Promise<{question: string, referenceAnswer: string, focusPoints: string[]}>}
 */
export async function generateVariant({ systemPrompt, userContent, mode }) {
  const model = MODELS[mode] || MODELS.standard;

  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `变式题生成失败: ${res.status}`);
  }

  const data = await res.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('变式题生成返回数据格式异常');
  }

  const result = extractJSON(data.choices[0].message.content);
  if (!result.question || !result.referenceAnswer) {
    throw new Error('变式题结果缺少必要字段 (question/referenceAnswer)');
  }
  return result;
}

/**
 * 生成知识讲解+范例
 * @param {object} params
 * @param {string} params.systemPrompt - 系统提示词
 * @param {string} params.userContent - 用户消息
 * @param {'deep'|'standard'} params.mode - 分析模式
 * @returns {Promise<{technique: string, example: {context: string, question: string, answer: string}, commonMistakes: string[]}>}
 */
export async function generateKnowledge({ systemPrompt, userContent, mode }) {
  const model = MODELS[mode] || MODELS.standard;

  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `知识讲解生成失败: ${res.status}`);
  }

  const data = await res.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('知识讲解返回数据格式异常');
  }

  const result = extractJSON(data.choices[0].message.content);
  if (!result.technique || !result.example) {
    throw new Error('知识讲解结果缺少必要字段 (technique/example)');
  }
  return result;
}
