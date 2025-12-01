<template>
  <aside class="tagcloud-panel">
    <header class="panel-head">
      <el-space direction="horizontal" alignment="center" size="small">
        <el-button
          type="primary"
          data-intro-target="runTagCloudBtn"
          @click="handleRenderCloud"
        >
          运行生成标签云
        </el-button>
        <el-dropdown @command="handleExportCommand">
          <el-button>
            导出图片<el-icon style="margin-left:4px"><arrow-down /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="svg">导出SVG</el-dropdown-item>
              <el-dropdown-item command="png">导出PNG</el-dropdown-item>
              <el-dropdown-item command="jpeg">导出JPEG</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span style="margin-left: 8px; font-size: 15px;">当前展示的城市数：{{ poiStore.cityOrder.length }}</span>
      </el-space>
    </header>
    <!-- 导出图片设置对话框 -->
    <el-dialog v-model="exportDialogVisible" title="导出图片设置" width="350px" :close-on-click-modal="false">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <span style="width:60px;">宽度(px)</span>
        <el-input-number v-model="exportWidth" :min="1" :max="4000" :step="10" size="small" @change="onExportWidthChange" style="width:130px;"/>
      </div>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <span style="width:60px;">高度(px)</span>
        <el-input-number v-model="exportHeight" :min="1" :max="4000" :step="10" size="small" @change="onExportHeightChange" style="width:130px;"/>
      </div>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <el-checkbox v-model="lockAspectRatio" size="small">锁定比例</el-checkbox>
      </div>
      <template #footer>
        <el-button @click="exportDialogVisible=false">取消</el-button>
        <el-button type="primary" @click="handleExportConfirm">确认导出</el-button>
      </template>
    </el-dialog>
    <div class="canvas-wrapper" ref="wrapperRef">
      <canvas ref="voronoiCanvasRef" class="voronoi-canvas"></canvas>
      <canvas ref="lineCanvasRef" class="line-canvas"></canvas>
      <canvas ref="wordCloudCanvasRef" class="wordcloud-canvas"></canvas>
      <div v-if="(!poiStore.hasDrawing || !poiStore.cityOrder.length) && !cloudLoading" class="empty-cloud-hint">
        <div class="hint-content">
          <div class="hint-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="hint-text">
            <p class="hint-title">准备生成标签云</p>
            <p class="hint-desc">请先在地图上绘制折线，然后点击"运行生成标签云"按钮</p>
          </div>
        </div>
      </div>
      <div v-if="cloudLoading" class="cloud-loading-overlay">
        <div class="cloud-loading-spinner">
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
          <div class="spinner-dot"></div>
        </div>
        <div class="cloud-loading-main-text">
          请稍等，正在生成标签云…
        </div>
        <div class="cloud-loading-sub-text">
          {{ loadingStage || '正在准备数据与布局，请不要关闭页面。' }}
        </div>
        <div
          v-if="loadingTotalCities > 0"
          class="cloud-loading-city-text"
        >
          当前城市（{{ loadingCurrentIndex }}/{{ loadingTotalCities }}）：
          <span class="cloud-loading-city-name">
            {{ loadingCurrentCity || '分析城市中…' }}
          </span>
        </div>
        <div class="cloud-loading-progress-wrapper" v-if="loadingTotalCities > 0">
          <div class="cloud-loading-progress-bar">
            <div
              class="cloud-loading-progress-inner"
              :style="{ width: loadingPercent + '%' }"
            ></div>
          </div>
          <span class="cloud-loading-progress-text">
            进度约 {{ loadingPercent }}%
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import introJs from 'intro.js';
import 'intro.js/minified/introjs.min.css';
import { usePoiStore } from '@/stores/poiStore';
// 不再需要导入 weightedVoronoi，直接使用像素填充方式
import axios from 'axios';
import { ElButton, ElSpace, ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon, ElInputNumber, ElDialog, ElColorPicker, ElCheckbox } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
import { cityNameToPinyin } from '@/utils/cityNameToPinyin';

const exportDialogVisible = ref(false)
const exportWidth = ref(800)
const exportHeight = ref(600)
const exportFormat = ref('png')
const lockAspectRatio = ref(true);
const origWidth = ref(800);
const origHeight = ref(600);
let _aspectRatio = 1;

const poiStore = usePoiStore();

// 小工具：让浏览器有机会渲染一帧，用于更新遮罩上的进度信息
const waitNextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => resolve());
  } else {
    setTimeout(resolve, 0);
  }
});
const wrapperRef = ref(null);
const voronoiCanvasRef = ref(null); // 维诺图canvas
const wordCloudCanvasRef = ref(null); // 词云canvas
const lineCanvasRef = ref(null); // 线条canvas
let voronoiCanvas = null;
let voronoiCtx = null;
let wordCloudCanvas = null;
let wordCloudCtx = null;
let lineCanvas = null;
let lineCtx = null;
let collisionCanvas = null; // 隐藏的canvas，用于像素级碰撞检测
let collisionCtx = null;
let collisionImageData = null; // 缓存碰撞canvas的像素数据，避免频繁调用getImageData
let collisionData = null; // 缓存的像素数据数组
let collisionWidth = 0; // 碰撞canvas的宽度
let cityCoordinates = null; // 城市坐标数据
let currentVoronoiRegions = null; // 当前Voronoi区域
let currentCityOrder = null;
let secondIntroStarted = false;
let currentRegionMap = null; // 存储区域像素映射，用于快速判断点是否在区域内
let fontMetricsCache = new Map(); // 缓存字体测量结果
let savedWordCloudLayout = null; // 存储已确定位置的标签布局信息
let savedRegionPixelMap = null; // 保存区域像素映射（用于快速更新背景颜色）：Uint8Array，每个像素存储城市索引
let savedCanvasSize = null; // 保存画布尺寸 {width, height}
let savedCityOrder = null; // 保存城市顺序（用于验证是否需要重新生成）
let savedColorIndices = null; // 保存颜色索引映射（用于快速更新背景颜色）
let savedMultiColorColors = null; // 保存复色模式下的颜色信息（无论当前模式是什么，都保存复色模式的颜色，用于快速切换）
let savedSites = null; // 保存站点信息（用于绘制线条）：Array<{city, x, y, weight}>

// loading 遮罩状态
const cloudLoading = computed(() => poiStore.cloudLoading);

// 遮罩上的友好提示信息
const loadingStage = ref('');           // 当前阶段文案，例如“正在计算城市权重…”
const loadingCurrentCity = ref('');     // 当前正在处理的城市
const loadingCurrentIndex = ref(0);     // 当前城市序号
const loadingTotalCities = ref(0);      // 总城市数
const loadingPercent = computed(() => {
  if (!loadingTotalCities.value || loadingTotalCities.value <= 0) return 0;
  const ratio = loadingCurrentIndex.value / loadingTotalCities.value;
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
});

const getDrawLineButtonElement = () => {
  return (
    document.querySelector('[data-intro-target="drawLineTrigger"]') ||
    document.querySelector('.map-head .dropdown-btn')
  );
};

const getMapCanvasElement = () => {
  return (
    document.querySelector('[data-intro-target="mapCanvas"]') ||
    document.querySelector('.map-canvas') ||
    document.querySelector('.map-wrapper')
  );
};

const getRunTagCloudButtonElement = () => {
  return (
    document.querySelector('[data-intro-target="runTagCloudBtn"]') ||
    document.querySelector('.tagcloud-panel .panel-head .el-button--primary')
  );
};

const startDrawGuideIntro = () => {
  if (secondIntroStarted) return;
  secondIntroStarted = true;

  const attemptStart = (retries = 8) => {
    const drawBtn = getDrawLineButtonElement();
    const mapCanvas = getMapCanvasElement();
    const runBtn = getRunTagCloudButtonElement();

    if (drawBtn && mapCanvas && runBtn) {
      try {
        const intro = introJs.tour();
        intro.addSteps([
          {
            element: drawBtn,
            intro:
              '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">绘制折线</strong><br/><span style="color:#64748b;">点击此处选择“手绘折线”或“自定义始末点”，划定需要分析的路线。</span></div>',
          },
          {
            element: mapCanvas,
            intro:
              '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">地图区域</strong><br/><span style="color:#64748b;">在地图上完成折线绘制，系统会根据路线经过的城市准备标签数据。</span></div>',
          },
          {
            element: runBtn,
            intro:
              '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">运行生成标签云</strong><br/><span style="color:#64748b;">绘制完成后，再次点击该按钮即可生成路线对应的标签云。</span></div>',
          },
        ]);
        intro.setOptions({
          nextLabel: '下一步 →',
          prevLabel: '← 上一步',
          skipLabel: '跳过',
          doneLabel: '完成',
          showStepNumbers: true,
          showProgress: true,
          disableInteraction: false,
          tooltipClass: 'customTooltipClass',
          highlightClass: 'customHighlightClass',
          exitOnOverlayClick: true,
          exitOnEsc: true,
          keyboardNavigation: true,
          tooltipRenderAsHtml: true,
        });
        intro.onComplete(() => {
          secondIntroStarted = false;
        });
        intro.onExit(() => {
          secondIntroStarted = false;
        });
        intro.start();
      } catch (error) {
        console.error('[TagCloudCanvas] 二次引导启动失败', error);
        secondIntroStarted = false;
      }
      return;
    }

    if (retries > 0) {
      setTimeout(() => attemptStart(retries - 1), 200);
    } else {
      console.warn('[TagCloudCanvas] 未找到绘制引导元素');
      secondIntroStarted = false;
    }
  };

  nextTick(() => {
    setTimeout(() => attemptStart(), 120);
  });
};

// 加载城市坐标数据
const loadCityCoordinates = async () => {
  if (cityCoordinates) return cityCoordinates;
  
  try {
    const response = await axios.get('/data/cityCoordinates.json');
    cityCoordinates = response.data;
    return cityCoordinates;
  } catch (error) {
    console.error('加载城市坐标数据失败:', error);
    return null;
  }
};

// 计算每个城市景点权重
const calculateCityWeights = (data, cityOrder) => {
  return cityOrder.map(city => {
    const cityData = data[city] || [];
    // 权重基于景点数量和排名
    const weight = cityData.reduce((sum, d) => {
      const rank = parseInt(d.rankInChina) || 100000;
      // 排名越小，权重越大（取倒数）
      return sum + (1 / rank);
    }, 0);
    // 如果权重为0，给一个最小值
    return {
      city: city,
      weight: weight > 0 ? weight : 0.00001
    };
  });
};

  // 将经纬度坐标映射到画布空间
  const mapCoordinatesToCanvas = (cities, cityOrder, width, height) => {
  console.log('开始映射城市坐标，城市顺序:', cityOrder);
  console.log('可用城市坐标数量:', cities?.cities?.length || 0);
  
  // 获取所有城市的坐标范围
  const coords = [];
  const missingCities = [];
  
  cityOrder.forEach(city => {
    const cityCoord = cities.cities.find(c => c.name === city);
    if (cityCoord) {
      coords.push({ lng: cityCoord.lng, lat: cityCoord.lat, city: city });
      console.log(`找到城市 ${city} 的坐标: (${cityCoord.lng}, ${cityCoord.lat})`);
      } else {
      missingCities.push(city);
      console.warn(`未找到城市 ${city} 的坐标数据`);
    }
  });

  if (missingCities.length > 0) {
    console.error('以下城市未找到坐标数据:', missingCities);
    console.log('可用的城市列表（前20个）:', cities.cities.slice(0, 20).map(c => c.name));
  }

  if (coords.length === 0) {
    console.error('没有找到任何城市坐标数据');
    return [];
  }
  
  console.log(`成功找到 ${coords.length}/${cityOrder.length} 个城市的坐标`);

  // 计算经纬度范围
  const lngExtent = [Math.min(...coords.map(c => c.lng)), Math.max(...coords.map(c => c.lng))];
  const latExtent = [Math.min(...coords.map(c => c.lat)), Math.max(...coords.map(c => c.lat))];

  // 添加边距
  const padding = 0.1; // 10%边距
  const lngRange = lngExtent[1] - lngExtent[0];
  const latRange = latExtent[1] - latExtent[0];
  const lngMin = lngExtent[0] - lngRange * padding;
  const lngMax = lngExtent[1] + lngRange * padding;
  const latMin = latExtent[0] - latRange * padding;
  const latMax = latExtent[1] + latRange * padding;

  // 创建映射函数
  const mapLng = (lng) => {
    return ((lng - lngMin) / (lngMax - lngMin)) * width;
  };

  const mapLat = (lat) => {
    // 注意：纬度是反向的（北纬越大，y越小）
    return height - ((lat - latMin) / (latMax - latMin)) * height;
  };

  // 映射城市坐标
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
      } else {
      console.warn(`城市 ${city} 未找到坐标，跳过`);
    }
  });

  console.log(`成功映射 ${sites.length}/${cityOrder.length} 个城市的坐标`);
  return sites;
};

/**
 * 构建邻接图（检测哪些区域相邻）
 * @param {Array} sitesWithWeights - 站点数组
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} resolution - 分辨率步长
 * @returns {Map} 邻接图，key为城市索引，value为相邻城市索引的Set
 */
