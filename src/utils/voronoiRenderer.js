/**
 * Voronoi 渲染工具函数
 * 抽象化 TagCloudCanvas 中的完整渲染逻辑，用于批量测试
 * 确保批量测试使用与原始代码完全相同的算法流程
 */

import axios from 'axios';
import { cityNameToPinyin } from '@/utils/cityNameToPinyin';

// 等待下一帧的工具函数
const waitNextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => resolve());
  } else {
    setTimeout(resolve, 0);
  }
});

// ========== 位图掩码碰撞检测系统（基于d3-cloud算法）==========
// 常量定义（参考d3-cloud）
const SPRITE_CANVAS_WIDTH = 1 << 11 >> 5; // 64
const SPRITE_CANVAS_HEIGHT = 1 << 11; // 2048

/**
 * 获取Canvas上下文和像素比
 */
const getContextAndRatio = (canvas) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  
  // 检测像素比
  canvas.width = canvas.height = 1;
  const ratio = Math.sqrt(context.getImageData(0, 0, 1, 1).data.length >> 2);
  canvas.width = (SPRITE_CANVAS_WIDTH << 5) / ratio;
  canvas.height = SPRITE_CANVAS_HEIGHT / ratio;
  
  context.fillStyle = context.strokeStyle = 'red';
  
  return { context, ratio };
};

/**
 * 生成标签的位图掩码（sprite）
 */
const generateWordSprite = (spriteCtx, spriteRatio, word, padding = 1) => {
  const { text, size, fontFamily, fontWeight } = word;
  
  // 设置字体
  const fontSize = Math.round((size + 1) / spriteRatio);
  spriteCtx.save();
  spriteCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  
  // 测量文字尺寸
  const metrics = spriteCtx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = size * 2; // 估算高度
  
  // 计算实际需要的canvas尺寸（考虑旋转）
  let w = (textWidth + 1) * spriteRatio;
  let h = textHeight;
  
  // 如果没有旋转，宽度需要对齐到32位边界
  w = (w + 0x1f) >> 5 << 5; // 对齐到32的倍数
  
  // 创建临时canvas绘制文字
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.ceil(w);
  tempCanvas.height = Math.ceil(h);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.fillStyle = 'red';
  tempCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  tempCtx.textAlign = 'center';
  tempCtx.textBaseline = 'middle';
  
  // 绘制文字
  tempCtx.fillText(text, w / 2 / spriteRatio, h / 2 / spriteRatio);
  
  // 如果有padding，绘制描边
  if (padding) {
    tempCtx.strokeStyle = 'red';
    tempCtx.lineWidth = 2 * padding;
    tempCtx.strokeText(text, w / 2 / spriteRatio, h / 2 / spriteRatio);
  }
  
  // 读取像素数据生成sprite
  const pixels = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
  const w32 = w >> 5; // 宽度（32位为单位）
  const sprite = new Uint32Array(w32 * h);
  
  // 找到实际有内容的区域（去除上下空白）
  let seenRow = -1;
  let firstSeenRow = -1;
  
  for (let j = 0; j < h; j++) {
    let seen = false;
    for (let i = 0; i < w; i++) {
      const pixelIdx = (j * tempCanvas.width + i) << 2;
      const alpha = pixels[pixelIdx + 3];
      if (alpha > 0) {
        const k = w32 * j + (i >> 5);
        const m = 1 << (31 - (i % 32));
        sprite[k] |= m;
        seen = true;
      }
    }
    if (seen) {
      if (firstSeenRow === -1) firstSeenRow = j;
      seenRow = j;
    }
  }
  
  spriteCtx.restore();
  
  // 如果没有任何内容，返回空sprite
  if (firstSeenRow === -1 || seenRow === -1) {
    return {
      sprite: new Uint32Array(0),
      width: w,
      height: 0,
      x0: -w >> 1,
      y0: -h >> 1,
      x1: w >> 1,
      y1: h >> 1
    };
  }
  
  // 裁剪sprite到实际内容区域
  const actualH = seenRow - firstSeenRow + 1;
  const croppedSprite = new Uint32Array(w32 * actualH);
  for (let j = 0; j < actualH; j++) {
    for (let i = 0; i < w32; i++) {
      croppedSprite[j * w32 + i] = sprite[(firstSeenRow + j) * w32 + i];
    }
  }
  
  // 计算边界框（相对于文字中心点）
  const centerY = h >> 1;
  const x0 = -w >> 1;
  const y0 = firstSeenRow - centerY;
  const x1 = w >> 1;
  const y1 = seenRow - centerY + 1;
  
  return {
    sprite: croppedSprite,
    width: w,
    height: actualH,
    x0,
    y0,
    x1,
    y1
  };
};

/**
 * 初始化位图板（board）
 */
const initBitmapBoard = (width, height) => {
  const boardSize = Math.ceil(width / 32) * height;
  return new Uint32Array(boardSize);
};

/**
 * 使用位运算检测碰撞（基于d3-cloud算法）
 */
