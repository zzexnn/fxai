/**
 * AI 诊断分析服务
 * 通过后端代理调用 OpenRouter API
 */

const ANALYZE_ENDPOINT = `${import.meta.env.BASE_URL}api/analyze`.replace(/\/+$/, '');

const MODELS = {
  deep: 'anthropic/claude-sonnet-4.6',
  standard: 'deepseek/deepseek-v4-pro',
};

/**
 * 从模型返回的文本中提取 JSON
 * @param {string} text - 模型返回的原始文本
 * @returns {object} 解析后的 JSON 对象
 */
function extractJSON(text) {
  let cleaned = text.trim();

  // 移除 markdown 代码块标记
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
 * 验证诊断结果的必要字段
 * @param {object} result - 解析后的 JSON 结果
 * @returns {object} 验证通过的结果
 */
function validateResult(result) {
  const requiredFields = ['题型', '题型置信度', '题型状态', '个体诊断'];
  const missingFields = requiredFields.filter(field => !(field in result));

  if (missingFields.length > 0) {
    throw new Error(`诊断结果缺少必要字段: ${missingFields.join(', ')}`);
  }

  if (!Array.isArray(result.个体诊断)) {
    throw new Error('个体诊断字段应为数组');
  }

  return result;
}

/**
 * 调用 AI 模型进行答题诊断分析
 * @param {object} params
 * @param {string} params.systemPrompt - 系统提示词
 * @param {string} params.userContent - 用户消息内容
 * @param {'deep'|'standard'} params.mode - 分析模式
 * @returns {Promise<object>} 解析后的诊断结果 JSON
 */
export async function analyzeAnswers({ systemPrompt, userContent, mode, fingerprint }) {
  if (!systemPrompt) throw new Error('缺少系统提示词');
  if (!userContent) throw new Error('缺少用户消息内容');

  const model = MODELS[mode] || MODELS.standard;

  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      fingerprint,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `分析请求失败: ${res.status}`);
  }

  const data = await res.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('分析服务返回数据格式异常');
  }

  const content = data.choices[0].message.content;
  const result = extractJSON(content);
  return validateResult(result);
}

/**
 * 测试分析服务连接
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testAnalyzerConnection() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/test/analyzer`.replace(/\/+$/, ''));
    return await res.json();
  } catch (err) {
    return { success: false, message: `连接错误: ${err.message}` };
  }
}