const buildAdjacencyGraph = (sitesWithWeights, cityOrder, width, height, resolution = 2) => {
  // 创建城市索引映射
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });

  // 创建区域映射（记录每个像素属于哪个城市）
  const regionMap = new Array(height);
  for (let y = 0; y < height; y++) {
    regionMap[y] = new Array(width);
  }

  // 第一次扫描：确定每个像素属于哪个区域
  for (let y = 0; y < height; y += resolution) {
    for (let x = 0; x < width; x += resolution) {
      let minDist = Infinity;
      let closestSite = null;
      
      for (const site of sitesWithWeights) {
        const dx = x - site.x;
        const dy = y - site.y;
        const euclideanDist = Math.sqrt(dx * dx + dy * dy);
        
        if (euclideanDist === 0) {
          closestSite = site;
          break;
        }
        
        const weight = Math.max(site.weight || 0.00001, 0.00001);
        const weightedDist = euclideanDist / Math.sqrt(weight);
        
        if (weightedDist < minDist) {
          minDist = weightedDist;
          closestSite = site;
        }
      }

      if (closestSite) {
        const cityIndex = cityIndexMap.get(closestSite.city);
        if (cityIndex !== undefined) {
          // 填充当前像素块
          for (let dy = 0; dy < resolution && (y + dy) < height; dy++) {
            for (let dx = 0; dx < resolution && (x + dx) < width; dx++) {
              const px = x + dx;
              const py = y + dy;
              if (px < width && py < height) {
                regionMap[py][px] = cityIndex;
              }
            }
          }
        }
      }
    }
  }

  // 构建邻接图
  const adjacencyGraph = new Map();
  cityOrder.forEach((_, index) => {
    adjacencyGraph.set(index, new Set());
  });

  // 第二次扫描：检测相邻区域
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 上下左右
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const currentRegion = regionMap[y][x];
      if (currentRegion === undefined) continue;

      // 检查四个方向的邻居
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborRegion = regionMap[ny][nx];
          if (neighborRegion !== undefined && neighborRegion !== currentRegion) {
            // 两个区域相邻
            adjacencyGraph.get(currentRegion).add(neighborRegion);
            adjacencyGraph.get(neighborRegion).add(currentRegion);
          }
        }
      }
    }
  }

  return adjacencyGraph;
};

/**
 * 图着色算法（贪心算法）：确保相邻区域使用不同颜色
 * @param {Map} adjacencyGraph - 邻接图
 * @param {number} numColors - 可用颜色数量
 * @returns {Array} 颜色索引数组，索引对应城市索引
 */
const graphColoring = (adjacencyGraph, numColors) => {
  const numRegions = adjacencyGraph.size;
  const colorAssignment = new Array(numRegions).fill(-1); // -1表示未着色

  // 按度数排序（度数大的先着色，贪心策略）
  const regions = Array.from(adjacencyGraph.keys());
  const degrees = regions.map(index => adjacencyGraph.get(index).size);
  const sortedRegions = regions
    .map((index, i) => ({ index, degree: degrees[i] }))
    .sort((a, b) => b.degree - a.degree)
    .map(item => item.index);

  // 为每个区域分配颜色
  for (const regionIndex of sortedRegions) {
    const neighbors = adjacencyGraph.get(regionIndex);
    const usedColors = new Set();
    
    // 收集邻居已使用的颜色
    for (const neighbor of neighbors) {
      if (colorAssignment[neighbor] !== -1) {
        usedColors.add(colorAssignment[neighbor]);
      }
    }

    // 找到第一个未使用的颜色
    let colorIndex = 0;
    while (colorIndex < numColors && usedColors.has(colorIndex)) {
      colorIndex++;
    }

    // 如果所有颜色都被使用，循环使用（理论上不应该发生，但作为保险）
    if (colorIndex >= numColors) {
      colorIndex = colorIndex % numColors;
    }

    colorAssignment[regionIndex] = colorIndex;
  }

  return colorAssignment;
};

/**
 * 预计算所有城市的RGB颜色值（使用图着色确保相邻区域不同颜色）
 * @param {Array} cityOrder - 城市顺序
 * @param {Array} sitesWithWeights - 站点数组（用于构建邻接图）
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {boolean} forceMultiColor - 是否强制使用复色模式（用于保存复色颜色信息）
 * @returns {Object} { colors: [{r, g, b, a}, ...], colorIndices: [0, 1, 2, ...] }
 */