const checkCollisionWithBitmap = (tag, board, boardWidth, boardHeight) => {
  const { sprite, width, height, x, y, x0, y0 } = tag;
  
  if (!sprite || sprite.length === 0) {
    return true;
  }
  
  const w = width >> 5;
  const sw = boardWidth >> 5;
  const lx = x - (w << 4);
  const sx = lx & 0x7f;
  const msx = 32 - sx;
  
  const h = height;
  const startY = y + y0;
  const endY = startY + h;
  
  if (startY < 0 || endY > boardHeight || lx < 0 || (lx >> 5) + w + 1 > sw) {
    return true;
  }
  
  let xIdx = startY * sw + (lx >> 5);
  let last = 0;
  
  for (let j = 0; j < h; j++) {
    last = 0;
    for (let i = 0; i <= w; i++) {
      const boardIdx = xIdx + i;
      if (boardIdx < 0 || boardIdx >= board.length) {
        return true;
      }
      
      const spriteValue = i < w ? sprite[j * w + i] : 0;
      const mask = (last << msx) | (i < w ? (spriteValue >>> sx) : 0);
      
      if (mask & board[boardIdx]) {
        return true;
      }
      
      last = spriteValue;
    }
    xIdx += sw;
  }
  
  return false;
};

/**
 * 将标签的sprite写入位图板
 */
const placeTagOnBoard = (tag, board, boardWidth, boardHeight) => {
  const { sprite, width, height, x, y, x0, y0 } = tag;
  
  if (!sprite || sprite.length === 0) {
    return;
  }
  
  const w = width >> 5;
  const sw = boardWidth >> 5;
  const lx = x - (w << 4);
  const sx = lx & 0x7f;
  const msx = 32 - sx;
  
  const h = height;
  const startY = y + y0;
  const endY = startY + h;
  
  if (startY < 0 || endY > boardHeight || lx < 0 || (lx >> 5) + w + 1 > sw) {
    return;
  }
  
  let xIdx = startY * sw + (lx >> 5);
  let last = 0;
  
  for (let j = 0; j < h; j++) {
    last = 0;
    for (let i = 0; i <= w; i++) {
      const boardIdx = xIdx + i;
      if (boardIdx >= 0 && boardIdx < board.length) {
        const spriteValue = i < w ? sprite[j * w + i] : 0;
        const mask = (last << msx) | (i < w ? (spriteValue >>> sx) : 0);
        board[boardIdx] |= mask;
      }
      last = i < w ? sprite[j * w + i] : 0;
    }
    xIdx += sw;
  }
};

/**
 * 检查点是否在指定区域内
 */
const isPointInRegion = (regionPixelMap, cityIndex, x, y, width, height) => {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || px >= width || py < 0 || py >= height) {
    return false;
  }
  const idx = py * width + px;
  return regionPixelMap[idx] === cityIndex;
};

/**
 * 使用阿基米德螺线算法布局词云（使用位图掩码碰撞检测）
 * 这是完整的词云布局算法，与 TagCloudCanvas.vue 中的实现完全一致
 */
