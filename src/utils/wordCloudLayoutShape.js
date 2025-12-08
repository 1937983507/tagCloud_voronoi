/**
 * 使用 d3-cloud-shape 算法的词云布局函数
 * 用于在加权维诺图的各个子区域内绘制限定边界的词云
 */

import d3CloudShape from './d3CloudShape.js';
import { generateMaskFromRegion, calculateRegionBounds, convertPOIsToWords } from './wordCloudMaskUtils.js';
import { cityNameToPinyin } from './cityNameToPinyin.js';

/**
 * 使用 d3-cloud-shape 算法在单个 Voronoi 区域内布局词云
 * @param {Object} site - 站点信息（包含city, x, y, weight）
 * @param {Array} poiList - 该城市的POI列表
 * @param {Uint8Array} regionPixelMap - 区域像素映射，每个像素存储城市索引
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} cityIndex - 城市索引（在 cityOrder 中的位置）
 * @param {Array} cityOrder - 城市顺序数组
 * @param {Object} fontSettings - 字体设置
 * @param {Object} options - 其他选项
 * @returns {Promise<Array>} 已放置的词云项数组
 */
export function layoutWordCloudWithShape(site, poiList, regionPixelMap, width, height, cityIndex, cityOrder, fontSettings = {}, options = {}) {
  return new Promise((resolve) => {
    if (!poiList || poiList.length === 0) {
      resolve([]);
      return;
    }
    
    const cityName = site.city;
    const minFontSize = fontSettings.minFontSize || 10;
    const maxFontSize = fontSettings.maxFontSize || 40;
    const fontFamily = fontSettings.fontFamily || 'Arial';
    const fontWeight = fontSettings.fontWeight || '700';
    const language = fontSettings.language || 'zh';
    const showCityIndex = fontSettings.showCityIndex || false;
    
    // 计算区域边界框（用于优化掩膜生成）
    const regionBounds = calculateRegionBounds(regionPixelMap, width, height, cityIndex);
    
    if (!regionBounds) {
      console.warn(`城市 ${cityName} 的区域为空，无法生成词云`);
      resolve([]);
      return;
    }
    
    // 生成掩膜
    const mask = generateMaskFromRegion(regionPixelMap, width, height, cityIndex, regionBounds);
    
    // 检查掩膜是否为空
    const hasMask = mask.some(row => row.some(cell => cell === 1));
    if (!hasMask) {
      console.warn(`城市 ${cityName} 的掩膜为空，无法生成词云`);
      resolve([]);
      return;
    }
    
    // 计算掩膜的实际尺寸和偏移
    // 注意：掩膜的尺寸应该与 regionBounds 的尺寸一致
    const maskWidth = mask[0] ? mask[0].length : 0;
    const maskHeight = mask.length;
    
    // 计算掩膜的偏移量（与 generateMaskFromRegion 中的计算保持一致）
    // 在 generateMaskFromRegion 中，minX 和 minY 是通过 Math.floor(regionBounds.minX) 计算的
    // 但是，我们需要确保这个偏移量与掩膜生成时使用的值完全一致
    // 重新计算一次，确保一致性
    const maskMinX = Math.max(0, Math.floor(regionBounds.minX));
    const maskMinY = Math.max(0, Math.floor(regionBounds.minY));
    const maskMaxX = Math.min(width, Math.ceil(regionBounds.maxX));
    const maskMaxY = Math.min(height, Math.ceil(regionBounds.maxY));
    const maskOffsetX = maskMinX;
    const maskOffsetY = maskMinY;
    
    // 验证掩膜尺寸与边界框一致（用于调试）
    const expectedWidth = maskMaxX - maskMinX;
    const expectedHeight = maskMaxY - maskMinY;
    if (Math.abs(maskWidth - expectedWidth) > 1 || Math.abs(maskHeight - expectedHeight) > 1) {
      console.warn(`城市 ${cityName}: 掩膜尺寸可能不匹配！掩膜: ${maskWidth}x${maskHeight}, 期望: ${expectedWidth}x${expectedHeight}, 边界框: [${regionBounds.minX}, ${regionBounds.minY}] - [${regionBounds.maxX}, ${regionBounds.maxY}]`);
    }
    
    // 调试信息：输出第一个城市的掩膜信息
    if (cityName === cityOrder[0]) {
      console.log(`[${cityName}] 掩膜信息:`, {
        maskSize: [maskWidth, maskHeight],
        maskOffset: [maskOffsetX, maskOffsetY],
        regionBounds: regionBounds,
        expectedSize: [expectedWidth, expectedHeight]
      });
    }
    
    // 转换POI数据为words格式
    let displayCityName = cityName;
    if (language === 'en') {
      displayCityName = cityNameToPinyin(cityName);
    }
    
    const words = convertPOIsToWords(poiList, {
      cityName,
      minFontSize,
      maxFontSize,
      includeCityName: true,
      displayCityName,
      cityNameToPinyin,
      language,
      showCityIndex,
      cityOrder
    });
    
    if (words.length === 0) {
      resolve([]);
      return;
    }
    
    // 创建 d3-cloud-shape 布局
    const layout = d3CloudShape()
      .size([maskWidth, maskHeight])  // 使用掩膜的尺寸
      .words(words)
      .padding(1)
      .rotate(() => 0)  // 不旋转
      .font(fontFamily)
      .fontWeight(fontWeight)
      .fontSize(d => {
        // d3-cloud-shape 的 fontSize 函数应该返回字体大小
        // 如果 words 中有 size 字段，直接使用；否则使用 value 计算
        return d.size || Math.sqrt(d.value || 100);
      })
      .random(() => 0.5)  // 从中心开始搜索
      .timeInterval(10)  // 每帧最多10ms
      .mask(mask);  // 设置掩膜
    
    // 创建临时canvas用于布局计算
    const tempCanvas = document.createElement('canvas');
    layout.canvas(() => tempCanvas);
    
    const placedItems = [];
    
    // 监听词云布局事件
    layout.on('word', function(word) {
      // word.x / word.y: 以掩膜中心为原点的偏移值
      // 当前掩膜已经放置到 regionBounds 的左上角，所以直接+offset即可
      const canvasX = maskOffsetX + word.x;
      const canvasY = maskOffsetY + word.y;
      
      // 调试（可选）
      // if (placedItems.length === 0) {
      //   console.log(`[${cityName}] 坐标转换调试:`, {
      //     wordXY: [word.x, word.y],
      //     maskOffset: [maskOffsetX, maskOffsetY],
      //     canvasXY: [canvasX, canvasY],
      //     maskSize: [maskWidth, maskHeight],
      //     regionBounds: regionBounds
      //   });
      // }
      
      placedItems.push({
        text: word.text,
        x: canvasX,
        y: canvasY,
        size: word.size,
        width: word.width || 0,
        height: word.height || 0,
        popularity: word.value || 0,
        isCity: word.isCity || false,
        city: word.city || cityName
      });
    });
    
    layout.on('end', function(placedWords, bounds) {
      // 布局完成
      resolve(placedItems);
    });
    
    // 开始布局
    layout.start();
  });
}