const precomputeCityColors = (cityOrder, sitesWithWeights = null, width = null, height = null, forceMultiColor = false) => {
  // 如果 forceMultiColor 为 true，总是使用复色模式的透明度（用于保存复色颜色信息）
  // 否则根据当前的 backgroundMode 决定
  const opacity = (forceMultiColor || poiStore.colorSettings.backgroundMode === 'multi')
    ? (poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1)
    : 1;
  
  // 如果有站点信息，使用图着色算法
  let colorIndices = null;
  if (sitesWithWeights && width && height && cityOrder.length > 0) {
    try {
      // 构建邻接图（使用较低分辨率以提高性能）
      const adjacencyGraph = buildAdjacencyGraph(sitesWithWeights, cityOrder, width, height, 4);
      
      // 执行图着色
      const numColors = poiStore.Colors.length;
      colorIndices = graphColoring(adjacencyGraph, numColors);
      
      console.log('图着色完成，颜色分配:', colorIndices);
    } catch (error) {
      console.warn('图着色失败，使用循环分配:', error);
      colorIndices = null;
    }
  }

  // 如果没有使用图着色，使用原来的循环分配方式
  if (!colorIndices) {
    colorIndices = cityOrder.map((_, cityIndex) => cityIndex % poiStore.Colors.length);
  }
  
  const colors = cityOrder.map((city, cityIndex) => {
    const colorIndex = colorIndices[cityIndex];
    const bgColor = poiStore.Colors[colorIndex];
    
    // 转换颜色
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
 * 根据画布大小动态计算迭代分辨率
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {number} 分辨率步长（2-4像素）
 */
const calculateIterationResolution = (width, height) => {
  const area = width * height;
  // 根据画布面积动态调整分辨率
  if (area < 200000) return 2;      // 小画布：2像素
  if (area < 500000) return 3;      // 中等画布：3像素
  return 4;                          // 大画布：4像素
};

/**
 * 生成加权Voronoi图（单次迭代）
 * @param {Array} sitesWithWeights - 站点数组（包含x, y, weight, city）
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} resolution - 分辨率步长（默认1，迭代时使用2-4）
 * @param {boolean} generateImageData - 是否生成ImageData（迭代时为false，最终绘制时为true）
 * @param {Array} precomputedColors - 预计算的颜色数组
 * @param {boolean} saveRegionMap - 是否保存区域像素映射（用于快速更新颜色）
 * @returns {Object} { imageData, cityCenters, cityPixelCounts, sites, regionPixelMap }
 */
const generateSingleVoronoi = (sitesWithWeights, cityOrder, width, height, resolution = 1, generateImageData = false, precomputedColors = null, saveRegionMap = false) => {
  let imageData = null;
  let pixelData = null;
  let regionPixelMap = null; // 区域像素映射：Uint8Array，每个像素存储城市索引
  
  if (generateImageData) {
    imageData = new ImageData(width, height);
    pixelData = imageData.data;
  }
  
  // 如果需要保存区域映射，创建Uint8Array
  if (saveRegionMap) {
    regionPixelMap = new Uint8Array(width * height);
    // 初始化为255（无效值），用于调试
    regionPixelMap.fill(255);
  }
  
  // 创建城市索引映射
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });

  // 计算每个城市的像素统计
  const cityCenters = new Map();
  const cityPixelCounts = new Map();
  cityOrder.forEach(city => {
    cityCenters.set(city, { x: 0, y: 0, count: 0 });
    cityPixelCounts.set(city, 0);
  });

  // 遍历每个像素（按分辨率步长），计算加权距离，分配给最近的城市
  for (let y = 0; y < height; y += resolution) {
    for (let x = 0; x < width; x += resolution) {
      // 找到最近的城市站点
      let minDist = Infinity;
      let closestSite = null;
      
      for (const site of sitesWithWeights) {
        const dx = x - site.x;
        const dy = y - site.y;
        const euclideanDist = Math.sqrt(dx * dx + dy * dy);
        
        if (euclideanDist === 0) {
          closestSite = site;
          break;
        }
        
        const weight = Math.max(site.weight || 0.00001, 0.00001);
        const weightedDist = euclideanDist / Math.sqrt(weight);
        
        if (weightedDist < minDist) {
          minDist = weightedDist;
          closestSite = site;
        }
      }

      if (closestSite) {
        const cityIndex = cityIndexMap.get(closestSite.city);
        if (cityIndex !== undefined) {
          // 填充当前像素块（根据分辨率）
          for (let dy = 0; dy < resolution && (y + dy) < height; dy++) {
            for (let dx = 0; dx < resolution && (x + dx) < width; dx++) {
              const px = x + dx;
              const py = y + dy;
              
              // 保存区域映射
              if (saveRegionMap && regionPixelMap) {
                const pixelIndex = py * width + px;
                regionPixelMap[pixelIndex] = cityIndex;
              }
              
              // 如果生成ImageData，填充像素颜色
              if (generateImageData && pixelData && precomputedColors) {
                const color = precomputedColors[cityIndex];
                const index = (py * width + px) * 4;
                pixelData[index] = color.r;     // R
                pixelData[index + 1] = color.g; // G
                pixelData[index + 2] = color.b; // B
                pixelData[index + 3] = color.a; // A
              }
            }
          }

          // 计算形心（质心）- 使用采样点的坐标，但需要按分辨率权重计算
          const center = cityCenters.get(closestSite.city);
          if (center) {
            // 对于低分辨率采样，需要按像素块大小加权
            const pixelBlockSize = resolution * resolution;
            center.x += x * pixelBlockSize;
            center.y += y * pixelBlockSize;
            center.count += pixelBlockSize;
            cityPixelCounts.set(closestSite.city, cityPixelCounts.get(closestSite.city) + pixelBlockSize);
          }
        }
      }
    }
  }

  return { imageData, cityCenters, cityPixelCounts, sites: sitesWithWeights, regionPixelMap };
};

/**
 * 计算面积误差率
 * @param {Map} cityPixelCounts - 每个城市的实际像素数
 * @param {Array} cityWeights - 城市权重数组
 * @param {number} totalPixels - 总像素数
 * @returns {Object} { averageErrorRate, errorRates }
 */
const calculateAreaErrorRate = (cityPixelCounts, cityWeights, totalPixels) => {
  // 计算总权重
  const totalWeight = cityWeights.reduce((sum, w) => sum + w.weight, 0);
  
  const errorRates = [];
  
  cityWeights.forEach(weightInfo => {
    const city = weightInfo.city;
    const targetArea = (weightInfo.weight / totalWeight) * totalPixels;
    const actualArea = cityPixelCounts.get(city) || 0;
    const errorRate = targetArea > 0 ? Math.abs(actualArea - targetArea) / targetArea : 0;
    errorRates.push({ city, targetArea, actualArea, errorRate });
  });
  
  const averageErrorRate = errorRates.reduce((sum, e) => sum + e.errorRate, 0) / errorRates.length;
  
  return { averageErrorRate, errorRates };
};

/**
 * 计算形心并更新站点位置
 * @param {Map} cityCenters - 城市形心数据
 * @param {Array} sitesWithWeights - 当前站点数组
 * @returns {Array} 更新后的站点数组
 */
const updateSitesWithCentroids = (cityCenters, sitesWithWeights) => {
  return sitesWithWeights.map(site => {
    const center = cityCenters.get(site.city);
    if (center && center.count > 0) {
      // 使用形心作为新位置
      return {
        ...site,
        x: center.x / center.count,
        y: center.y / center.count
      };
    }
    return site; // 如果没有形心数据，保持原位置
  });
};

/**
 * 检查点是否在指定城市的Voronoi区域内
 * @param {number} x - 点的x坐标
 * @param {number} y - 点的y坐标
 * @param {string} city - 城市名称
 * @param {Map} regionMap - 区域映射
 * @returns {boolean} 是否在区域内
 */
const isPointInCityRegion = (x, y, city, regionMap) => {
  if (!regionMap || !regionMap.has(city)) {
    return false;
  }
  const pixelKey = `${Math.floor(x)},${Math.floor(y)}`;
  return regionMap.get(city).has(pixelKey);
};

/**
 * 检查文字边界框是否完全在区域内
 * @param {number} x - 文字中心x坐标
 * @param {number} y - 文字中心y坐标
 * @param {number} textWidth - 文字宽度
 * @param {number} textHeight - 文字高度
 * @param {string} city - 城市名称
 * @param {Map} regionMap - 区域映射
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} margin - 安全边距
 * @returns {boolean} 是否在区域内
 */
const isTextInCityRegion = (x, y, textWidth, textHeight, city, regionMap, width, height, margin = 3) => {
  // 计算文字边界框（带安全边距）
  const left = x - textWidth/2 - margin;
  const right = x + textWidth/2 + margin;
  const top = y - textHeight/2 - margin;
  const bottom = y + textHeight/2 + margin;
  
  // 检查边界框是否在画布内
  if (left < 0 || right > width || top < 0 || bottom > height) {
    return false;
  }
  
  // 优化：减少采样点数量（5个关键点）
  const samplePoints = [
    [left, top],           // 左上角
    [right, top],          // 右上角
    [left, bottom],        // 左下角
    [right, bottom],       // 右下角
    [x, y]                 // 中心点
  ];
  
  // 所有采样点都必须在区域内
  for (let [px, py] of samplePoints) {
    if (!isPointInCityRegion(px, py, city, regionMap)) {
      return false;
    }
  }
  
  return true;
};

/**
 * 更新碰撞检测的像素数据缓存
 * @param {CanvasRenderingContext2D} collisionCtx - 碰撞检测canvas的上下文
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 */
const updateCollisionImageData = (collisionCtx, width, height) => {
  if (!collisionCtx) return;
  
  try {
    // 获取整个canvas的像素数据并缓存
    collisionImageData = collisionCtx.getImageData(0, 0, width, height);
    collisionData = collisionImageData.data;
    collisionWidth = width;
  } catch (e) {
    console.warn('更新碰撞数据失败:', e);
    collisionImageData = null;
    collisionData = null;
    collisionWidth = 0;
  }
};

/**
 * 检查文字位置是否与已有像素重叠（使用隐藏canvas进行像素级检测）
 * @param {number} x - 文字中心x坐标
 * @param {number} y - 文字中心y坐标
 * @param {number} textWidth - 文字宽度
 * @param {number} textHeight - 文字高度
 * @param {CanvasRenderingContext2D} collisionCtx - 碰撞检测canvas的上下文
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} sampleRate - 采样率（1表示每个像素都检查，2表示每2个像素检查一次，提高性能）
 * @returns {boolean} 是否重叠
 */
const checkPixelCollision = (x, y, textWidth, textHeight, width, height, sampleRate = 3) => {
  if (!collisionData || collisionWidth === 0) {
    return false; // 如果没有缓存数据，不进行检测
  }
  
  // 计算文字边界框（添加一些边距以确保安全）
  const margin = 2;
  const left = Math.max(0, Math.floor(x - textWidth/2 - margin));
  const right = Math.min(width - 1, Math.ceil(x + textWidth/2 + margin));
  const top = Math.max(0, Math.floor(y - textHeight/2 - margin));
  const bottom = Math.min(height - 1, Math.ceil(y + textHeight/2 + margin));
  
  // 如果边界框无效，返回true（重叠）
  if (left >= right || top >= bottom) {
    return true;
  }
  
  // 计算实际需要检查的区域大小
  const w = right - left;
  const h = bottom - top;
  
  // 如果区域太小，直接返回false
  if (w <= 0 || h <= 0) {
    return false;
  }
  
  // 使用缓存的像素数据，直接从数组中读取（避免getImageData调用）
  // 优化：根据区域大小和文字大小动态调整采样策略
  const effectiveSampleRate = textWidth < 20 ? 1 : (textWidth < 35 ? 2 : 3);
  
  // 优化：提前计算边界，避免重复计算
  const leftBound = Math.max(0, left);
  const rightBound = Math.min(width, right);
  const topBound = Math.max(0, top);
  const bottomBound = Math.min(height, bottom);
  
  // 优化：对于非常小的区域，直接检查所有像素（避免采样遗漏）
  if (w <= 20 && h <= 20) {
    // 小区域：检查所有像素
    for (let py = 0; py < h; py++) {
      const globalY = topBound + py;
      if (globalY >= height) break;
      
      for (let px = 0; px < w; px++) {
        const globalX = leftBound + px;
        if (globalX >= width) break;
        
        const index = (globalY * collisionWidth + globalX) * 4;
        if (index + 3 < collisionData.length) {
          const alpha = collisionData[index + 3];
          if (alpha > 10) {
            return true; // 快速返回，避免继续检查
          }
        }
      }
    }
  } else {
    // 大区域：采样检查 + 边界点检查
    // 先检查关键边界点（快速失败）
    const keyPoints = [
      [0, 0], [w-1, 0], [0, h-1], [w-1, h-1], 
      [Math.floor(w/2), Math.floor(h/2)],
      [Math.floor(w/4), Math.floor(h/4)],
      [Math.floor(3*w/4), Math.floor(3*h/4)]
    ];
    
    for (const [px, py] of keyPoints) {
      const globalX = leftBound + px;
      const globalY = topBound + py;
      
      if (globalX >= 0 && globalX < width && globalY >= 0 && globalY < height) {
        const index = (globalY * collisionWidth + globalX) * 4;
        if (index + 3 < collisionData.length) {
          const alpha = collisionData[index + 3];
          if (alpha > 10) {
            return true; // 快速返回
          }
        }
      }
    }
    
    // 如果关键点都通过，再进行采样检查
    for (let py = 0; py < h; py += effectiveSampleRate) {
      const globalY = topBound + py;
      if (globalY >= height) break;
      
      for (let px = 0; px < w; px += effectiveSampleRate) {
        const globalX = leftBound + px;
        if (globalX >= width) break;
        
        // 跳过已经检查过的关键点
        const isKeyPoint = keyPoints.some(([kx, ky]) => kx === px && ky === py);
        if (isKeyPoint) continue;
        
        const index = (globalY * collisionWidth + globalX) * 4;
        if (index + 3 < collisionData.length) {
          const alpha = collisionData[index + 3];
          if (alpha > 10) {
            return true; // 快速返回
          }
        }
      }
    }
  }
  
  return false;
};

/**
 * 将文字绘制到碰撞检测canvas上（用于后续碰撞检测）
 * @param {string} text - 文字内容
 * @param {number} x - 文字中心x坐标
 * @param {number} y - 文字中心y坐标
 * @param {number} size - 字体大小
 * @param {string} fontFamily - 字体族
 * @param {string} fontWeight - 字重
 * @param {CanvasRenderingContext2D} collisionCtx - 碰撞检测canvas的上下文
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 */
const drawTextToCollisionCanvas = (text, x, y, size, fontFamily, fontWeight, collisionCtx, width, height) => {
  if (!collisionCtx || !collisionData || collisionWidth === 0) return;
  
  // 先测量文字尺寸，确定需要更新的区域
  collisionCtx.save();
  collisionCtx.font = `${fontWeight} ${size}px ${fontFamily}`;
  const metrics = collisionCtx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = size;
  collisionCtx.restore();
  
  // 计算文字边界框（添加边距以确保覆盖所有像素）
  const margin = 3; // 增加边距，确保覆盖抗锯齿产生的边缘像素
  const left = Math.max(0, Math.floor(x - textWidth/2 - margin));
  const right = Math.min(width, Math.ceil(x + textWidth/2 + margin));
  const top = Math.max(0, Math.floor(y - textHeight/2 - margin));
  const bottom = Math.min(height, Math.ceil(y + textHeight/2 + margin));
  
  // 绘制文字到canvas
  collisionCtx.save();
  collisionCtx.font = `${fontWeight} ${size}px ${fontFamily}`;
  collisionCtx.textAlign = 'center';
  collisionCtx.textBaseline = 'middle';
  // 使用不透明黑色，便于像素检测
  collisionCtx.fillStyle = 'rgba(0, 0, 0, 255)';
  // 禁用文字平滑，确保像素级精确检测
  collisionCtx.imageSmoothingEnabled = false;
  collisionCtx.fillText(text, x, y);
  collisionCtx.restore();
  
  // 只获取文字所在区域的像素数据（性能优化）
  if (left < right && top < bottom) {
    const regionWidth = right - left;
    const regionHeight = bottom - top;
    
    try {
      // 获取局部区域的像素数据
      const regionImageData = collisionCtx.getImageData(left, top, regionWidth, regionHeight);
      const regionData = regionImageData.data;
      
      // 将局部数据更新到全局缓存数组中
      for (let py = 0; py < regionHeight; py++) {
        for (let px = 0; px < regionWidth; px++) {
          const srcIndex = (py * regionWidth + px) * 4;
          const globalY = top + py;
          const globalX = left + px;
          
          // 确保坐标在有效范围内
          if (globalX >= 0 && globalX < width && globalY >= 0 && globalY < height) {
            const dstIndex = (globalY * collisionWidth + globalX) * 4;
            
            // 确保索引在有效范围内
            if (dstIndex + 3 < collisionData.length && srcIndex + 3 < regionData.length) {
              // 更新RGBA四个通道
              collisionData[dstIndex] = regionData[srcIndex];         // R
              collisionData[dstIndex + 1] = regionData[srcIndex + 1]; // G
              collisionData[dstIndex + 2] = regionData[srcIndex + 2]; // B
              collisionData[dstIndex + 3] = regionData[srcIndex + 3]; // A
            }
          }
        }
      }
    } catch (e) {
      // 如果局部更新失败，回退到全量更新（保守策略）
      console.warn('局部像素数据更新失败，回退到全量更新:', e);
      updateCollisionImageData(collisionCtx, width, height);
    }
  }
};

/**
 * 词云布局：在Voronoi区域内放置POI标签（使用优化的螺旋布局算法）
 * @param {Object} site - 站点信息（包含city, x, y, weight）
 * @param {Array} allSites - 所有站点数组
 * @param {Array} poiList - 该城市的POI列表
 * @param {Map} regionMap - 区域映射
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文（用于测量文字）
 * @param {CanvasRenderingContext2D} collisionCtx - 碰撞检测canvas的上下文
 * @param {Array} cityOrder - 城市顺序数组（用于获取城市序号）
 * @returns {Array} 已放置的词云项数组
 */
const layoutWordCloud = (site, allSites, poiList, regionMap, width, height, ctx, collisionCtx, cityOrder = []) => {
  if (!poiList || poiList.length === 0) {
    return [];
  }
  
  // 获取城市名称和字体设置
  const cityName = site.city;
  const fontSettings = poiStore.fontSettings;
  const minFontSize = fontSettings.minFontSize || 10;
  const maxFontSize = fontSettings.maxFontSize || 40;
  const fontFamily = fontSettings.fontFamily || 'Arial';
  const fontWeight = fontSettings.fontWeight || '700';
  const language = fontSettings.language || 'zh';
  const showCityIndex = fontSettings.showCityIndex || false;
  
  // 处理城市名：根据语言转换为拼音，并根据序号添加前缀
  let displayCityName = cityName;
  
  // 如果是英文模式，转换为拼音
  if (language === 'en') {
    displayCityName = cityNameToPinyin(cityName);
  }
  
  // 如果需要显示序号，添加序号前缀
  if (showCityIndex && cityOrder.length > 0) {
    const cityIndex = cityOrder.indexOf(cityName);
    if (cityIndex >= 0) {
      displayCityName = `${cityIndex + 1}. ${displayCityName}`;
    }
  }
  
  // 将城市名也加入词云，城市名使用较大字体
  const cityWord = {
    text: displayCityName,
    popularity: 100, // 城市名权重最高
    isCity: true,
    city: cityName // 保存原始城市名（用于后续快速重绘时重新生成显示文本）
  };
  
  // 其他POI按排名排序（排名越小，权重越大）
  // 注意：compiledData中的POI数据结构是 { text, rankInChina, city }，不是 { pname, rankInCity }
  // 过滤出真正属于当前城市的POI（解决重名景点被错误分配到其他城市的问题）
  const filteredPOIs = poiList.filter(poi => {
    // 如果POI有city字段，验证是否匹配当前城市
    if (poi.city !== undefined) {
      return poi.city === cityName;
    }
    // 如果没有city字段（兼容旧数据），保留该POI（但会记录警告）
    console.warn(`POI "${poi.text}" 缺少city字段，无法验证是否属于城市 ${cityName}`);
    return true;
  });
  
  const sortedPOIs = [...filteredPOIs].sort((a, b) => {
    const rankA = parseInt(a.rankInChina) || 100000;
    const rankB = parseInt(b.rankInChina) || 100000;
    return rankA - rankB;
  });
  
  // 如果过滤后没有POI，记录警告
  if (filteredPOIs.length < poiList.length) {
    const filteredCount = poiList.length - filteredPOIs.length;
    console.warn(`城市 ${cityName}: 过滤掉了 ${filteredCount} 个不属于该城市的POI（可能是重名景点）`);
  }
  
  // 计算popularity的范围（用于映射到字体大小）
  // 使用循环计算最小值和最大值，避免堆栈溢出
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
  
  // 处理所有词，城市名使用maxFontSize，其他POI映射到minFontSize到maxFontSize-10
  const words = [cityWord, ...sortedPOIs].map(poi => {
    let size;
    if (poi.isCity) {
      // 城市名使用最大字体
      size = maxFontSize;
    } else {
      // 其他POI按排名映射到字体大小（排名越小，字体越大）
      const rank = parseInt(poi.rankInChina) || 100000;
      const normalizedRank = (rank - minRank) / rankRange;
      size = minFontSize + (1 - normalizedRank) * (maxFontSize - minFontSize - 10);
    }
    return {
      text: poi.isCity ? poi.text : poi.text, // compiledData中使用的是text字段
      size: Math.max(minFontSize, Math.min(maxFontSize, size)),
      popularity: poi.isCity ? 100 : (100 - (parseInt(poi.rankInChina) || 100000)),
      isCity: poi.isCity || false,
      city: poi.isCity ? cityName : (poi.city || cityName) // 保存城市信息，确保重名景点能正确识别
    };
  }).sort((a, b) => b.size - a.size); // 按大小排序，先放大的
  
  const placed = [];
  const padding = 5;
  
  // 使用区域的形心作为螺旋布局中心
  // 从finalCityCentersForText获取形心，如果没有则使用站点位置
  let centerX = site.x;
  let centerY = site.y;
  
  // 尝试从区域映射中找到区域的中心点
  if (regionMap && regionMap.has(cityName)) {
    const pixels = Array.from(regionMap.get(cityName));
    if (pixels.length > 0) {
      let sumX = 0, sumY = 0;
      pixels.forEach(pixelKey => {
        const [px, py] = pixelKey.split(',').map(Number);
        sumX += px;
        sumY += py;
      });
      centerX = sumX / pixels.length;
      centerY = sumY / pixels.length;
    }
  }
  
  // 性能优化：记录难以摆放的标签的最小空间大小（面积）
  // 如果某个标签在所有策略都失败后，记录其空间大小
  // 后续如果遇到更大的标签，直接跳过，避免无效尝试
  let minFailedArea = Infinity; // 记录难以摆放的标签的最小面积
  
  for (let word of words) {
    // 测量文字尺寸（使用缓存）
    const cacheKey = `${word.text}_${word.size}_${fontFamily}_${fontWeight}`;
    let textWidth, textHeight;
    
    if (fontMetricsCache.has(cacheKey)) {
      const cached = fontMetricsCache.get(cacheKey);
      textWidth = cached.width;
      textHeight = cached.height;
    } else {
      ctx.font = `${fontWeight} ${word.size}px ${fontFamily}`;
      const metrics = ctx.measureText(word.text);
      textWidth = metrics.width;
      textHeight = word.size;
      fontMetricsCache.set(cacheKey, { width: textWidth, height: textHeight });
    }
    
    // 根据标签大小调整边界检查的严格程度
    const margin = word.size < 15 ? 1 : (word.size < 30 ? 2 : 3);
    
    // 计算实际需要的空间大小（包括边距）
    const actualWidth = textWidth + margin * 2;
    const actualHeight = textHeight + margin * 2;
    const actualArea = actualWidth * actualHeight;
    
    // 性能优化：如果当前标签的实际空间大小大于已记录的最小失败空间大小，直接跳过
    if (actualArea > minFailedArea) {
      // console.log(`城市 ${cityName}: 标签 "${word.text}" (${word.size.toFixed(1)}px, 实际面积=${actualArea.toFixed(0)}) 空间过大，跳过（已记录最小失败面积=${minFailedArea.toFixed(0)}）`);
      continue;
    }
    
    let placedWord = false;
    
    // 策略1：螺旋搜索（从中心向外）- 优化：增加步长，减少尝试次数
    let spiralRadius = 0;
    let angle = 0;
    const angleStep = 0.4; // 从0.25增加到0.4，减少角度步数
    const radiusStep = 1.5; // 从1.2增加到1.5，加快半径增长
    
    const maxSpiralRadius = Math.max(width, height) * 1.2;
    const maxSpiralAttempts = 1500; // 从3000减少到1500
    let spiralAttempts = 0;
    
    // 快速跳过策略：如果连续多次失败，增加步长
    let consecutiveFailures = 0;
    const failureThreshold = 50; // 连续失败50次后增加步长
    
    while (!placedWord && spiralRadius < maxSpiralRadius && spiralAttempts < maxSpiralAttempts) {
      spiralAttempts++;
      const x = centerX + spiralRadius * Math.cos(angle);
      const y = centerY + spiralRadius * Math.sin(angle);
      
      // 优化：按性能从快到慢的顺序进行检查，快速失败
      // 1. 最快：检查是否在画布内（简单数值比较）
      if (x < 0 || x > width || y < 0 || y > height) {
        consecutiveFailures++;
        angle += angleStep * (consecutiveFailures > failureThreshold ? 2 : 1);
        spiralRadius += radiusStep * 0.08 * (consecutiveFailures > failureThreshold ? 2 : 1);
        continue;
      }
      
      // 2. 中等：检查是否在区域内（Map查找，O(1)）
      if (!isTextInCityRegion(x, y, textWidth, textHeight, cityName, regionMap, width, height, margin)) {
        consecutiveFailures++;
        angle += angleStep * (consecutiveFailures > failureThreshold ? 2 : 1);
        spiralRadius += radiusStep * 0.08 * (consecutiveFailures > failureThreshold ? 2 : 1);
        continue;
      }
      
      // 3. 最慢：像素级碰撞检测（数组读取，但已优化为缓存）
      // 使用更严格的采样率（2）确保检测准确性
      if (checkPixelCollision(x, y, textWidth, textHeight, width, height, 2)) {
        consecutiveFailures++;
        angle += angleStep * (consecutiveFailures > failureThreshold ? 2 : 1);
        spiralRadius += radiusStep * 0.08 * (consecutiveFailures > failureThreshold ? 2 : 1);
        continue;
      }
      
      // 找到合适位置，重置失败计数
      consecutiveFailures = 0;
      
      // 找到合适位置，添加到已放置列表并绘制到碰撞canvas
      // 保存POI的城市信息，确保后续能正确识别
      const poiCity = word.city || cityName; // 如果word有city字段，使用它；否则使用当前城市
      placed.push({
        text: word.text,
        x: x,
        y: y,
        size: word.size,
        width: textWidth,
        height: textHeight,
        popularity: word.popularity,
        isCity: word.isCity,
        city: poiCity // 保存城市信息
      });
      
      // 将文字绘制到碰撞检测canvas上，用于后续碰撞检测
      if (collisionCtx) {
        drawTextToCollisionCanvas(word.text, x, y, word.size, fontFamily, fontWeight, collisionCtx, width, height);
      }
      
      placedWord = true;
    }
    
    // 策略2：如果螺旋搜索失败，使用网格搜索
    if (!placedWord && regionMap && regionMap.has(cityName)) {
      const pixels = Array.from(regionMap.get(cityName));
      if (pixels.length > 0) {
        // 使用循环计算最小值和最大值，避免堆栈溢出
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const pixelKey of pixels) {
          const [px, py] = pixelKey.split(',').map(Number);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        
        // 限制在画布范围内
        minX = Math.max(0, minX);
        maxX = Math.min(width, maxX);
        minY = Math.max(0, minY);
        maxY = Math.min(height, maxY);
        
        // 检查边界框是否有效
        if (minX >= maxX || minY >= maxY) {
          // 边界框无效，跳过网格搜索
          continue;
        }
        
        const gridSize = Math.max(textWidth, textHeight) * 1.5;
        const cols = Math.ceil((maxX - minX) / gridSize);
        const rows = Math.ceil((maxY - minY) / gridSize);
        const maxGridAttempts = Math.min(cols * rows, 500);
        
        let gridAttempts = 0;
        for (let r = 0; r < rows && !placedWord && gridAttempts < maxGridAttempts; r++) {
          for (let c = 0; c < cols && !placedWord && gridAttempts < maxGridAttempts; c++) {
            gridAttempts++;
            const x = minX + c * gridSize + gridSize * 0.5;
            const y = minY + r * gridSize + gridSize * 0.5;
            
            const offsetX = (Math.random() - 0.5) * gridSize * 0.3;
            const offsetY = (Math.random() - 0.5) * gridSize * 0.3;
            const testX = x + offsetX;
            const testY = y + offsetY;
            
            if (testX < 0 || testX > width || testY < 0 || testY > height) {
              continue;
            }
            
            if (!isTextInCityRegion(testX, testY, textWidth, textHeight, cityName, regionMap, width, height, margin)) {
              continue;
            }
            
            // 使用像素级碰撞检测（使用缓存的像素数据）
            // 使用更严格的采样率（2）确保检测准确性
            if (checkPixelCollision(testX, testY, textWidth, textHeight, width, height, 2)) {
              continue;
            }
            
            // 找到合适位置，添加到已放置列表并绘制到碰撞canvas
            const poiCity = word.city || cityName; // 如果word有city字段，使用它；否则使用当前城市
            placed.push({
              text: word.text,
              x: testX,
              y: testY,
              size: word.size,
              width: textWidth,
              height: textHeight,
              popularity: word.popularity,
              isCity: word.isCity,
              city: poiCity // 保存城市信息
            });
            
            // 将文字绘制到碰撞检测canvas上，用于后续碰撞检测
            if (collisionCtx) {
              drawTextToCollisionCanvas(word.text, testX, testY, word.size, fontFamily, fontWeight, collisionCtx, width, height);
            }
            
            placedWord = true;
          }
        }
      }
    }
    
    // 策略3：如果网格搜索也失败，使用随机搜索（最后备用策略）
    if (!placedWord && regionMap && regionMap.has(cityName)) {
      const pixels = Array.from(regionMap.get(cityName));
      if (pixels.length > 0) {
        // 计算区域的边界框
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const pixelKey of pixels) {
          const [px, py] = pixelKey.split(',').map(Number);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        
        // 限制在画布范围内
        minX = Math.max(0, minX);
        maxX = Math.min(width, maxX);
        minY = Math.max(0, minY);
        maxY = Math.min(height, maxY);
        
        // 检查边界框是否有效
        if (minX < maxX && minY < maxY) {
          // 随机搜索：在区域内随机选择位置
          // 基础尝试次数：500次，小文字（<20px）加倍
          const baseAttempts = 500;
          const maxAttempts = word.size < 20 ? baseAttempts * 2 : baseAttempts;
          
          for (let attempt = 0; attempt < maxAttempts && !placedWord; attempt++) {
            // 在区域内随机选择位置
            const testX = minX + Math.random() * (maxX - minX);
            const testY = minY + Math.random() * (maxY - minY);
            
            // 快速检查是否在画布内
            if (testX < 0 || testX > width || testY < 0 || testY > height) {
              continue;
            }
            
            // 检查是否在区域内
            if (!isTextInCityRegion(testX, testY, textWidth, textHeight, cityName, regionMap, width, height, margin)) {
              continue;
            }
            
            // 使用像素级碰撞检测
            if (checkPixelCollision(testX, testY, textWidth, textHeight, width, height, 2)) {
              continue;
            }
            
            // 找到合适位置
            const poiCity = word.city || cityName; // 如果word有city字段，使用它；否则使用当前城市
            placed.push({
              text: word.text,
              x: testX,
              y: testY,
              size: word.size,
              width: textWidth,
              height: textHeight,
              popularity: word.popularity,
              isCity: word.isCity,
              city: poiCity // 保存城市信息
            });
            
            // 将文字绘制到碰撞检测canvas上
            if (collisionCtx) {
              drawTextToCollisionCanvas(word.text, testX, testY, word.size, fontFamily, fontWeight, collisionCtx, width, height);
            }
            
            placedWord = true;
          }
        }
      }
    }
    
    // 性能优化：如果所有策略都失败，记录该标签的实际空间大小（包括边距）
    // 如果当前标签的实际空间大小小于已记录的最小失败空间大小，更新记录
    if (!placedWord) {
      if (actualArea < minFailedArea) {
        minFailedArea = actualArea;
        // console.log(`城市 ${cityName}: 标签 "${word.text}" (${word.size.toFixed(1)}px, 实际面积=${actualArea.toFixed(0)}) 所有策略都失败，更新最小失败面积为 ${minFailedArea.toFixed(0)}`);
      }
    }
  }
  
  return placed;
};

/**
 * 绘制词云到各个Voronoi子区域
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文（用于测量文字）
 * @param {CanvasRenderingContext2D} collisionCtx - 碰撞检测canvas的上下文
 * @param {Array} sites - 站点数组
 * @param {Array} cityOrder - 城市顺序
 * @param {Object} data - 编译后的数据（按城市分组）
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} colorIndices - 颜色索引数组（可选，用于确保文字颜色与背景颜色一致）
 */
const drawWordCloudInRegions = async (ctx, collisionCtx, sites, cityOrder, data, width, height, colorIndices = null) => {
  if (!currentRegionMap) {
    console.warn('区域映射未生成，无法绘制词云');
    return;
  }
  
  console.log('开始绘制词云...');

  // 初始化遮罩进度信息（按城市粒度）
  loadingStage.value = '正在为各个城市布局标签…';
  loadingTotalCities.value = sites.length;
  loadingCurrentIndex.value = 0;
  loadingCurrentCity.value = '';
  
  // 清空碰撞检测canvas和缓存
  if (collisionCtx) {
    collisionCtx.clearRect(0, 0, width, height);
    // 初始化像素数据缓存
    updateCollisionImageData(collisionCtx, width, height);
  }
  
  // 清空字体测量缓存（每次重新生成时清空）
  fontMetricsCache.clear();
  
  // 为每个城市生成词云
  const allWordCloud = [];
  for (let siteIndex = 0; siteIndex < sites.length; siteIndex++) {
    const site = sites[siteIndex];

    // 更新遮罩上的当前城市与进度信息
    loadingCurrentCity.value = site.city || '';
    loadingCurrentIndex.value = siteIndex + 1;

    const cityPOIs = data[site.city] || [];
    if (cityPOIs.length === 0) {
      console.warn(`城市 ${site.city} 没有POI数据`);
      continue;
    }
    
    const wordCloud = layoutWordCloud(site, sites, cityPOIs, currentRegionMap, width, height, ctx, collisionCtx, cityOrder);
    allWordCloud.push(...wordCloud);
    console.log(`城市 ${site.city}: 放置了 ${wordCloud.length} 个标签`);
    
    // 让出一帧，刷新遮罩显示
    if (siteIndex % 1 === 0) {
      await nextTick();
      await waitNextFrame();
    }
  }
  
  // 创建POI到城市的映射（用于快速查找）
  // 使用 city+text 组合作为key，解决重名景点问题
  const poiToCityMap = new Map();
  const poiKeyToCityMap = new Map(); // 使用唯一key（city+text）映射到城市
  cityOrder.forEach(cityName => {
    const cityPOIs = data[cityName] || [];
    cityPOIs.forEach(poi => {
      // 如果POI有city字段，使用它；否则使用当前城市名（兼容旧数据）
      const poiCity = poi.city !== undefined ? poi.city : cityName;
      // 使用 city+text 作为唯一key，避免重名冲突
      const uniqueKey = `${poiCity}|${poi.text}`;
      poiKeyToCityMap.set(uniqueKey, poiCity);
      // 同时保留简单的text映射（用于向后兼容，但可能被重名覆盖）
      // 优先使用有city字段的POI
      if (!poiToCityMap.has(poi.text) || poi.city === cityName) {
        poiToCityMap.set(poi.text, poiCity);
      }
    });
  });
  
  // 保存布局信息（用于后续快速重绘）
  // 创建颜色索引映射（必须使用图着色算法的颜色索引，确保相邻区域不同颜色）
  const colorIndicesMap = new Map();
  if (colorIndices && colorIndices.length === cityOrder.length) {
    // 使用提供的颜色索引（来自图着色算法）
    cityOrder.forEach((city, cityIndex) => {
      colorIndicesMap.set(city, colorIndices[cityIndex]);
    });
  } else {
    // 如果没有提供颜色索引，报错（不应该发生，因为必须使用图着色算法）
    console.error('错误：drawWordCloudInRegions 未接收到颜色索引，无法确保颜色一致性');
    // 使用循环分配作为最后的回退（但这不是理想情况）
    cityOrder.forEach((city, cityIndex) => {
      colorIndicesMap.set(city, cityIndex % poiStore.Colors.length);
    });
  }
  
  savedWordCloudLayout = {
    items: allWordCloud.map(item => {
      // 确定对应的城市
      let cityName = null;
      if (item.isCity) {
        // 对于城市名，item.city 保存的是原始城市名（在 layoutWordCloud 中设置的）
        cityName = item.city || item.text;
      } else {
        // 优先使用item中保存的city字段（如果layoutWordCloud传递了city信息）
        if (item.city) {
          cityName = item.city;
        } else {
          // 回退到使用映射查找
          cityName = poiToCityMap.get(item.text);
        }
      }
      
      return {
        text: item.text,
        x: item.x,
        y: item.y,
        size: item.size,
        width: item.width,
        height: item.height,
        popularity: item.popularity,
        isCity: item.isCity,
        city: cityName // 保存原始城市名（对于城市名，这是原始城市名；对于POI，这是所属城市名）
      };
    }),
    sites: sites.map(s => ({ city: s.city, x: s.x, y: s.y })),
    cityOrder: [...cityOrder],
    colorIndicesMap: colorIndicesMap // 保存颜色索引映射
  };
  
  // 绘制词云
  renderWordCloudFromLayout(ctx, savedWordCloudLayout, width, height);
  
  console.log(`词云绘制完成，共绘制 ${allWordCloud.length} 个标签`);
};

/**
 * 快速更新背景颜色（仅更新颜色，不重新计算区域）
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} cityOrder - 城市顺序
 * @param {boolean} forceRecalculateFromPalette - 是否强制从配色方案重新计算（用于配色方案变化时）
 * @returns {boolean} 是否成功更新
 */
const fastUpdateBackgroundColors = (ctx, width, height, cityOrder, forceRecalculateFromPalette = false) => {
  // 检查是否有保存的区域映射
  if (!savedRegionPixelMap || !savedCanvasSize || !savedCityOrder || !savedColorIndices) {
    console.warn('没有保存的区域映射或颜色索引，无法快速更新背景颜色');
    return false;
  }
  
  // 检查画布尺寸是否匹配
  if (savedCanvasSize.width !== width || savedCanvasSize.height !== height) {
    console.warn('画布尺寸不匹配，无法快速更新背景颜色');
    return false;
  }
  
  // 检查城市顺序是否匹配
  if (savedCityOrder.length !== cityOrder.length || 
      !savedCityOrder.every((city, index) => city === cityOrder[index])) {
    console.warn('城市顺序不匹配，无法快速更新背景颜色');
    return false;
  }
  
  // 根据当前模式决定使用哪种颜色
  const currentMode = poiStore.colorSettings.backgroundMode;
  let colors;
  
  if (currentMode === 'multi') {
    // 复色模式
    // 如果强制重新计算（配色方案变化时），或者没有保存的复色颜色，从配色方案重新计算
    if (forceRecalculateFromPalette || !savedMultiColorColors || savedMultiColorColors.length !== cityOrder.length) {
      // 从当前的配色方案重新计算颜色（确保与文字颜色一致）
      const opacity = poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1;
      colors = cityOrder.map((city, cityIndex) => {
        const colorIndex = savedColorIndices[cityIndex];
        const bgColor = poiStore.Colors[colorIndex]; // 从新的配色方案获取颜色
        
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
      if (forceRecalculateFromPalette) {
        console.log('配色方案变化，从新的配色方案重新计算背景颜色（确保与文字颜色一致）');
      } else {
        console.warn('没有保存的复色颜色信息，从配色方案重新计算');
      }
    } else {
      // 使用保存的复色颜色（仅用于透明度变化等情况，不用于配色方案变化）
      const currentOpacity = poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1;
      colors = savedMultiColorColors.map(c => {
        // 保持RGB不变，只更新透明度
        return {
          r: c.r,
          g: c.g,
          b: c.b,
          a: Math.floor(255 * currentOpacity)
        };
      });
      console.log('使用保存的复色颜色信息（已根据当前透明度设置更新）');
    }
  } else {
    // 单色模式：生成单色
    const singleBgColor = poiStore.colorSettings.background || 'rgb(255, 255, 255)';
    let r, g, b;
    if (singleBgColor.startsWith('#')) {
      const hex = singleBgColor.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (singleBgColor.startsWith('rgb')) {
      const rgbMatch = singleBgColor.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        r = parseInt(rgbMatch[0]);
        g = parseInt(rgbMatch[1]);
        b = parseInt(rgbMatch[2]);
      } else {
        r = g = b = 255;
      }
    } else {
      r = g = b = 255;
    }
    colors = cityOrder.map(() => ({ r, g, b, a: 255 }));
  }
  
  // 创建新的ImageData
  const imageData = new ImageData(width, height);
  const pixelData = imageData.data;
  
  // 遍历所有像素，根据保存的区域映射快速更新颜色
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const cityIndex = savedRegionPixelMap[pixelIndex];
      
      // 检查城市索引是否有效
      if (cityIndex !== undefined && cityIndex < colors.length) {
        const color = colors[cityIndex];
        const dataIndex = pixelIndex * 4;
        pixelData[dataIndex] = color.r;     // R
        pixelData[dataIndex + 1] = color.g; // G
        pixelData[dataIndex + 2] = color.b; // B
        pixelData[dataIndex + 3] = color.a; // A
      }
    }
  }
  
  // 绘制到canvas
  ctx.putImageData(imageData, 0, 0);
  
  console.log('快速更新背景颜色完成');
  return true;
};

/**
 * 基于已保存的布局信息快速重绘词云（用于字体、颜色等设置变化时）
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @param {Object} layout - 保存的布局信息
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 */
const renderWordCloudFromLayout = (ctx, layout, width, height) => {
  if (!layout || !layout.items || layout.items.length === 0) {
    return;
  }
  
  const fontSettings = poiStore.fontSettings;
  const fontFamily = fontSettings.fontFamily || 'Arial';
  const fontWeight = fontSettings.fontWeight || '700';
  const textColorMode = poiStore.colorSettings.textColorMode || 'multi';
  const textSingleColor = poiStore.colorSettings.textSingleColor || '#000000';
  
  // 使用保存的颜色索引映射（必须使用图着色算法的颜色索引，确保与背景颜色一致）
  let colorIndicesMap;
  if (layout.colorIndicesMap && layout.colorIndicesMap instanceof Map) {
    // 使用保存的颜色索引映射（来自图着色算法，确保与背景颜色一致）
    colorIndicesMap = layout.colorIndicesMap;
  } else {
    // 如果没有保存的颜色索引映射，尝试使用 savedColorIndices（来自图着色算法）
    if (savedColorIndices && savedColorIndices.length === layout.cityOrder.length) {
      console.warn('布局中没有保存颜色索引映射，使用全局保存的颜色索引');
      colorIndicesMap = new Map();
      layout.cityOrder.forEach((city, cityIndex) => {
        colorIndicesMap.set(city, savedColorIndices[cityIndex]);
      });
    } else {
      // 最后的回退：使用循环分配（但这不是理想情况，应该避免）
      console.error('错误：无法找到图着色算法的颜色索引，使用循环分配（可能导致颜色不一致）');
      colorIndicesMap = new Map();
      layout.cityOrder.forEach((city, cityIndex) => {
        colorIndicesMap.set(city, cityIndex % poiStore.Colors.length);
      });
    }
  }
  
  layout.items.forEach(item => {
    // 城市名默认用红色字体
    let textColor = '#000000';
    let displayText = item.text;
    
    // 如果是城市名，根据当前的语言和序号设置重新生成显示文本
    if (item.isCity && item.city) {
      const language = fontSettings.language || 'zh';
      const showCityIndex = fontSettings.showCityIndex || false;
      
      // 根据语言转换为拼音
      if (language === 'en') {
        displayText = cityNameToPinyin(item.city);
      } else {
        displayText = item.city;
      }
      
      // 如果需要显示序号，添加序号前缀
      if (showCityIndex && layout.cityOrder && layout.cityOrder.length > 0) {
        const cityIndex = layout.cityOrder.indexOf(item.city);
        if (cityIndex >= 0) {
          displayText = `${cityIndex + 1}. ${displayText}`;
        }
      }
    }
    
    if (item.isCity) {
      // 城市名使用红色
      textColor = '#ff0000';
    } else {
      // 其他文字按照文字配色设置
      const cityName = item.city;
      if (cityName) {
        const colorIndex = colorIndicesMap.get(cityName) ?? 0;
        const bgColor = poiStore.Colors[colorIndex];
        
        if (textColorMode === 'single') {
          textColor = textSingleColor;
        } else {
          // 复色模式：使用对应城市的背景色
          textColor = bgColor;
        }
      }
    }
    
    ctx.save();
    ctx.font = `${fontWeight} ${item.size}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    
    // 如果是城市名，添加描边效果
    if (item.isCity) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeText(displayText, item.x, item.y);
    }
    
    ctx.fillText(displayText, item.x, item.y);
    ctx.restore();
  });
};

/**
 * 仅基于已有的加权Voronoi结果重新生成词云
 * 不重新计算Voronoi背景，提升字体调整时的性能
 */
const relayoutWordCloudOnly = async () => {
  if (
    !poiStore.hasDrawing ||
    !savedSites ||
    !savedSites.length ||
    !savedRegionPixelMap ||
    !savedCanvasSize ||
    !savedCityOrder ||
    !savedColorIndices ||
    !wordCloudCanvasRef.value
  ) {
    console.warn('[TagCloudCanvas] 缺少已保存的背景/布局信息，无法仅重新布局词云，回退到完整重绘');
    await handleRenderCloud();
    return;
  }

  const canvas = wordCloudCanvasRef.value;
  const width = canvas.width;
  const height = canvas.height;

  // 如果画布尺寸与保存的尺寸不一致，说明布局环境已变，直接完整重绘
  if (width !== savedCanvasSize.width || height !== savedCanvasSize.height) {
    console.warn('[TagCloudCanvas] 画布尺寸与保存的Voronoi结果不一致，回退到完整重绘');
    await handleRenderCloud();
    return;
  }

  // 确保上下文可用
  if (!wordCloudCtx) {
    wordCloudCtx = canvas.getContext('2d');
  }

  // 确保碰撞检测 canvas 存在且尺寸一致
  if (!collisionCanvas || collisionCanvas.width !== width || collisionCanvas.height !== height) {
    collisionCanvas = document.createElement('canvas');
    collisionCanvas.width = width;
    collisionCanvas.height = height;
    collisionCtx = collisionCanvas.getContext('2d');
    collisionCanvas.style.display = 'none';
  }

  // 基于保存的站点信息构造 sites，用于词云布局
  const sites = savedSites.map(s => ({
    city: s.city,
    x: s.x,
    y: s.y,
    weight: s.weight || 0.00001,
  }));

  // 重绘前开启遮罩并初始化提示
  loadingStage.value = '正在重新布局标签云…';
  loadingCurrentCity.value = '';
  loadingCurrentIndex.value = 0;
  loadingTotalCities.value = sites.length;
  poiStore.setCloudLoading(true);
  await nextTick(); // 让遮罩渲染
  await waitNextFrame();

  try {
    // 清空之前的词云画布和布局缓存
    wordCloudCtx.clearRect(0, 0, width, height);
    savedWordCloudLayout = null;
    fontMetricsCache.clear();

    // 重新根据当前字体设置生成词云
    await drawWordCloudInRegions(
      wordCloudCtx,
      collisionCtx,
      sites,
      poiStore.cityOrder,
      poiStore.compiledData,
      width,
      height,
      savedColorIndices
    );
  } finally {
    poiStore.setCloudLoading(false);
    loadingStage.value = '';
    loadingCurrentCity.value = '';
    loadingCurrentIndex.value = 0;
    loadingTotalCities.value = 0;
  }

  console.log('[TagCloudCanvas] 仅重新布局词云完成（未重新计算加权Voronoi）');
};

// 绘制加权Voronoi图到Canvas（带迭代优化）
const drawWeightedVoronoi = async (voronoiCanvas, voronoiCtx, wordCloudCanvas, wordCloudCtx, data, cityOrder, width, height) => {
  // 清空两个画布
  voronoiCtx.clearRect(0, 0, width, height);
  wordCloudCtx.clearRect(0, 0, width, height);
  
  // 设置维诺图画布背景色
  loadingStage.value = '正在初始化画布与背景…';
  let bgColor;
  if (poiStore.colorSettings.backgroundMode === 'single') {
    bgColor = poiStore.colorSettings.background;
  } else {
    // 复色模式：使用复色方案中的第一个颜色作为背景色
    const palette = poiStore.colorSettings.palette || [];
    if (palette.length > 0) {
      bgColor = palette[0];
    } else {
      bgColor = 'rgb(255, 255, 255)'; // 默认白色
    }
  }
  voronoiCtx.fillStyle = bgColor;
  voronoiCtx.fillRect(0, 0, width, height);
  
  // 词云canvas设置为透明背景
  wordCloudCtx.clearRect(0, 0, width, height);

  // 加载城市坐标
  loadingStage.value = '正在加载城市坐标…';
  const cities = await loadCityCoordinates();
  if (!cities || !cities.cities) {
    console.error('无法加载城市坐标数据');
    return;
  }

  // 计算城市权重
  loadingStage.value = '正在计算城市权重…';
  const cityWeights = calculateCityWeights(data, cityOrder);
  
  // 将经纬度坐标映射到画布空间（初始站点）
  loadingStage.value = '正在映射城市到画布坐标…';
  const initialSites = mapCoordinatesToCanvas(cities, cityOrder, width, height);
  
  if (initialSites.length === 0) {
    console.warn('没有有效的城市站点');
    return;
  }

  // 合并权重信息到站点
  let sitesWithWeights = initialSites.map(site => {
    const weightInfo = cityWeights.find(w => w.city === site.city);
    return {
      ...site,
      weight: weightInfo ? weightInfo.weight : 0.00001
    };
  });

  const totalPixels = width * height;
  const maxIterations = 25; // 增加最大迭代次数
  const targetErrorRate = 0.12; // 12%（稍微放宽，因为最终会有权重调整优化）
  
  // 计算迭代分辨率（低分辨率用于迭代）
  const iterationResolution = calculateIterationResolution(width, height);
  console.log(`迭代分辨率: ${iterationResolution}像素步长`);
  
  // 存储每次迭代的结果（只存储统计信息，不存储ImageData）
  const iterationResults = [];
  
  console.log('开始迭代优化加权Voronoi图...');
  console.log(`目标：平均面积误差率 < ${(targetErrorRate * 100).toFixed(1)}%，最多迭代 ${maxIterations} 次`);

  // 迭代优化循环（使用低分辨率，不生成ImageData）
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    loadingStage.value = `正在调整城市区域面积（第 ${iteration + 1}/${maxIterations} 轮迭代）…`;
    // 每轮迭代开始前让浏览器渲染一帧，刷新遮罩内容
    await nextTick();
    await waitNextFrame();
    console.log(`\n=== 迭代 ${iteration + 1}/${maxIterations} ===`);
    
    // 生成Voronoi图（低分辨率，不生成ImageData）
    const { cityCenters, cityPixelCounts, sites } = generateSingleVoronoi(
      sitesWithWeights, 
      cityOrder, 
      width, 
      height,
      iterationResolution,  // 使用低分辨率
      false,                 // 不生成ImageData
      null                   // 不需要颜色
    );
    
    // 计算面积误差率（需要根据分辨率调整总像素数）
    const sampledPixels = Math.ceil(width / iterationResolution) * Math.ceil(height / iterationResolution);
    const pixelBlockSize = iterationResolution * iterationResolution;
    const adjustedTotalPixels = sampledPixels * pixelBlockSize;
    
    const { averageErrorRate, errorRates } = calculateAreaErrorRate(
      cityPixelCounts, 
      cityWeights, 
      adjustedTotalPixels
    );
    
    // 记录本次迭代结果（只存储统计信息）
    const iterationResult = {
      iteration: iteration + 1,
      sites: sites.map(s => ({ city: s.city, x: s.x, y: s.y, weight: s.weight })),
      cityCenters: new Map(cityCenters), // 保存形心数据
      averageErrorRate,
      errorRates: errorRates.map(e => ({
        city: e.city,
        targetArea: Math.round(e.targetArea),
        actualArea: e.actualArea,
        errorRate: (e.errorRate * 100).toFixed(2) + '%'
      }))
    };
    
    iterationResults.push(iterationResult);
    
    console.log(`平均面积误差率: ${(averageErrorRate * 100).toFixed(2)}%`);
    console.log('各城市面积误差率:');
    errorRates.forEach(e => {
      console.log(`  ${e.city}: 目标=${Math.round(e.targetArea)}, 实际=${e.actualArea}, 误差率=${(e.errorRate * 100).toFixed(2)}%`);
    });
    
    // 检查是否达到目标
    if (averageErrorRate < targetErrorRate) {
      console.log(`\n✓ 达到目标！平均面积误差率 ${(averageErrorRate * 100).toFixed(2)}% < ${(targetErrorRate * 100).toFixed(1)}%`);
      break;
    }
    
    // 计算形心并更新站点位置（为下一次迭代准备）
    if (iteration < maxIterations - 1) {
      sitesWithWeights = updateSitesWithCentroids(cityCenters, sitesWithWeights);
      console.log('已更新站点位置为形心，准备下一次迭代...');
    }
  }

  // 选择平均面积误差率最低的方案
  const bestResult = iterationResults.reduce((best, current) => {
    return current.averageErrorRate < best.averageErrorRate ? current : best;
  }, iterationResults[0]);

  console.log(`\n=== 最终结果 ===`);
  console.log(`选择迭代 ${bestResult.iteration} 的结果（平均面积误差率最低: ${(bestResult.averageErrorRate * 100).toFixed(2)}%）`);
  console.log('最终站点坐标:');
  bestResult.sites.forEach(s => {
    console.log(`  ${s.city}: (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
  });

  // 使用最佳站点位置生成最终全分辨率Voronoi图
  console.log('生成最终全分辨率图像...');
  // 构建最终站点数组，使用最佳迭代的站点位置
  let finalSites = bestResult.sites.map(s => {
    // 从原始站点数组中获取完整信息，但使用最佳迭代的坐标
    const originalSite = sitesWithWeights.find(orig => orig.city === s.city);
    if (originalSite) {
      return {
        ...originalSite,
        x: s.x,
        y: s.y
      };
    }
    // 如果找不到原始站点，使用保存的站点信息
    return s;
  });
  
  // 在最终生成前，先计算一次面积误差率，对面积不足的小城市进行权重调整
  console.log('计算最终面积误差率并进行权重优化...');
  // 使用适中的分辨率进行快速检查（平衡准确性和性能）
  const checkResolution = width * height > 500000 ? 3 : 2;
  const { cityCenters: finalCheckCenters, cityPixelCounts: finalCheckPixelCounts } = generateSingleVoronoi(
    finalSites,
    cityOrder,
    width,
    height,
    checkResolution,        // 使用适中分辨率快速检查
    false,                  // 不生成ImageData
    null                    // 不需要颜色
  );
  
  // 计算面积误差率（需要考虑分辨率的影响）
  const sampledPixels = Math.ceil(width / checkResolution) * Math.ceil(height / checkResolution);
  const pixelBlockSize = checkResolution * checkResolution;
  const adjustedTotalPixels = sampledPixels * pixelBlockSize;
  const { errorRates: finalErrorRates } = calculateAreaErrorRate(
    finalCheckPixelCounts,
    cityWeights,
    adjustedTotalPixels
  );
  
  // 分析误差率，对面积不足的小城市增加权重（支持多次迭代调整）
  const adjustmentThreshold = 0.10; // 误差率超过10%的城市需要调整（降低阈值）
  const minAreaRatio = 0.85; // 实际面积小于目标面积85%的城市需要重点调整（提高标准）
  const maxWeightMultiplier = 5.0; // 最大权重调整倍数（从2.0提高到5.0）
  const maxAdjustmentIterations = 3; // 最多进行3次权重调整迭代
  
  let currentSites = finalSites;
  let iterationCount = 0;
  
  while (iterationCount < maxAdjustmentIterations) {
    // 计算当前面积误差率
    const { cityPixelCounts: currentPixelCounts } = generateSingleVoronoi(
      currentSites,
      cityOrder,
      width,
      height,
      checkResolution,
      false,
      null
    );
    
    const { errorRates: currentErrorRates } = calculateAreaErrorRate(
      currentPixelCounts,
      cityWeights,
      adjustedTotalPixels
    );
    
    // 分析需要调整的城市
    const weightAdjustments = new Map();
    
    currentErrorRates.forEach(errorInfo => {
      const { city, targetArea, actualArea, errorRate } = errorInfo;
      const areaRatio = targetArea > 0 ? actualArea / targetArea : 0;
      
      // 对于面积不足的小城市，增加权重
      if (actualArea < targetArea && (errorRate > adjustmentThreshold || areaRatio < minAreaRatio)) {
        // 计算权重调整倍数
        let weightMultiplier;
        
        if (areaRatio < 0.3) {
          // 对于面积比<30%的严重不足城市，使用更激进的调整（平方根策略）
          // 如果面积比是20%，需要5倍权重，但使用平方根策略：sqrt(1/0.2) ≈ 2.24，再乘以2
          weightMultiplier = Math.min(Math.sqrt(1.0 / areaRatio) * 1.5, maxWeightMultiplier);
        } else if (areaRatio < 0.5) {
          // 对于面积比30-50%的城市，使用中等激进策略
          weightMultiplier = Math.min(1.0 / areaRatio * 1.2, maxWeightMultiplier);
        } else {
          // 对于面积比50-85%的城市，使用标准调整
          weightMultiplier = Math.min(1.0 / areaRatio, maxWeightMultiplier);
        }
        
        // 如果是多次迭代，使用渐进式调整（避免过度调整）
        if (iterationCount > 0) {
          weightMultiplier = 1.0 + (weightMultiplier - 1.0) * 0.6; // 每次只调整60%的差距
        }
        
        weightAdjustments.set(city, weightMultiplier);
        
        console.log(`[迭代${iterationCount + 1}] 城市 ${city}: 目标面积=${Math.round(targetArea)}, 实际面积=${Math.round(actualArea)}, 面积比=${(areaRatio * 100).toFixed(1)}%, 误差率=${(errorRate * 100).toFixed(2)}%, 权重调整倍数=${weightMultiplier.toFixed(2)}`);
      }
    });
    
    // 如果没有需要调整的城市，退出循环
    if (weightAdjustments.size === 0) {
      console.log(`权重调整完成，共进行 ${iterationCount} 次迭代`);
      break;
    }
    
    // 更新站点权重
    console.log(`[迭代${iterationCount + 1}] 对 ${weightAdjustments.size} 个城市进行权重调整...`);
    currentSites = currentSites.map(site => {
      const adjustment = weightAdjustments.get(site.city);
      if (adjustment && adjustment > 1.0) {
        return {
          ...site,
          weight: site.weight * adjustment
        };
      }
      return site;
    });
    
    iterationCount++;
    
    // 验证调整效果
    const { cityPixelCounts: adjustedPixelCounts } = generateSingleVoronoi(
      currentSites,
      cityOrder,
      width,
      height,
      checkResolution,
      false,
      null
    );
    
    const { averageErrorRate: adjustedErrorRate, errorRates: adjustedErrorRates } = calculateAreaErrorRate(
      adjustedPixelCounts,
      cityWeights,
      adjustedTotalPixels
    );
    
    console.log(`[迭代${iterationCount}] 权重调整后平均误差率: ${(adjustedErrorRate * 100).toFixed(2)}%`);
    adjustedErrorRates.forEach(e => {
      const areaRatio = e.targetArea > 0 ? e.actualArea / e.targetArea : 0;
      if (weightAdjustments.has(e.city)) {
        console.log(`  ${e.city}: 调整后面积=${Math.round(e.actualArea)}, 面积比=${(areaRatio * 100).toFixed(1)}%`);
      }
    });
    
    // 如果平均误差率已经很低（<8%），可以提前退出
    if (adjustedErrorRate < 0.08) {
      console.log(`平均误差率已降至 ${(adjustedErrorRate * 100).toFixed(2)}%，提前结束权重调整`);
      break;
    }
  }
  
  // 使用最终调整后的站点
  finalSites = currentSites;
  
  // 使用最终站点位置和图着色算法预计算颜色（确保相邻区域不同颜色）
  console.log('使用图着色算法分配颜色...');
  
  // 重要：无论当前是单色还是复色模式，都要计算复色模式下的颜色（用于保存，以便快速切换）
  const { colors: multiColorColors, colorIndices } = precomputeCityColors(cityOrder, finalSites, width, height, true);
  
  // 根据当前模式决定使用哪种颜色
  const currentMode = poiStore.colorSettings.backgroundMode;
  let precomputedColors;
  if (currentMode === 'single') {
    // 单色模式：生成单色的颜色（所有区域都是背景色）
    const singleBgColor = poiStore.colorSettings.background || 'rgb(255, 255, 255)';
    let r, g, b;
    if (singleBgColor.startsWith('#')) {
      const hex = singleBgColor.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (singleBgColor.startsWith('rgb')) {
      const rgbMatch = singleBgColor.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        r = parseInt(rgbMatch[0]);
        g = parseInt(rgbMatch[1]);
        b = parseInt(rgbMatch[2]);
      } else {
        r = g = b = 255;
      }
    } else {
      r = g = b = 255;
    }
    // 生成单色模式的颜色数组（所有区域都是相同的单色，完全不透明）
    precomputedColors = cityOrder.map(() => ({ r, g, b, a: 255 }));
    console.log('当前为单色模式，使用单色渲染，但已保存复色模式颜色信息');
  } else {
    // 复色模式：直接使用复色模式的颜色
    precomputedColors = multiColorColors;
    console.log('当前为复色模式，使用复色渲染');
  }
  
  // 创建颜色索引映射（用于文字颜色）
  const colorIndicesMap = new Map();
  cityOrder.forEach((city, cityIndex) => {
    colorIndicesMap.set(city, colorIndices[cityIndex]);
  });
  
  const { imageData: finalImageData, cityCenters: finalRenderCenters, regionPixelMap: finalRegionPixelMap } = generateSingleVoronoi(
    finalSites,
    cityOrder,
    width,
    height,
    1,                      // 全分辨率（1像素）
    true,                   // 生成ImageData
    precomputedColors,      // 使用当前模式的颜色（单色或复色）
    true                    // 保存区域像素映射（用于快速更新颜色）
  );

  // 保存区域像素映射和相关信息（用于快速更新背景颜色）
  savedRegionPixelMap = finalRegionPixelMap;
  savedCanvasSize = { width, height };
  savedCityOrder = [...cityOrder];
  savedColorIndices = [...colorIndices]; // 保存颜色索引映射（图着色结果）
  
  // 重要：保存复色模式下的颜色信息（无论当前模式是什么），用于快速切换到复色模式
  // 注意：这里保存的是复色模式下的颜色（带透明度），不是单色模式的颜色
  savedMultiColorColors = multiColorColors.map(c => ({ ...c })); // 深拷贝，避免引用问题

  // 绘制最终结果的Voronoi图到维诺图canvas
  voronoiCtx.putImageData(finalImageData, 0, 0);

  // 使用最终渲染时计算的形心（更准确）
  const finalCityCentersForText = finalRenderCenters;

  // 注意：城市名称现在由词云布局函数绘制，这里不再单独绘制
  // 这样可以确保城市名称作为词云的一部分，大小和位置更合理

  // 绘制城市站点（可选，用于调试，默认不绘制）
  // bestResult.sites.forEach(site => {
  //   ctx.beginPath();
  //   ctx.arc(site.x, site.y, 4, 0, Math.PI * 2);
  //   ctx.fillStyle = '#ff0000';
  //   ctx.fill();
  //   ctx.strokeStyle = '#ffffff';
  //   ctx.lineWidth = 2;
  //   ctx.stroke();
  // });

  console.log('加权Voronoi图绘制完成（迭代优化）');
  
  // 保存区域映射用于词云布局
  currentRegionMap = new Map();
  cityOrder.forEach((city, cityIndex) => {
    const regionPixels = new Set();
    currentRegionMap.set(city, regionPixels);
  });
  
  // 生成区域映射（用于快速判断点是否在区域内）
  const regionMapResolution = 2; // 使用较低分辨率以提高性能
  for (let y = 0; y < height; y += regionMapResolution) {
    for (let x = 0; x < width; x += regionMapResolution) {
      let minDist = Infinity;
      let closestCity = null;
      
      for (const site of finalSites) {
        const dx = x - site.x;
        const dy = y - site.y;
        const euclideanDist = Math.sqrt(dx * dx + dy * dy);
        
        if (euclideanDist === 0) {
          closestCity = site.city;
          break;
        }
        
        const weight = Math.max(site.weight || 0.00001, 0.00001);
        const weightedDist = euclideanDist / Math.sqrt(weight);
        
        if (weightedDist < minDist) {
          minDist = weightedDist;
          closestCity = site.city;
        }
      }
      
      if (closestCity && currentRegionMap.has(closestCity)) {
        // 存储像素块（考虑分辨率）
        for (let dy = 0; dy < regionMapResolution && (y + dy) < height; dy++) {
          for (let dx = 0; dx < regionMapResolution && (x + dx) < width; dx++) {
            const px = x + dx;
            const py = y + dy;
            currentRegionMap.get(closestCity).add(`${px},${py}`);
          }
        }
      }
    }

    // 每处理一部分行，适当让出主线程，确保遮罩有机会更新
    if (y % (regionMapResolution * 40) === 0) {
      await nextTick();
      await waitNextFrame();
    }
  }
  
  console.log('区域映射生成完成，开始绘制词云...');
  
  // 保存站点信息（用于绘制线条）
  savedSites = finalSites.map(s => ({ city: s.city, x: s.x, y: s.y, weight: s.weight }));
  
  // 绘制词云到词云canvas（传入碰撞检测canvas的上下文）
  // 传递颜色索引，确保文字颜色与背景颜色一致
  await drawWordCloudInRegions(
    wordCloudCtx,
    collisionCtx,
    finalSites,
    cityOrder,
    data,
    width,
    height,
    colorIndices
  );
  
  // 词云完成后再绘制线条
  drawCityLines();
};

const handleRenderCloud = async () => {
  if (!poiStore.hasDrawing) {
    startDrawGuideIntro();
    return;
  }

  // 初始化遮罩提示状态
  loadingStage.value = '正在准备数据，请稍候…';
  loadingCurrentCity.value = '';
  loadingCurrentIndex.value = 0;
  loadingTotalCities.value = poiStore.cityOrder.length || 0;

  poiStore.setCloudLoading(true);
  // 确保 DOM 更新，让 loading overlay 显示
  await nextTick();
  // 使用 requestAnimationFrame 确保浏览器至少渲染一次 loading overlay
  await new Promise(resolve => requestAnimationFrame(resolve));
  // 再等待一帧，确保 loading overlay 完全渲染
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  const startTime = Date.now();
  const minDisplayTime = 300; // 最小显示时间 300ms，确保用户能看到 loading
  
  try {
    console.info('[TagCloudCanvas] handleRenderCloud 开始', {
      hasDrawing: poiStore.hasDrawing,
      cityOrderCount: poiStore.cityOrder.length,
      compiledKeys: Object.keys(poiStore.compiledData || {}).length,
    });
    // 检查数据是否已准备好
    if (!poiStore.cityOrder.length || !Object.keys(poiStore.compiledData).length) {
      console.warn('数据未准备好，请等待数据处理完成', {
        cityOrder: poiStore.cityOrder,
        compiledDataKeys: Object.keys(poiStore.compiledData || {}),
      });
      return;
    }
    await nextTick();
    if (!voronoiCanvasRef.value || !wordCloudCanvasRef.value || !wrapperRef.value) return;
    const rect = wrapperRef.value.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    
    // 设置两个Canvas尺寸
    voronoiCanvas = voronoiCanvasRef.value;
    voronoiCanvas.width = width;
    voronoiCanvas.height = height;
    voronoiCtx = voronoiCanvas.getContext('2d');
    
    wordCloudCanvas = wordCloudCanvasRef.value;
    wordCloudCanvas.width = width;
    wordCloudCanvas.height = height;
    wordCloudCtx = wordCloudCanvas.getContext('2d');
    
    // 初始化线条canvas
    if (lineCanvasRef.value) {
      lineCanvas = lineCanvasRef.value;
      lineCanvas.width = width;
      lineCanvas.height = height;
      lineCtx = lineCanvas.getContext('2d');
    }
    
    // 清空保存的布局信息
    currentVoronoiRegions = null;
    currentCityOrder = null;
    savedWordCloudLayout = null; // 清空保存的布局
    savedRegionPixelMap = null; // 清空保存的区域像素映射
    savedCanvasSize = null; // 清空保存的画布尺寸
    savedCityOrder = null; // 清空保存的城市顺序
    savedColorIndices = null; // 清空保存的颜色索引映射
    savedMultiColorColors = null; // 清空保存的复色模式颜色信息
    
    const data = poiStore.compiledData;
    const cityOrder = poiStore.cityOrder;
    
    await nextTick();
    // 再次让浏览器渲染一次，确保 loading overlay 可见
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 创建隐藏的碰撞检测canvas
    collisionCanvas = document.createElement('canvas');
    collisionCanvas.width = width;
    collisionCanvas.height = height;
    collisionCtx = collisionCanvas.getContext('2d');
    collisionCanvas.style.display = 'none'; // 隐藏canvas
    
    // 绘制加权Voronoi图和词云
    await drawWeightedVoronoi(voronoiCanvas, voronoiCtx, wordCloudCanvas, wordCloudCtx, data, cityOrder, width, height);
  } finally {
    // 确保 loading 至少显示最小时间
    const elapsed = Date.now() - startTime;
    if (elapsed < minDisplayTime) {
      await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
    }
    poiStore.setCloudLoading(false);
    // 重置遮罩提示
    loadingStage.value = '';
    loadingCurrentCity.value = '';
    loadingCurrentIndex.value = 0;
    loadingTotalCities.value = 0;
  }
};

/**
 * 绘制城市之间的连接线
 */
const drawCityLines = () => {
  if (!lineCanvas || !lineCtx || !savedSites || !poiStore.cityOrder.length) {
    return;
  }
  
  const linePanel = poiStore.linePanel || { type: 'curve', width: 3, color: '#aaa' };
  
  // 如果线条类型为'none'，清空线条canvas
  if (linePanel.type === 'none') {
    lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
    return;
  }
  
  // 清空线条canvas
  lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
  
  // 获取城市顺序
  const cityOrder = poiStore.cityOrder;
  if (cityOrder.length < 2) {
    return; // 至少需要2个城市才能绘制线条
  }
  
  // 创建城市到站点的映射
  const cityToSiteMap = new Map();
  savedSites.forEach(site => {
    cityToSiteMap.set(site.city, site);
  });
  
  // 获取线条样式
  const lineWidth = linePanel.width || 3;
  const lineColor = linePanel.color || '#aaa';
  const isCurve = linePanel.type === 'curve';
  
  // 设置线条样式
  lineCtx.strokeStyle = lineColor;
  lineCtx.lineWidth = lineWidth;
  lineCtx.lineCap = 'round';
  lineCtx.lineJoin = 'round';
  
  // 按城市顺序获取坐标点
  const points = [];
  for (let i = 0; i < cityOrder.length; i++) {
    const city = cityOrder[i];
    const site = cityToSiteMap.get(city);
    if (site) {
      points.push({ x: site.x, y: site.y });
    }
  }
  
  if (points.length < 2) {
    return; // 至少需要2个点
  }
  
  // 绘制线条
  lineCtx.beginPath();
  
  if (isCurve) {
    // 绘制平滑曲线（使用三次贝塞尔曲线）
    if (points.length === 2) {
      // 只有两个点，直接连接
      lineCtx.moveTo(points[0].x, points[0].y);
      lineCtx.lineTo(points[1].x, points[1].y);
    } else {
      // 多个点，使用平滑曲线
      lineCtx.moveTo(points[0].x, points[0].y);
      
      for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        
        if (i === 0) {
          // 第一段：使用下一个点作为控制点
          const cp1x = curr.x + (next.x - curr.x) * 0.5;
          const cp1y = curr.y + (next.y - curr.y) * 0.5;
          const cp2x = next.x - (i + 2 < points.length ? (points[i + 2].x - next.x) * 0.25 : 0);
          const cp2y = next.y - (i + 2 < points.length ? (points[i + 2].y - next.y) * 0.25 : 0);
          lineCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
        } else if (i === points.length - 2) {
          // 最后一段：使用前一个点作为参考
          const prev = points[i - 1];
          const cp1x = curr.x + (next.x - prev.x) * 0.25;
          const cp1y = curr.y + (next.y - prev.y) * 0.25;
          const cp2x = next.x - (next.x - curr.x) * 0.5;
          const cp2y = next.y - (next.y - curr.y) * 0.5;
          lineCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
        } else {
          // 中间段：使用前后点计算平滑的控制点
          const prev = points[i - 1];
          const nextNext = points[i + 2];
          const cp1x = curr.x + (next.x - prev.x) * 0.25;
          const cp1y = curr.y + (next.y - prev.y) * 0.25;
          const cp2x = next.x - (nextNext.x - curr.x) * 0.25;
          const cp2y = next.y - (nextNext.y - curr.y) * 0.25;
          lineCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
        }
      }
    }
  } else {
    // 绘制折线
    lineCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      lineCtx.lineTo(points[i].x, points[i].y);
    }
  }
  
  lineCtx.stroke();
};