const layoutWordCloudWithSpiral = (ctx, city, poiData, regionPixelMap, cityIndex, centroid, width, height, fontSettings, colorIndex, poiStore) => {
  // 准备词云数据：POI + 城市名
  const words = [];
  
  // 计算所有POI的排名范围（用于归一化）
  const ranks = poiData.length > 0 
    ? poiData.map(poi => parseInt(poi.rankInChina) || 100000)
    : [100000];
  const minRank = ranks.length > 0 ? Math.min(...ranks) : 1;
  const maxRank = ranks.length > 0 ? Math.max(...ranks) : 100000;
  const rankRange = maxRank - minRank || 1;
  
  // 设置字体
  const fontFamily = fontSettings.fontFamily || 'Arial';
  const fontWeight = fontSettings.fontWeight || '700';
  
  // 添加POI数据
  poiData.forEach(poi => {
    const rank = parseInt(poi.rankInChina) || 100000;
    const normalizedRank = (rank - minRank) / rankRange;
    const fontSize = fontSettings.minFontSize + 
      (fontSettings.maxFontSize - fontSettings.minFontSize) * (1 - normalizedRank);
    words.push({
      text: poi.text,
      size: Math.max(fontSettings.minFontSize, Math.min(fontSettings.maxFontSize, fontSize)),
      isCity: false,
      fontFamily,
      fontWeight
    });
  });
  
  // 添加城市名（字号比最大字号稍大）
  const maxSize = words.length > 0 
    ? Math.max(...words.map(w => w.size)) 
    : fontSettings.maxFontSize;
  const cityFontSize = Math.min(maxSize * 1.2, fontSettings.maxFontSize * 1.5);
  
  // 处理城市名：根据语言设置和序号显示设置
  let cityName = city;
  if (fontSettings.language === 'en') {
    cityName = cityNameToPinyin(city);
  }
  if (fontSettings.showCityIndex) {
    cityName = `${cityIndex + 1}. ${cityName}`;
  }
  
  words.push({
    text: cityName,
    size: cityFontSize,
    isCity: true,
    fontFamily,
    fontWeight
  });
  
  // 按字号从大到小排序（先放置大字）
  words.sort((a, b) => b.size - a.size);
  
  // ========== 初始化位图掩码碰撞检测系统 ==========
  
  // 创建sprite canvas（用于生成位图掩码）
  const spriteCanvas = document.createElement('canvas');
  const { context: spriteCtx, ratio: spriteRatio } = getContextAndRatio(spriteCanvas);
  
  // 初始化位图板
  const board = initBitmapBoard(width, height);
  
  // 预生成所有标签的sprite（位图掩码）
  const wordsWithSprites = [];
  for (const word of words) {
    try {
      const spriteData = generateWordSprite(spriteCtx, spriteRatio, word, 1);
      wordsWithSprites.push({
        ...word,
        sprite: spriteData.sprite,
        spriteWidth: spriteData.width,
        spriteHeight: spriteData.height,
        spriteX0: spriteData.x0,
        spriteY0: spriteData.y0,
        spriteX1: spriteData.x1,
        spriteY1: spriteData.y1
      });
    } catch (error) {
      console.warn(`生成标签 "${word.text}" 的sprite失败:`, error);
      continue;
    }
  }
  
  // 已放置的标签（用于记录）
  const placedWords = [];
  
  // 阿基米德螺线参数
  const a = 1;
  const b = 0.5;
  const angleStep = 0.05;
  
  // 布局每个词
  for (const word of wordsWithSprites) {
    let placed = false;
    let attempts = 0;
    const maxAttempts = 20000;
    
    let currentAngle = 0;
    
    while (!placed && attempts < maxAttempts) {
      // 计算螺线上的点：r = a + b * θ
      const r = a + b * currentAngle;
      const x = centroid.cx + r * Math.cos(currentAngle);
      const y = centroid.cy + r * Math.sin(currentAngle);
      
      // 检查点是否在区域内
      if (isPointInRegion(regionPixelMap, cityIndex, x, y, width, height)) {
        // 检查标签边界框是否完全在区域内
        const tagX0 = x + word.spriteX0;
        const tagY0 = y + word.spriteY0;
        const tagX1 = x + word.spriteX1;
        const tagY1 = y + word.spriteY1;
        
        // 检查四个角是否都在区域内
        const corners = [
          { x: tagX0, y: tagY0 },
          { x: tagX1, y: tagY0 },
          { x: tagX0, y: tagY1 },
          { x: tagX1, y: tagY1 }
        ];
        
        const allCornersInRegion = corners.every(corner => 
          isPointInRegion(regionPixelMap, cityIndex, corner.x, corner.y, width, height)
        );
        
        if (allCornersInRegion) {
          // 构建标签对象用于碰撞检测
          const tag = {
            sprite: word.sprite,
            width: word.spriteWidth,
            height: word.spriteHeight,
            x: Math.round(x),
            y: Math.round(y),
            x0: word.spriteX0,
            y0: word.spriteY0,
            x1: word.spriteX1,
            y1: word.spriteY1
          };
          
          // 使用位图掩码碰撞检测
          if (!checkCollisionWithBitmap(tag, board, width, height)) {
            // 可以放置，绘制文字
            ctx.save();
            const fontStr = `${word.fontWeight} ${Math.round(word.size)}px ${word.fontFamily}`;
            ctx.font = fontStr;
            
            // 根据标签类型设置颜色：城市名保持红色，POI使用配色窗口的颜色
            const textColorMode = poiStore.colorSettings.textColorMode || 'multi';
            const textSingleColor = poiStore.colorSettings.textSingleColor || 'rgb(0, 0, 0)';
            
            if (word.isCity) {
              ctx.fillStyle = '#ff0000'; // 城市名：红色
            } else {
              if (textColorMode === 'single') {
                ctx.fillStyle = textSingleColor;
              } else {
                const textColor = poiStore.Colors[colorIndex % poiStore.Colors.length];
                ctx.fillStyle = textColor;
              }
            }
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(word.text, x, y);
            ctx.restore();
            
            // 将标签写入位图板
            placeTagOnBoard(tag, board, width, height);
            
            // 记录已放置的标签
            placedWords.push({
              x,
              y,
              width: word.spriteWidth,
              height: word.spriteHeight,
              text: word.text
            });
            
            placed = true;
          }
        }
      }
      
      // 增加角度，继续搜索
      currentAngle += angleStep;
      attempts++;
    }
  }
  
  // 返回布局信息（包含已放置的标签信息）
  return {
    placedCount: placedWords.length,
    words: placedWords.map(w => ({
      ...w,
      isCity: words.find(orig => orig.text === w.text)?.isCity || false,
      size: words.find(orig => orig.text === w.text)?.size || 0,
      fontFamily: words.find(orig => orig.text === w.text)?.fontFamily || fontFamily,
      fontWeight: words.find(orig => orig.text === w.text)?.fontWeight || fontWeight
    }))
  };
};

/**
 * 在各个城市子空间内绘制POI词云
 * 这是完整的词云生成流程，与 TagCloudCanvas.vue 中的实现完全一致
 */
const drawWordCloudsInRegions = async (ctx, regionPixelMap, cityOrder, compiledData, width, height, colorIndices, fontSettings, poiStore) => {
  const wordCloudLayout = {};
  
  // 为每个城市绘制词云
  for (let cityIndex = 0; cityIndex < cityOrder.length; cityIndex++) {
    const city = cityOrder[cityIndex];
    const poiData = compiledData[city] || [];
    
    if (poiData.length === 0) {
      continue;
    }
    
    // 获取该城市的颜色索引
    const colorIndex = colorIndices && colorIndices[cityIndex] !== undefined 
      ? colorIndices[cityIndex] 
      : cityIndex % poiStore.Colors.length;
    
    // 计算区域质心
    const centroid = calculateRegionCentroid(regionPixelMap, cityIndex, width, height);
    
    // 使用阿基米德螺线算法布局词云
    const layoutResult = layoutWordCloudWithSpiral(
      ctx,
      city,
      poiData,
      regionPixelMap,
      cityIndex,
      centroid,
      width,
      height,
      fontSettings,
      colorIndex,
      poiStore
    );
    
    // 保存布局信息
    wordCloudLayout[cityIndex] = {
      city,
      colorIndex,
      words: layoutResult.words || []
    };
    
    // 让浏览器有机会渲染
    await waitNextFrame();
  }
  
  return wordCloudLayout;
};