/**
 * 批量使用 d3-cloud-shape 算法在多个 Voronoi 区域内布局词云
 * @param {Array} sites - 站点数组
 * @param {Object} data - 编译后的数据（按城市分组）
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} cityOrder - 城市顺序数组
 * @param {Object} fontSettings - 字体设置
 * @param {Function} progressCallback - 进度回调函数 (cityIndex, cityName, placedCount) => void
 * @returns {Promise<Array>} 所有已放置的词云项数组
 */
export async function layoutWordCloudsWithShape(sites, data, regionPixelMap, width, height, cityOrder, fontSettings = {}, progressCallback = null) {
  const allPlacedItems = [];
  
  for (let siteIndex = 0; siteIndex < sites.length; siteIndex++) {
    const site = sites[siteIndex];
    const cityIndex = cityOrder.indexOf(site.city);
    
    if (cityIndex === -1) {
      console.warn(`城市 ${site.city} 不在 cityOrder 中，跳过`);
      continue;
    }
    
    const cityPOIs = data[site.city] || [];
    
    // 调用单个城市的布局函数
    const placedItems = await layoutWordCloudWithShape(
      site,
      cityPOIs,
      regionPixelMap,
      width,
      height,
      cityIndex,
      cityOrder,
      fontSettings
    );
    
    allPlacedItems.push(...placedItems);
    
    // 调用进度回调
    if (progressCallback) {
      progressCallback(siteIndex, site.city, placedItems.length);
    }
  }
  
  return allPlacedItems;
}

