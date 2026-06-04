/**
 * 智能设备指纹计算组件
 * 基于 Canvas 像素绘制微差与浏览器硬件环境参数生成 32 位唯一设备哈希
 */

/**
 * 快速 32 位哈希算法 (FNV-1a)
 * @param {string} str
 * @returns {string} 16进制表示的 32 位 Hash
 */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 快速整型乘法乘上 FNV 素数 16777619
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 收集 Canvas 图形绘制特征
 * @returns {string} Canvas 图像像素数据的 Base64
 */
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 绘制一些文字，包含不同的字体、颜色、渐变和阴影
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial', 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = '#f60';
    ctx.fillRect(105, 1, 62, 20);

    ctx.fillStyle = '#069';
    ctx.fillText('fxai_reading_diagnose_tool_v1', 2, 2);

    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('中文测试汉字', 4, 17);

    // 渐变与阴影，让不同系统的平滑和抖动引擎渲染出差异
    const gradient = ctx.createLinearGradient(0, 0, 150, 0);
    gradient.addColorStop(0, '#10b981');
    gradient.addColorStop(1, '#6366f1');
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.fillText('CanvasFP!', 5, 32);

    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/**
 * 收集浏览器环境特征
 * @returns {string} 拼接后的环境特征字符串
 */
function getEnvironmentFeatures() {
  const parts = [
    navigator.userAgent || '',
    navigator.language || '',
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    navigator.deviceMemory || 'unknown',
    navigator.maxTouchPoints || 0
  ];
  return parts.join('|');
}

// 缓存的指纹实例
let cachedFingerprint = null;

/**
 * 获取或生成当前设备的 32 位唯一指纹码
 * @returns {string} 指纹字符串，格式为 'fp_xxxxxxxx'
 */
export function getDeviceFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;

  const canvasFeature = getCanvasFingerprint();
  const envFeature = getEnvironmentFeatures();
  const rawFeatureString = canvasFeature + '||' + envFeature;

  const hash = fnv1a(rawFeatureString);
  cachedFingerprint = `fp_${hash}`;
  return cachedFingerprint;
}