// ========== Voronoi 相关函数 ==========

/**
 * 加载城市坐标数据
 */
const loadCityCoordinates = async () => {
  try {
    const response = await axios.get(`${import.meta.env.BASE_URL}data/cityCoordinates.json`);
    return response.data;
  } catch (error) {
    console.error('加载城市坐标数据失败:', error);
    return null;
  }
};

/**
 * 计算每个城市景点权重（使用POI数量）
 */
const calculateCityWeights = (data, cityOrder) => {
  return cityOrder.map(city => {
    const cityData = data[city] || [];
    const weight = cityData.length;
    return {
      city: city,
      weight: weight > 0 ? weight : 0.00001
    };
  });
};

/**
 * 将经纬度坐标映射到画布空间
 */
const mapCoordinatesToCanvas = (cities, cityOrder, width, height) => {
  const coords = [];
  
  cityOrder.forEach(city => {
    const cityCoord = cities.cities.find(c => c.name === city);
    if (cityCoord) {
      coords.push({ lng: cityCoord.lng, lat: cityCoord.lat, city: city });
    }
  });

  if (coords.length === 0) {
    return [];
  }

  const lngExtent = [Math.min(...coords.map(c => c.lng)), Math.max(...coords.map(c => c.lng))];
  const latExtent = [Math.min(...coords.map(c => c.lat)), Math.max(...coords.map(c => c.lat))];

  const padding = 0.1;
  const lngRange = lngExtent[1] - lngExtent[0];
  const latRange = latExtent[1] - latExtent[0];
  const lngMin = lngExtent[0] - lngRange * padding;
  const lngMax = lngExtent[1] + lngRange * padding;
  const latMin = latExtent[0] - latRange * padding;
  const latMax = latExtent[1] + latRange * padding;

  const mapLng = (lng) => {
    return ((lng - lngMin) / (lngMax - lngMin)) * width;
  };

  const mapLat = (lat) => {
    return height - ((lat - latMin) / (latMax - latMin)) * height;
  };

  const sites = [];
  cityOrder.forEach((city, index) => {
    const cityCoord = cities.cities.find(c => c.name === city);
    if (cityCoord) {
      sites.push({
        city: city,
        lng: cityCoord.lng,
        lat: cityCoord.lat,
        x: mapLng(cityCoord.lng),
        y: mapLat(cityCoord.lat),
        index: index
      });
    }
  });

  return sites;
};

/**
 * 计算加权维诺图区域映射（不绘制，仅计算）
 */
const computeWeightedVoronoiMap = async (sitesWithWeights, cityOrder, width, height, resolution = 2) => {
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });

  const regionPixelMap = new Uint8Array(width * height);

  for (let y = 0; y < height; y += resolution) {
    for (let x = 0; x < width; x += resolution) {
      let minWeightedDistSq = Infinity;
      let closestSite = null;
      
      for (const site of sitesWithWeights) {
        const dx = x - site.x;
        const dy = y - site.y;
        const euclideanDistSq = dx * dx + dy * dy;
        
        if (euclideanDistSq === 0) {
          closestSite = site;
          break;
        }
        
        const weight = Math.max(site.weight || 0.00001, 0.00001);
        const weightedDistSq = euclideanDistSq / weight;
        
        if (weightedDistSq < minWeightedDistSq) {
          minWeightedDistSq = weightedDistSq;
          closestSite = site;
        }
      }

      if (closestSite) {
        const cityIndex = cityIndexMap.get(closestSite.city);
        if (cityIndex !== undefined) {
          for (let dy = 0; dy < resolution && (y + dy) < height; dy++) {
            for (let dx = 0; dx < resolution && (x + dx) < width; dx++) {
              const px = x + dx;
              const py = y + dy;
              if (px < width && py < height) {
                regionPixelMap[py * width + px] = cityIndex;
              }
            }
          }
        }
      }
    }
    
    if (y % (resolution * 50) === 0) {
      await waitNextFrame();
    }
  }
  
  return regionPixelMap;
};

/**
 * 计算区域中心点（质心）
 */
const calculateRegionCentroid = (regionPixelMap, cityIndex, width, height) => {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (regionPixelMap[idx] === cityIndex) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  
  if (count === 0) {
    return { cx: width / 2, cy: height / 2 };
  }
  
  return { cx: sumX / count, cy: sumY / count };
};

/**
 * 计算区域周长（通过统计边界像素）
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} cityIndex - 城市索引
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {number} 区域周长（像素数）
 */