const handleExportCommand = (command) => {
  if(command === 'png' || command==='jpeg') {
    prepareExportDialog(command)
  } else if(command === 'svg') {
    // SVG导出暂时不支持，因为现在使用Canvas
    alert('当前使用Canvas绘制，暂不支持SVG导出，请使用PNG或JPEG导出');
  }
};

function prepareExportDialog(format) {
  exportFormat.value = format;
  // 尺寸默认用canvas实际宽高（使用维诺图canvas的尺寸）
  if(voronoiCanvasRef.value) {
    const canvas = voronoiCanvasRef.value;
    const w = Math.round(canvas.width || 800);
    const h = Math.round(canvas.height || 600);
    exportWidth.value = w;
    exportHeight.value = h;
    origWidth.value = w;
    origHeight.value = h;
    _aspectRatio = w/h;
  } else {
    exportWidth.value = 800;
    exportHeight.value = 600;
    origWidth.value = 800;
    origHeight.value = 600;
    _aspectRatio = 800 / 600;
  }
  lockAspectRatio.value = true;
  exportDialogVisible.value = true;
}

// 响应宽度、锁定比例
function onExportWidthChange(val) {
  if (lockAspectRatio.value && origWidth.value && origHeight.value) {
    const w = Number(val)||1;
    exportHeight.value = Math.round(w/origWidth.value*origHeight.value);
  }
}
function onExportHeightChange(val) {
  if (lockAspectRatio.value && origWidth.value && origHeight.value) {
    const h = Number(val)||1;
    exportWidth.value = Math.round(h/origHeight.value*origWidth.value);
  }
}

