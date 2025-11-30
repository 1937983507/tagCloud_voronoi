/**
 * 加权Voronoi图生成工具
 * 使用最基础的算法：遍历每个像素，计算加权距离，分配给最近的城市
 */

/**
 * 计算点到站点的加权距离
 * 加权Voronoi图使用公式：d_weighted = d_euclidean / sqrt(weight)
 * 权重越大，影响范围越大（距离越小）
 */
function weightedDistanceToSite(x, y, site) {
  const dx = x - site.x;
  const dy = y - site.y;
  const euclideanDist = Math.sqrt(dx * dx + dy * dy);
  
  // 如果距离为0，直接返回0
  if (euclideanDist === 0) {
    return 0;
  }
  
  // 加权距离：权重越大，距离越小（影响范围越大）
  // 使用 sqrt(weight) 作为权重因子
  const weight = Math.max(site.weight || 0.00001, 0.00001); // 确保权重大于0
  const weightedDist = euclideanDist / Math.sqrt(weight);
  
  return weightedDist;
}

/**
 * 判断点属于哪个加权Voronoi区域
 * @param {number} x - 点的x坐标
 * @param {number} y - 点的y坐标
 * @param {Array} sites - 站点数组，每个站点包含 {x, y, weight, city, index}
 * @returns {number} 站点索引，如果未找到返回-1
 */
function findClosestSite(x, y, sites) {
  if (!sites || sites.length === 0) {
    return -1;
  }
  
  let minDist = Infinity;
  let closestIndex = -1;

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    if (!site || typeof site.x !== 'number' || typeof site.y !== 'number') {
      continue;
    }
    
    const dist = weightedDistanceToSite(x, y, site);
    
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * 生成加权Voronoi图的边界多边形
 * 使用最基础的像素扫描方法
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} sites - 站点数组，每个站点包含 {x, y, weight, city, index}
 * @param {number} resolution - 分辨率（可选，默认2，值越大精度越低但速度越快）
 * @returns {Array} Voronoi区域数组，每个区域包含 {polygon, site}
 */
export function generateWeightedVoronoi(width, height, sites, resolution = 2) {
  if (!sites || sites.length === 0) {
    console.warn('generateWeightedVoronoi: sites为空');
    return [];
  }

  console.log(`开始生成加权Voronoi图: 画布${width}x${height}, ${sites.length}个站点, 分辨率=${resolution}`);
  
  // 验证站点数据
  sites.forEach((site, idx) => {
    if (!site.city) {
      console.warn(`站点${idx}缺少city属性:`, site);
    }
    if (typeof site.x !== 'number' || typeof site.y !== 'number') {
      console.warn(`站点${idx}坐标无效:`, site);
    }
    if (typeof site.weight !== 'number' || site.weight <= 0) {
      console.warn(`站点${idx}权重无效:`, site);
    }
  });

  // 为每个站点创建区域
  const regions = sites.map((site, index) => ({
    site: site,
    index: index,
    pixels: []
  }));

  // 扫描画布上的每个像素（按分辨率采样）
  const totalPixels = Math.ceil(width / resolution) * Math.ceil(height / resolution);
  let processedPixels = 0;
  
  for (let y = 0; y < height; y += resolution) {
    for (let x = 0; x < width; x += resolution) {
      const closestIndex = findClosestSite(x, y, sites);
      if (closestIndex >= 0 && closestIndex < regions.length) {
        regions[closestIndex].pixels.push({ x, y });
      }
      processedPixels++;
      
      // 每处理10%的像素输出一次进度
      if (processedPixels % Math.floor(totalPixels / 10) === 0) {
        const progress = Math.floor((processedPixels / totalPixels) * 100);
        console.log(`Voronoi生成进度: ${progress}%`);
      }
    }
  }

  console.log('像素扫描完成，开始生成多边形边界...');

  // 将像素转换为多边形边界
  const voronoiRegions = regions.map((region, idx) => {
    if (region.pixels.length === 0) {
      console.warn(`站点${idx} (${region.site.city}) 没有分配到任何像素`);
      return {
        polygon: [],
        site: region.site
      };
    }

    // 使用凸包算法生成多边形边界
    const polygon = extractBoundary(region.pixels, width, height, resolution);
    
    console.log(`站点${idx} (${region.site.city}): ${region.pixels.length}个像素, ${polygon.length}个边界点`);
    
    return {
      polygon: polygon,
      site: region.site
    };
  });

  console.log('加权Voronoi图生成完成');
  return voronoiRegions;
}