const calculateRegionPerimeter = (regionPixelMap, cityIndex, width, height) => {
  let perimeter = 0;
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 上下左右
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (regionPixelMap[idx] === cityIndex) {
        // 检查是否是边界像素（至少有一个邻居不属于当前区域）
        let isBoundary = false;
        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          
          // 如果邻居超出边界，认为是边界像素
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            isBoundary = true;
            break;
          }
          
          const neighborIdx = ny * width + nx;
          if (regionPixelMap[neighborIdx] !== cityIndex) {
            isBoundary = true;
            break;
          }
        }
        
        if (isBoundary) {
          perimeter++;
        }
      }
    }
  }
  
  return perimeter;
};

/**
 * 调整种子点位置：直接将种子点移动到当前区域的质心处
 */
const adjustSeedPoints = (sitesWithWeights, regionPixelMap, cityOrder, width, height) => {
  const adjustedSites = sitesWithWeights.map((site) => {
    const cityIndex = cityOrder.indexOf(site.city);
    if (cityIndex === -1) return site;
    
    const centroid = calculateRegionCentroid(regionPixelMap, cityIndex, width, height);
    
    const newX = Math.max(0, Math.min(width - 1, centroid.cx));
    const newY = Math.max(0, Math.min(height - 1, centroid.cy));
    
    return {
      ...site,
      x: newX,
      y: newY
    };
  });
  
  return adjustedSites;
};

/**
 * 计算面积误差率
 */
const calculateAreaErrorRate = (regionPixelMap, sitesWithWeights, cityOrder, width, height) => {
  if (!regionPixelMap || regionPixelMap.length === 0) {
    return { averageErrorRate: 0, areaMetrics: [], actualAreas: [], expectedAreas: [] };
  }
  
  const cityWeightMap = new Map();
  sitesWithWeights.forEach(site => {
    cityWeightMap.set(site.city, site.weight);
  });
  
  const totalWeight = sitesWithWeights.reduce((sum, site) => sum + site.weight, 0);
  const totalArea = width * height;
  
  const actualAreas = new Array(cityOrder.length).fill(0);
  for (let i = 0; i < regionPixelMap.length; i++) {
    const cityIndex = regionPixelMap[i];
    if (cityIndex !== undefined && cityIndex < cityOrder.length) {
      actualAreas[cityIndex]++;
    }
  }
  
  const areaMetrics = [];
  const expectedAreas = [];
  let totalErrorRate = 0;
  
  cityOrder.forEach((city, index) => {
    const weight = cityWeightMap.get(city) || 0;
    const expectedArea = totalWeight > 0 ? (weight / totalWeight) * totalArea : 0;
    const actualArea = actualAreas[index] || 0;
    const error = Math.abs(actualArea - expectedArea);
    const errorRate = expectedArea > 0 ? (error / expectedArea) * 100 : 0;
    
    totalErrorRate += errorRate;
    expectedAreas.push(expectedArea);
    
    areaMetrics.push({
      city,
      weight,
      expectedArea: Math.round(expectedArea),
      actualArea,
      error: Math.round(error),
      errorRate: errorRate.toFixed(2)
    });
  });
  
  const averageErrorRate = cityOrder.length > 0 ? totalErrorRate / cityOrder.length : 0;
  
  return { averageErrorRate, areaMetrics, actualAreas, expectedAreas };
};

/**
 * 判断两个voronoi区域是否相邻
 */
const areVoronoiRegionsAdjacent = (regionPixelMap, cityIndex1, cityIndex2, width, height) => {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (regionPixelMap[idx] === cityIndex1) {
        const neighbors = [
          { x: x - 1, y: y },
          { x: x + 1, y: y },
          { x: x, y: y - 1 },
          { x: x, y: y + 1 }
        ];
        
        for (const neighbor of neighbors) {
          if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height) {
            const neighborIdx = neighbor.y * width + neighbor.x;
            if (regionPixelMap[neighborIdx] === cityIndex2) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
};

/**
 * 基于区域像素映射构建邻接图（用于图着色）
 */
const buildAdjacencyGraphFromRegionMap = (regionPixelMap, cityOrder, width, height) => {
  const adjacencyGraph = new Map();
  cityOrder.forEach((_, index) => {
    adjacencyGraph.set(index, new Set());
  });

  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const checkedPairs = new Set();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const currentRegion = regionPixelMap[idx];
      if (currentRegion === undefined) continue;

      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborIdx = ny * width + nx;
          const neighborRegion = regionPixelMap[neighborIdx];
          
          if (neighborRegion !== undefined && neighborRegion !== currentRegion) {
            const pairKey = currentRegion < neighborRegion 
              ? `${currentRegion}-${neighborRegion}` 
              : `${neighborRegion}-${currentRegion}`;
            
            if (!checkedPairs.has(pairKey)) {
              adjacencyGraph.get(currentRegion).add(neighborRegion);
              adjacencyGraph.get(neighborRegion).add(currentRegion);
              checkedPairs.add(pairKey);
            }
          }
        }
      }
    }
  }

  return adjacencyGraph;
};

/**
 * 图着色算法（贪心算法）：确保相邻区域使用不同颜色
 */