const handleExportConfirm = () => {
  exportDialogVisible.value = false;
  exportAsRaster(
    exportFormat.value,
    exportWidth.value,
    exportHeight.value,
    '#ffffff' // 始终使用默认白底
  );
}

// Canvas转图片格式，支持尺寸和背景色
const exportAsRaster = async (format = 'png', exportWidth=800, exportHeight=600, bgColor='#ffffff') => {
  if (!voronoiCanvasRef.value || !wordCloudCanvasRef.value) return;
  
  // 创建临时canvas用于导出
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = exportWidth;
  exportCanvas.height = exportHeight;
  const exportCtx = exportCanvas.getContext('2d');
  
  // 填充背景色
  exportCtx.fillStyle = bgColor;
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  
  // 先绘制维诺图，再绘制线条，最后绘制词云
  exportCtx.drawImage(voronoiCanvasRef.value, 0, 0, exportWidth, exportHeight);
  if (lineCanvasRef.value) {
    exportCtx.drawImage(lineCanvasRef.value, 0, 0, exportWidth, exportHeight);
  }
  exportCtx.drawImage(wordCloudCanvasRef.value, 0, 0, exportWidth, exportHeight);
  
  // 导出
    const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const link = document.createElement('a');
  link.href = exportCanvas.toDataURL(type);
  link.download = `tag-cloud-voronoi.${format}`;
    link.click();
};