/**
 * 从像素点集合中提取边界多边形
 * 直接返回所有边界像素，不进行任何简化或凸包处理
 * @param {Array} pixels - 像素点数组
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} resolution - 分辨率
 * @returns {Array} 多边形顶点数组 [{x, y}, ...]
 */
function extractBoundary(pixels, width, height, resolution) {
  if (pixels.length === 0) return [];

  // 创建像素集合用于快速查找
  const pixelSet = new Set();
  pixels.forEach(p => {
    const key = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    pixelSet.add(key);
  });

  // 找到边界像素（8邻域中有非区域像素的像素）
  const boundaryPixels = [];
  const directions = [
    { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },                     { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
  ];

  pixels.forEach(p => {
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    
    // 检查8邻域，如果有邻居不在区域内，则是边界像素
    let isBoundary = false;
    for (const dir of directions) {
      const nx = px + dir.dx;
      const ny = py + dir.dy;
      const neighborKey = `${nx},${ny}`;
      if (!pixelSet.has(neighborKey)) {
        isBoundary = true;
        break;
      }
    }
    
    if (isBoundary) {
      boundaryPixels.push({ x: p.x, y: p.y });
    }
  });

  if (boundaryPixels.length === 0) {
    // 如果没有边界像素，返回所有像素的边界框
    const minX = Math.min(...pixels.map(p => p.x));
    const maxX = Math.max(...pixels.map(p => p.x));
    const minY = Math.min(...pixels.map(p => p.y));
    const maxY = Math.max(...pixels.map(p => p.y));
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ];
  }

  // 直接返回所有边界像素，不进行任何处理
  // 这样可以保持真实的Voronoi边界形状，不会有笔直的直线
  return boundaryPixels;
}

/**
 * 计算点集的凸包（Graham扫描算法）
 * @param {Array} points - 点数组 [{x, y}, ...]
 * @returns {Array} 凸包顶点数组
 */
function convexHull(points) {
  if (points.length < 3) {
    return points;
  }

  // 找到最下方的点（y最大，如果相同则x最小）
  let bottom = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y > points[bottom].y || 
        (points[i].y === points[bottom].y && points[i].x < points[bottom].x)) {
      bottom = i;
    }
  }

  // 交换到第一个位置
  [points[0], points[bottom]] = [points[bottom], points[0]];

  // 按极角排序
  const pivot = points[0];
  const sortedPoints = [points[0], ...points.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
    return angleA - angleB;
  })];

  // Graham扫描
  const hull = [sortedPoints[0], sortedPoints[1]];

  for (let i = 2; i < sortedPoints.length; i++) {
    while (hull.length > 1) {
      const p1 = hull[hull.length - 2];
      const p2 = hull[hull.length - 1];
      const p3 = sortedPoints[i];

      // 计算叉积
      const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
      if (cross <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(sortedPoints[i]);
  }

  return hull;
}

/**
 * 简化多边形（减少顶点数量）
 * @param {Array} polygon - 多边形顶点数组
 * @param {number} tolerance - 容差
 * @returns {Array} 简化后的多边形
 */
export function simplifyPolygon(polygon, tolerance = 2) {
  if (polygon.length <= 3) return polygon;

  const simplified = [polygon[0]];

  for (let i = 1; i < polygon.length - 1; i++) {
    const prev = polygon[i - 1];
    const curr = polygon[i];
    const next = polygon[i + 1];

    // 计算点到线段的距离
    const dist = pointToLineDistance(curr, prev, next);
    if (dist > tolerance) {
      simplified.push(curr);
    }
  }

  simplified.push(polygon[polygon.length - 1]);
  return simplified;
}

/**
 * 计算点到线段的距离
 */
function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}