const graphColoring = (adjacencyGraph, numColors) => {
  const numRegions = adjacencyGraph.size;
  const colorAssignment = new Array(numRegions).fill(-1);

  const regions = Array.from(adjacencyGraph.keys());
  const degrees = regions.map(index => adjacencyGraph.get(index).size);
  const sortedRegions = regions
    .map((index, i) => ({ index, degree: degrees[i] }))
    .sort((a, b) => b.degree - a.degree)
    .map(item => item.index);

  for (const regionIndex of sortedRegions) {
    const neighbors = adjacencyGraph.get(regionIndex);
    const usedColors = new Set();
    
    for (const neighbor of neighbors) {
      if (colorAssignment[neighbor] !== -1) {
        usedColors.add(colorAssignment[neighbor]);
      }
    }

    let colorIndex = 0;
    while (colorIndex < numColors && usedColors.has(colorIndex)) {
      colorIndex++;
    }

    if (colorIndex >= numColors) {
      colorIndex = colorIndex % numColors;
    }

    colorAssignment[regionIndex] = colorIndex;
  }

  return colorAssignment;
};

/**
 * 预计算所有城市的RGB颜色值（使用图着色确保相邻区域不同颜色）
 */
const precomputeCityColors = (cityOrder, regionPixelMap, width, height, poiStore) => {
  const opacity = poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1;
  
  let colorIndices = null;
  if (regionPixelMap && width && height && cityOrder.length > 0) {
    try {
      const adjacencyGraph = buildAdjacencyGraphFromRegionMap(regionPixelMap, cityOrder, width, height);
      const numColors = poiStore.Colors.length;
      colorIndices = graphColoring(adjacencyGraph, numColors);
    } catch (error) {
      console.warn('图着色失败，使用循环分配:', error);
      colorIndices = null;
    }
  }

  if (!colorIndices) {
    colorIndices = cityOrder.map((_, cityIndex) => cityIndex % poiStore.Colors.length);
  }
  
  const colors = cityOrder.map((city, cityIndex) => {
    const colorIndex = colorIndices[cityIndex];
    const bgColor = poiStore.Colors[colorIndex];
    
    let r, g, b;
    if (bgColor.startsWith('#')) {
      const hex = bgColor.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (bgColor.startsWith('rgb')) {
      const rgbMatch = bgColor.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        r = parseInt(rgbMatch[0]);
        g = parseInt(rgbMatch[1]);
        b = parseInt(rgbMatch[2]);
      } else {
        r = g = b = 200;
      }
    } else {
      r = g = b = 200;
    }
    
    return {
      r,
      g,
      b,
      a: Math.floor(255 * opacity)
    };
  });
  
  return {
    colors,
    colorIndices
  };
};

/**
 * 计算指标的函数
 */