onMounted(() => {
  // 初始化三个Canvas
  if (voronoiCanvasRef.value && wordCloudCanvasRef.value && lineCanvasRef.value && wrapperRef.value) {
    const rect = wrapperRef.value.getBoundingClientRect();
    voronoiCanvas = voronoiCanvasRef.value;
    voronoiCanvas.width = rect.width;
    voronoiCanvas.height = rect.height;
    voronoiCtx = voronoiCanvas.getContext('2d');
    
    wordCloudCanvas = wordCloudCanvasRef.value;
    wordCloudCanvas.width = rect.width;
    wordCloudCanvas.height = rect.height;
    wordCloudCtx = wordCloudCanvas.getContext('2d');
    
    lineCanvas = lineCanvasRef.value;
    lineCanvas.width = rect.width;
    lineCanvas.height = rect.height;
    lineCtx = lineCanvas.getContext('2d');
  }
});

onBeforeUnmount(() => {
  // 清理工作
});

watch(
  () => poiStore.hasDrawing,
  (hasDrawing) => {
    if (!hasDrawing && voronoiCtx && voronoiCanvas && wordCloudCtx && wordCloudCanvas) {
      voronoiCtx.clearRect(0, 0, voronoiCanvas.width, voronoiCanvas.height);
      wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
      // 清空线条canvas
      if (lineCtx && lineCanvas) {
        lineCtx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
      }
      // 清空碰撞检测canvas
      if (collisionCtx && collisionCanvas) {
        collisionCtx.clearRect(0, 0, collisionCanvas.width, collisionCanvas.height);
      }
      // 清空保存的布局信息
      currentVoronoiRegions = null;
      currentCityOrder = null;
      savedWordCloudLayout = null;
      savedRegionPixelMap = null; // 清空保存的区域像素映射
      savedCanvasSize = null; // 清空保存的画布尺寸
      savedCityOrder = null; // 清空保存的城市顺序
      savedColorIndices = null; // 清空保存的颜色索引映射
      savedMultiColorColors = null; // 清空保存的复色模式颜色信息
      savedSites = null; // 清空保存的站点信息
    }
  }
);

