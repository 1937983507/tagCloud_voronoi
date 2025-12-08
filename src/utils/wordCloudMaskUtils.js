/**
 * 词云掩膜工具函数
 * 用于从加权维诺图的 regionPixelMap 生成 d3-cloud-shape 所需的掩膜格式
 */

/**
 * 从 regionPixelMap 生成单个城市的掩膜
 * @param {Uint8Array} regionPixelMap - 区域像素映射，每个像素存储城市索引
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} cityIndex - 城市索引（在 cityOrder 中的位置）
 * @param {Object} regionBounds - 可选，区域的边界框 {minX, minY, maxX, maxY}，用于优化性能
 * @returns {Array<Array<number>>} 掩膜二维数组，mask[y][x] = 1 表示允许，0 表示禁止
 */
export function generateMaskFromRegion(regionPixelMap, width, height, cityIndex, regionBounds = null) {
  // 如果提供了区域边界，只生成边界内的掩膜（优化性能）
  let minX = 0, minY = 0, maxX = width, maxY = height;
  if (regionBounds) {
    // 确保边界值是整数，并且掩膜尺寸与边界框一致
    minX = Math.max(0, Math.floor(regionBounds.minX));
    minY = Math.max(0, Math.floor(regionBounds.minY));
    maxX = Math.min(width, Math.ceil(regionBounds.maxX));
    maxY = Math.min(height, Math.ceil(regionBounds.maxY));
  }
  
  // 计算掩膜尺寸（确保是整数）
  const maskWidth = maxX - minX;
  const maskHeight = maxY - minY;
  
  // 创建掩膜数组（初始化为全0）
  const mask = [];
  for (let y = 0; y < maskHeight; y++) {
    mask[y] = new Array(maskWidth).fill(0);
  }
  
  // 遍历区域内的像素，如果属于该城市，设置为1
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const pixelIndex = y * width + x;
      if (regionPixelMap[pixelIndex] === cityIndex) {
        const maskY = y - minY;
        const maskX = x - minX;
        mask[maskY][maskX] = 1;
      }
    }
  }
  
  return mask;
}

/**
 * 计算区域的边界框（用于优化掩膜生成）
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} cityIndex - 城市索引
 * @returns {Object|null} 边界框 {minX, minY, maxX, maxY}，如果区域为空则返回 null
 */
export function calculateRegionBounds(regionPixelMap, width, height, cityIndex) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPixel = false;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      if (regionPixelMap[pixelIndex] === cityIndex) {
        hasPixel = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  if (!hasPixel) {
    return null;
  }
  
  // 添加一些边距，确保边界框包含所有像素
  const margin = 5;
  return {
    minX: Math.max(0, minX - margin),
    minY: Math.max(0, minY - margin),
    maxX: Math.min(width, maxX + margin + 1),
    maxY: Math.min(height, maxY + margin + 1)
  };
}

/**
 * 将 POI 数据转换为 d3-cloud-shape 所需的 words 格式
 * @param {Array} poiList - POI 列表，格式为 [{text, rankInChina, city, ...}, ...]
 * @param {Object} options - 配置选项
 * @param {string} options.cityName - 城市名称
 * @param {number} options.minFontSize - 最小字体大小
 * @param {number} options.maxFontSize - 最大字体大小
 * @param {boolean} options.includeCityName - 是否包含城市名
 * @param {string} options.displayCityName - 显示的城市名（可能包含序号等）
 * @param {Function} options.cityNameToPinyin - 城市名转拼音的函数（可选）
 * @param {string} options.language - 语言设置 'zh' 或 'en'
 * @param {boolean} options.showCityIndex - 是否显示城市序号
 * @param {Array} options.cityOrder - 城市顺序数组（用于计算序号）
 * @returns {Array} words 数组，格式为 [{text, value, size, ...}, ...]
 */
export function convertPOIsToWords(poiList, options = {}) {
  const {
    cityName,
    minFontSize = 10,
    maxFontSize = 40,
    includeCityName = true,
    displayCityName = null,
    cityNameToPinyin = null,
    language = 'zh',
    showCityIndex = false,
    cityOrder = []
  } = options;
  
  const words = [];
  
  // 添加城市名（如果需要）
  if (includeCityName && cityName) {
    let cityDisplayName = displayCityName || cityName;
    
    // 如果需要显示序号
    if (showCityIndex && cityOrder.length > 0) {
      const cityIndex = cityOrder.indexOf(cityName);
      if (cityIndex >= 0) {
        cityDisplayName = `${cityIndex + 1}. ${cityDisplayName}`;
      }
    }
    
    // 城市名使用最大字体，权重最高
    words.push({
      text: cityDisplayName,
      value: 10000, // 使用很大的值确保城市名最大
      size: maxFontSize,
      isCity: true,
      city: cityName
    });
  }
  
  // 过滤出真正属于当前城市的POI
  const filteredPOIs = poiList.filter(poi => {
    if (poi.city !== undefined) {
      return poi.city === cityName;
    }
    return true; // 如果没有city字段，保留（兼容旧数据）
  });
  
  // 按排名排序（排名越小，权重越大）
  const sortedPOIs = [...filteredPOIs].sort((a, b) => {
    const rankA = parseInt(a.rankInChina) || 100000;
    const rankB = parseInt(b.rankInChina) || 100000;
    return rankA - rankB;
  });
  
  // 计算排名的范围（用于映射到字体大小）
  let minRank = 100000;
  let maxRank = 1;
  if (sortedPOIs.length > 0) {
    for (const poi of sortedPOIs) {
      const rank = parseInt(poi.rankInChina) || 100000;
      if (rank < minRank) minRank = rank;
      if (rank > maxRank) maxRank = rank;
    }
  }
  const rankRange = maxRank - minRank || 1;
  
  // 转换POI为words格式
  for (const poi of sortedPOIs) {
    const rank = parseInt(poi.rankInChina) || 100000;
    const normalizedRank = (rank - minRank) / rankRange;
    
    // 排名越小，字体越大（但城市名已经用了maxFontSize，所以POI用maxFontSize-10作为上限）
    const size = minFontSize + (1 - normalizedRank) * (maxFontSize - minFontSize - 10);
    
    // value 用于 d3-cloud-shape 的 fontSize 函数（使用 Math.sqrt(value)）
    // 所以 value 应该是 size 的平方
    const value = size * size;
    
    words.push({
      text: poi.text,
      value: value,
      size: Math.max(minFontSize, Math.min(maxFontSize, size)),
      rank: rank,
      isCity: false,
      city: poi.city || cityName
    });
  }
  
  // 按 size 降序排序（大的先放置）
  words.sort((a, b) => b.size - a.size);
  
  return words;
}