const calculateMetrics = (regionPixelMap, cityOrder, sitesWithWeights, data, width, height, renderStartTime) => {
  const linearSequence = cityOrder.join('-');
  const cityNodeCount = cityOrder.length;
  
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });
  
  // 序列保持度（连续性）
  let adjacentPairs = 0;
  let stillAdjacentPairs = 0;
  const stillAdjacentCityPairs = [];
  const brokenCityPairs = [];
  
  for (let i = 0; i < cityOrder.length - 1; i++) {
    const city1 = cityOrder[i];
    const city2 = cityOrder[i + 1];
    adjacentPairs++;
    
    const cityIndex1 = cityIndexMap.get(city1);
    const cityIndex2 = cityIndexMap.get(city2);
    
    if (cityIndex1 !== undefined && cityIndex2 !== undefined && 
        areVoronoiRegionsAdjacent(regionPixelMap, cityIndex1, cityIndex2, width, height)) {
      stillAdjacentPairs++;
      stillAdjacentCityPairs.push(`${city1}-${city2}`);
    } else {
      brokenCityPairs.push(`${city1}-${city2}`);
    }
  }
  
  const sequenceContinuity = adjacentPairs > 0 ? stillAdjacentPairs / adjacentPairs : 0;
  
  // 可读性
  let noOffsetCount = 0;
  let totalVectorPairs = 0;
  const noOffsetPairs = [];
  const offsetPairs = [];
  
  const directionVectors = [];
  for (let i = 0; i < cityOrder.length - 1; i++) {
    const city1 = cityOrder[i];
    const city2 = cityOrder[i + 1];
    
    const cityIndex1 = cityIndexMap.get(city1);
    const cityIndex2 = cityIndexMap.get(city2);
    
    if (cityIndex1 !== undefined && cityIndex2 !== undefined) {
      const centroid1 = calculateRegionCentroid(regionPixelMap, cityIndex1, width, height);
      const centroid2 = calculateRegionCentroid(regionPixelMap, cityIndex2, width, height);
      
      const dx = centroid2.cx - centroid1.cx;
      const dy = centroid2.cy - centroid1.cy;
      
      directionVectors.push({
        fromCity: city1,
        toCity: city2,
        dx: dx,
        dy: dy,
        angle: Math.atan2(dy, dx)
      });
    }
  }
  
  const angleDiffs = [];
  for (let i = 0; i < directionVectors.length - 1; i++) {
    const vector1 = directionVectors[i];
    const vector2 = directionVectors[i + 1];
    totalVectorPairs++;
    
    const angle1 = vector1.angle;
    const angle2 = vector2.angle;
    
    let angleDiff = Math.abs(angle2 - angle1) * 180 / Math.PI;
    if (angleDiff > 180) {
      angleDiff = 360 - angleDiff;
    }
    
    angleDiffs.push(angleDiff);
    
    if (angleDiff <= 6) {
      noOffsetCount++;
      noOffsetPairs.push(`${vector1.toCity}处 (${vector1.fromCity}→${vector1.toCity} 与 ${vector2.fromCity}→${vector2.toCity} 夹角: ${angleDiff.toFixed(2)}°)`);
    } else {
      offsetPairs.push(`${vector1.toCity}处 (${vector1.fromCity}→${vector1.toCity} 与 ${vector2.fromCity}→${vector2.toCity} 夹角: ${angleDiff.toFixed(2)}°)`);
    }
  }
  
  const readability = totalVectorPairs > 0 ? noOffsetCount / totalVectorPairs : 0;
  
  let angleMean = 0;
  let angleCoefficientOfVariation = 0;
  if (angleDiffs.length > 0) {
    angleMean = angleDiffs.reduce((sum, angle) => sum + angle, 0) / angleDiffs.length;
    
    if (angleDiffs.length > 1 && angleMean > 0) {
      const sumSquaredDiff = angleDiffs.reduce((sum, angle) => {
        const diff = angle - angleMean;
        return sum + diff * diff;
      }, 0);
      const variance = sumSquaredDiff / angleDiffs.length;
      const standardDeviation = Math.sqrt(variance);
      angleCoefficientOfVariation = (standardDeviation / angleMean) * 100;
    }
  }
  
  // 面积-权重相关性
  const weights = [];
  const areas = [];
  
  const actualAreas = new Array(cityOrder.length).fill(0);
  for (let i = 0; i < regionPixelMap.length; i++) {
    const cityIndex = regionPixelMap[i];
    if (cityIndex !== undefined && cityIndex < cityOrder.length) {
      actualAreas[cityIndex]++;
    }
  }
  
  cityOrder.forEach((city, index) => {
    const site = sitesWithWeights.find(s => s.city === city);
    if (site) {
      weights.push(site.weight || 0);
      areas.push(actualAreas[index] || 0);
    }
  });
  
  let areaWeightCorrelation = 0;
  if (weights.length > 1 && areas.length > 1) {
    const meanWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
    const meanArea = areas.reduce((a, b) => a + b, 0) / areas.length;
    
    let numerator = 0;
    let sumSqWeight = 0;
    let sumSqArea = 0;
    
    for (let i = 0; i < weights.length; i++) {
      const weightDiff = weights[i] - meanWeight;
      const areaDiff = areas[i] - meanArea;
      numerator += weightDiff * areaDiff;
      sumSqWeight += weightDiff * weightDiff;
      sumSqArea += areaDiff * areaDiff;
    }
    
    const denominator = Math.sqrt(sumSqWeight * sumSqArea);
    areaWeightCorrelation = denominator > 0 ? numerator / denominator : 0;
  }
  
  // 平均面积误差率
  const totalWeight = sitesWithWeights.reduce((sum, site) => sum + site.weight, 0);
  const totalArea = width * height;
  const areaErrorRates = [];
  
  cityOrder.forEach((city, index) => {
    const site = sitesWithWeights.find(s => s.city === city);
    if (site) {
      const weight = site.weight || 0;
      const expectedArea = totalWeight > 0 ? (weight / totalWeight) * totalArea : 0;
      const actualArea = actualAreas[index] || 0;
      const error = Math.abs(actualArea - expectedArea);
      const errorRate = expectedArea > 0 ? (error / expectedArea) * 100 : 0;
      
      areaErrorRates.push({
        city: city,
        expectedArea: expectedArea.toFixed(2),
        actualArea: actualArea,
        errorRate: errorRate.toFixed(2)
      });
    }
  });
  
  const averageAreaErrorRate = areaErrorRates.length > 0 
    ? areaErrorRates.reduce((sum, item) => sum + parseFloat(item.errorRate), 0) / areaErrorRates.length 
    : 0;
  
  // 紧凑性：衡量剖分的各个子空间形状的指标
  // 单个子空间的紧凑性 = 4π*面积/周长的平方
  // 计算各个子空间紧凑性的均值
  const compactnessValues = [];
  cityOrder.forEach((city, index) => {
    const area = actualAreas[index] || 0;
    if (area > 0) {
      const perimeter = calculateRegionPerimeter(regionPixelMap, index, width, height);
      if (perimeter > 0) {
        // 紧凑性 = 4π * 面积 / 周长²
        const compactness = (4 * Math.PI * area) / (perimeter * perimeter);
        compactnessValues.push(compactness);
      }
    }
  });
  
  const averageCompactness = compactnessValues.length > 0
    ? compactnessValues.reduce((sum, c) => sum + c, 0) / compactnessValues.length
    : 0;
  
  // 语义信息密度
  let totalTags = 0;
  cityOrder.forEach(city => {
    const cityTags = data[city] ? data[city].length : 0;
    totalTags += cityTags;
  });
  
  const totalCanvasArea = width * height;
  const semanticDensity = totalCanvasArea > 0 ? totalTags / totalCanvasArea : 0;
  
  // 运行效率
  const renderEndTime = Date.now();
  const renderEfficiency = renderEndTime - renderStartTime;
  
  return {
    linearSequence,
    cityNodeCount,
    sequenceContinuity,
    stillAdjacentCityPairs,
    brokenCityPairs,
    readability,
    noOffsetPairs,
    offsetPairs,
    angleMean,
    angleCoefficientOfVariation,
    areaWeightCorrelation,
    averageAreaErrorRate,
    areaErrorRates,
    averageCompactness,
    compactnessValues,
    semanticDensity,
    totalTags,
    totalArea: totalCanvasArea.toFixed(2),
    totalWidth: width.toFixed(2),
    totalHeight: height.toFixed(2),
    renderEfficiency
  };
};