watch(
  () => poiStore.cityOrder.length,
  (length) => {
    console.info('[TagCloudCanvas] cityOrder 长度', length);
  }
);

watch(
  () => Object.keys(poiStore.compiledData || {}).length,
  (length) => {
    console.info('[TagCloudCanvas] compiledData 键数量', length);
  }
);

// 监听线条面板设置变化，重新绘制线条
watch(
  () => poiStore.linePanel,
  (newPanel) => {
    if (newPanel && savedSites && poiStore.hasDrawing) {
      // 延迟绘制，确保 canvas 已更新
      nextTick(() => {
        drawCityLines();
      });
    }
  },
  { deep: true }
);

// watch配色设置变化
watch(
  () => ({...poiStore.colorSettings}),
  (newVal, oldVal) => {
    if (!oldVal) {
      // 首次初始化，需要完整渲染
      if (poiStore.hasDrawing) {
        handleRenderCloud();
      }
      return;
    }
    
    if (poiStore.hasDrawing) {
      // 检查是否是文字配色变化（不包括配色方案变化，因为配色方案变化会影响背景和文字，需要单独处理）
      const textColorChanged = 
        newVal.textColorMode !== oldVal.textColorMode ||
        newVal.textSingleColor !== oldVal.textSingleColor;
      
      // 检查是否是背景配色变化
      const backgroundChanged = 
        newVal.backgroundMode !== oldVal.backgroundMode ||
        newVal.background !== oldVal.background ||
        newVal.backgroundMultiColorOpacity !== oldVal.backgroundMultiColorOpacity;
      
      // 检查背景模式是否变化（单色 <-> 复色）
      const backgroundModeChanged = newVal.backgroundMode !== oldVal.backgroundMode;
      
      // 检查配色方案是否变化（色带颜色自定义）
      // 注意：配色方案变化时，颜色索引不变（图着色结果基于区域邻接关系，不依赖具体颜色值）
      // 只需更新颜色值，可以使用快速更新
      const paletteChanged = JSON.stringify(newVal.palette) !== JSON.stringify(oldVal.palette);
      
      // 检查是否是纯文字配色变化（不包括配色方案变化，因为配色方案变化会影响背景和文字）
      // 注意：textColorChanged 已经不包含 paletteChanged，所以这里直接使用 textColorChanged
      const pureTextColorChanged = textColorChanged;
      
      // 处理背景模式切换（单色 <-> 复色）
      if (backgroundModeChanged && voronoiCtx && voronoiCanvas) {
        if (newVal.backgroundMode === 'single') {
          // 切换到单色模式：快速填充整个canvas为单色
          console.log('切换到单色模式，快速填充canvas...');
          const singleColor = newVal.background || '#ffffff';
          voronoiCtx.fillStyle = singleColor;
          voronoiCtx.fillRect(0, 0, voronoiCanvas.width, voronoiCanvas.height);
          
          // 文字颜色不需要变化（因为文字颜色由textColorMode控制）
        } else if (newVal.backgroundMode === 'multi' && savedRegionPixelMap && savedCityOrder && savedColorIndices) {
          // 切换回复色模式：使用保存的复色颜色信息（即使一开始是单色模式，也保存了复色颜色）
          console.log('切换回复色模式，使用保存的复色颜色信息...');
          const success = fastUpdateBackgroundColors(
            voronoiCtx, 
            voronoiCanvas.width, 
            voronoiCanvas.height, 
            poiStore.cityOrder
          );
          if (success && savedWordCloudLayout && wordCloudCtx && wordCloudCanvas) {
            // 同步更新文字颜色
            console.log('同步更新文字颜色...');
            wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
            renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
          } else if (!success) {
            console.warn('快速更新背景颜色失败，可能需要完整重新生成');
          }
        } else {
          // 如果没有保存的数据，需要完整重新生成
          handleRenderCloud();
        }
        return; // 背景模式切换处理完成，直接返回
      }
      
      // 优先处理配色方案变化（色带颜色自定义）- 必须使用快速更新
      if (paletteChanged && !backgroundModeChanged && savedRegionPixelMap && savedCityOrder && savedColorIndices) {
        // 配色方案变化（色带颜色自定义），颜色索引不变，只需更新颜色值
        // 重要：必须强制从新的配色方案重新计算，确保背景色和文字颜色一致
        console.log('配色方案变化（色带颜色自定义），快速更新背景和文字颜色...');
        if (voronoiCtx && voronoiCanvas) {
          const success = fastUpdateBackgroundColors(
            voronoiCtx, 
            voronoiCanvas.width, 
            voronoiCanvas.height, 
            poiStore.cityOrder,
            true  // 强制从配色方案重新计算，不使用保存的旧颜色
          );
          if (success) {
            // 重要：更新保存的复色颜色信息，使用新的配色方案
            // 这样后续切换模式时也能使用正确的颜色
            if (poiStore.colorSettings.backgroundMode === 'multi' && savedColorIndices) {
              const opacity = poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1;
              savedMultiColorColors = poiStore.cityOrder.map((city, cityIndex) => {
                const colorIndex = savedColorIndices[cityIndex];
                const bgColor = poiStore.Colors[colorIndex]; // 从新的配色方案获取颜色
                
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
              console.log('已更新保存的复色颜色信息，使用新的配色方案');
            }
            
            // 背景颜色更新成功后，同步更新文字颜色（确保使用相同的颜色索引和颜色值）
            if (savedWordCloudLayout && wordCloudCtx && wordCloudCanvas) {
              console.log('同步更新文字颜色（使用相同的图着色颜色索引和新的配色方案）...');
              wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
              renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
            }
          } else {
            // 如果快速更新失败，回退到完整重新生成
            console.log('快速更新失败，回退到完整重新生成');
            handleRenderCloud();
          }
        }
        return; // 配色方案变化处理完成，直接返回
      }
      
      // 处理纯文字配色变化
      if (pureTextColorChanged && !backgroundChanged && savedWordCloudLayout) {
        // 只有文字配色变化（不包括配色方案），且已有保存的布局，快速重绘词云
        console.log('文字配色变化，快速重绘词云...');
        if (wordCloudCtx && wordCloudCanvas) {
          wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
          renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
        }
        return; // 文字配色变化处理完成，直接返回
      }
      
      // 处理背景配色变化（不包括配色方案变化和背景模式变化）
      if (backgroundChanged && !paletteChanged && !backgroundModeChanged && savedRegionPixelMap && savedCityOrder && savedColorIndices) {
        // 背景配色变化（不包括配色方案变化），且已有保存的区域映射和颜色索引，快速更新背景和文字颜色
        console.log('背景配色变化（快速更新模式）...');
        if (voronoiCtx && voronoiCanvas) {
          const success = fastUpdateBackgroundColors(
            voronoiCtx, 
            voronoiCanvas.width, 
            voronoiCanvas.height, 
            poiStore.cityOrder
          );
          if (success) {
            // 背景颜色更新成功后，同步更新文字颜色（确保使用相同的颜色索引和颜色值）
            if (savedWordCloudLayout && wordCloudCtx && wordCloudCanvas) {
              console.log('同步更新文字颜色（使用相同的图着色颜色索引）...');
              wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
              renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
            }
          } else {
            // 如果快速更新失败，回退到完整重新生成
            console.log('快速更新失败，回退到完整重新生成');
            handleRenderCloud();
          }
        }
        return; // 背景配色变化处理完成，直接返回
      }
      
      // 其他情况，需要完整重新生成
      console.log('触发完整重新生成，原因：', {
        paletteChanged,
        backgroundChanged,
        backgroundModeChanged,
        pureTextColorChanged,
        hasSavedData: !!(savedRegionPixelMap && savedCityOrder && savedColorIndices)
      });
      handleRenderCloud();
    }
  },
  { deep: true }
);

// watch字体设置变化 - 区分“仅重新布局词云”和“仅样式重绘”
watch(
  () => ({...poiStore.fontSettings}),
  async (newVal, oldVal) => {
    if (!oldVal) {
      return;
    }
    
    // 检查是否需要完整重绘（重新定位标签）
    // 需要完整重绘的情况：语言、序号、字号区间、英文字体库
    const needsFullRedraw = 
      newVal.language !== oldVal.language ||
      newVal.showCityIndex !== oldVal.showCityIndex ||
      newVal.minFontSize !== oldVal.minFontSize ||
      newVal.maxFontSize !== oldVal.maxFontSize ||
      (newVal.fontFamily !== oldVal.fontFamily && newVal.language === 'en'); // 英文字体库变化
    
    // 检查是否只需要样式重绘（基于原有位置重新绘制样式）
    // 只需要样式重绘的情况：字重、中文字体库
    const needsStyleRedraw = 
      newVal.fontWeight !== oldVal.fontWeight ||
      (newVal.fontFamily !== oldVal.fontFamily && newVal.language === 'zh'); // 中文字体库变化
    
    // 如果需要完整重绘标签布局，优先只在现有Voronoi结果上重新生成词云
    if (needsFullRedraw && poiStore.hasDrawing) {
      console.log('字体设置变化（语言/序号/字号区间/英文字体库），仅在现有加权Voronoi基础上重新布局词云（不重新计算背景）...');
      await relayoutWordCloudOnly();
      return;
    }
    
    // 如果只需要样式重绘，基于原有位置重新绘制样式
    if (needsStyleRedraw && poiStore.hasDrawing && savedWordCloudLayout) {
      console.log('字体设置变化（字重/中文字体库），快速重绘词云样式...');
      if (wordCloudCtx && wordCloudCanvas) {
        wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
        renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
      }
    }
  },
  { deep: true }
);
</script>

<style scoped>
.tagcloud-panel {
  background:rgb(247,249,252);
  color: #000000;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 650px;
  width: 100%;
  height: 100%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.canvas-wrapper {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}

.voronoi-canvas {
  z-index: 1; /* 维诺图canvas在底层 */
}

.line-canvas {
  z-index: 2; /* 线条canvas在中间层 */
}

.wordcloud-canvas {
  z-index: 3; /* 词云canvas在上层 */
}

.empty-cloud-hint {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0);
  backdrop-filter: blur(8px);
  z-index: 5;
  pointer-events: none;
}

.hint-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 40px;
  text-align: center;
  max-width: 500px;
}

.hint-icon {
  width: 80px;
  height: 80px;
  color: rgba(104, 104, 104, 0.549);
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.hint-text {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: rgba(104, 104, 104, 0.549);
  letter-spacing: 0.5px;
}

.hint-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(104, 104, 104, 0.549);
  letter-spacing: 0.3px;
}
.cloud-loading-overlay {
  position: absolute;
  z-index: 999;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #333;
  font-size: 20px;
  pointer-events: all;
  gap: 18px;
  font-weight: 500;
  backdrop-filter: blur(8px);
}

.cloud-loading-spinner {
  position: relative;
  width: 60px;
  height: 60px;
  margin-bottom: 12px;
  will-change: transform;
}

.spinner-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409eff;
  top: 0;
  left: 50%;
  transform-origin: 0 30px;
  will-change: transform, opacity;
  animation: spinner-rotate 1.2s linear infinite;
}

.spinner-dot:nth-child(1) {
  animation-delay: 0s;
  opacity: 1;
}

.spinner-dot:nth-child(2) {
  animation-delay: 0.15s;
  opacity: 0.875;
}

.spinner-dot:nth-child(3) {
  animation-delay: 0.3s;
  opacity: 0.75;
}

.spinner-dot:nth-child(4) {
  animation-delay: 0.45s;
  opacity: 0.625;
}

.spinner-dot:nth-child(5) {
  animation-delay: 0.6s;
  opacity: 0.5;
}

.spinner-dot:nth-child(6) {
  animation-delay: 0.75s;
  opacity: 0.375;
}

.spinner-dot:nth-child(7) {
  animation-delay: 0.9s;
  opacity: 0.25;
}

.spinner-dot:nth-child(8) {
  animation-delay: 1.05s;
  opacity: 0.125;
}

@keyframes spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}

.cloud-loading-text {
  margin-top: 8px;
  color: #606266;
  font-size: 16px;
}

.cloud-loading-main-text {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.cloud-loading-sub-text {
  font-size: 14px;
  color: #666;
  max-width: 420px;
  text-align: center;
}

.cloud-loading-city-text {
  font-size: 14px;
  color: #555;
}

.cloud-loading-city-name {
  font-weight: 600;
  color: #409eff;
}

.cloud-loading-progress-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.cloud-loading-progress-bar {
  width: 160px;
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.cloud-loading-progress-inner {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #409eff, #67c23a);
  transition: width 0.25s ease-out;
}

.cloud-loading-progress-text {
  font-size: 12px;
  color: #909399;
}
</style>