/**
 * 主渲染函数：生成加权维诺图并计算指标
 * 确保批量测试使用与原始代码完全相同的算法流程
 */
export async function renderVoronoiAndCalculateMetrics(
  cityOrder, 
  compiledData, 
  width = 800, 
  height = 600,
  poiStore,
  progressCallback = null
) {
  const renderStartTime = Date.now();
  
  const updateProgress = (stage, current, total) => {
    if (progressCallback) {
      progressCallback(stage, current, total);
    }
  };
  
  try {
    // 1. 计算城市权重
    updateProgress('正在计算城市权重...', 0, 0);
    await waitNextFrame();
    const cityWeights = calculateCityWeights(compiledData, cityOrder);
    
    // 2. 加载城市坐标数据
    updateProgress('正在加载城市坐标...', 0, 0);
    await waitNextFrame();
    const cities = await loadCityCoordinates();
    if (!cities) {
      throw new Error('无法加载城市坐标数据');
    }
    
    // 3. 映射城市中心点到画布空间
    updateProgress('正在映射城市坐标...', 0, 0);
    await waitNextFrame();
    const sites = mapCoordinatesToCanvas(cities, cityOrder, width, height);
    if (sites.length === 0) {
      throw new Error('无法映射城市坐标');
    }
    
    // 4. 合并站点和权重
    const sitesWithWeights = sites.map(site => {
      const weightInfo = cityWeights.find(w => w.city === site.city);
      return {
        ...site,
        weight: weightInfo ? weightInfo.weight : 0.00001
      };
    });
    
    // 5. 迭代优化算法（20次迭代）
    const maxIterations = 20;
    let currentSites = sitesWithWeights.map(s => ({ ...s }));
    let bestErrorRate = Infinity;
    let bestSites = sitesWithWeights.map(s => ({ ...s }));
    let bestRegionPixelMap = null;
    
    const iterationResolution = 4;
    const finalResolution = 2;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      updateProgress(`正在迭代优化加权维诺图... (${iteration + 1}/${maxIterations})`, iteration + 1, maxIterations);
      await waitNextFrame();
      
      const currentRegionPixelMap = await computeWeightedVoronoiMap(
        currentSites, 
        cityOrder, 
        width, 
        height, 
        iterationResolution
      );
      
      const { averageErrorRate } = calculateAreaErrorRate(
        currentRegionPixelMap, 
        currentSites, 
        cityOrder, 
        width, 
        height
      );
      
      if (averageErrorRate < bestErrorRate) {
        bestErrorRate = averageErrorRate;
        bestSites = currentSites.map(s => ({ ...s }));
        bestRegionPixelMap = new Uint8Array(currentRegionPixelMap);
      }
      
      if (iteration < maxIterations - 1) {
        currentSites = adjustSeedPoints(
          currentSites,
          currentRegionPixelMap,
          cityOrder,
          width,
          height
        );
      }
    }
    
    // 6. 使用细分辨率计算最终的区域映射
    updateProgress('正在计算最终区域映射...', 0, 0);
    await waitNextFrame();
    bestRegionPixelMap = await computeWeightedVoronoiMap(
      bestSites, 
      cityOrder, 
      width, 
      height, 
      finalResolution
    );
    
    // 7. 基于最优区域映射计算颜色（图着色）
    const { colors, colorIndices } = precomputeCityColors(cityOrder, bestRegionPixelMap, width, height, poiStore);
    
    // 8. 生成各子空间词云（完整流程，与原始代码完全一致）
    updateProgress('正在生成各子空间词云...', 0, cityOrder.length);
    await waitNextFrame();
    
    // 创建canvas用于词云生成（执行完整的词云布局算法）
    const wordCloudCanvas = document.createElement('canvas');
    wordCloudCanvas.width = width;
    wordCloudCanvas.height = height;
    const wordCloudCtx = wordCloudCanvas.getContext('2d');
    
    // 获取字体设置
    const fontSettings = poiStore.fontSettings || {
      minFontSize: 10,
      maxFontSize: 40,
      fontFamily: '等线',
      fontWeight: '700',
      language: 'zh',
      showCityIndex: true
    };
    
    // 为每个城市逐一生成词云（完整流程）
    await drawWordCloudsInRegions(
      wordCloudCtx,
      bestRegionPixelMap,
      cityOrder,
      compiledData,
      width,
      height,
      colorIndices,
      fontSettings,
      poiStore
    );
    
    // 9. 计算指标
    updateProgress('正在计算指标...', 0, 0);
    await waitNextFrame();
    const metrics = calculateMetrics(
      bestRegionPixelMap, 
      cityOrder, 
      bestSites, 
      compiledData, 
      width, 
      height, 
      renderStartTime
    );
    
    return metrics;
  } catch (error) {
    console.error('[voronoiRenderer] 渲染失败:', error);
    throw error;
  }
}
