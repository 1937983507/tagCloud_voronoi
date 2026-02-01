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
      <div v-if="showHintOverlay && !cloudLoading" class="empty-cloud-hint">
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
            <p class="hint-desc">
              {{ (!poiStore.hasDrawing || !poiStore.cityOrder.length) 
                ? '请先在地图上绘制折线，然后点击"运行生成标签云"按钮' 
                : '请单击"运行生成标签云"' }}
            </p>
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
          请稍等…
        </div>
        <div class="cloud-loading-sub-text">
          {{ loadingStage || '正在准备数据与布局，请不要关闭页面。' }}
        </div>
        
        <!-- 加权维诺图模式：显示迭代进度 -->
        <template v-if="loadingMode === 'voronoi'">
          <div
            v-if="loadingTotalIterations > 0"
            class="cloud-loading-iteration-text"
          >
            迭代进度（{{ loadingCurrentIteration }}/{{ loadingTotalIterations }}）
          </div>
          <div class="cloud-loading-progress-wrapper" v-if="loadingTotalIterations > 0">
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
        </template>
        
        <!-- 词云模式：显示城市进度 -->
        <template v-else-if="loadingMode === 'wordcloud'">
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
        </template>
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
import { recordTagCloudGeneration } from '@/utils/statistics';
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

// 提示遮罩显示状态（在用户点击"运行生成标签云"之前一直显示）
const showHintOverlay = ref(true);

// 遮罩上的友好提示信息
const loadingMode = ref('voronoi');     // 遮罩模式：'voronoi' 计算加权维诺图，'wordcloud' 计算词云
const loadingStage = ref('');           // 当前阶段文案，例如"正在计算城市权重…"
const loadingCurrentCity = ref('');     // 当前正在处理的城市
const loadingCurrentIndex = ref(0);     // 当前城市序号
const loadingTotalCities = ref(0);      // 总城市数
const loadingCurrentIteration = ref(0); // 当前迭代次数
const loadingTotalIterations = ref(0);  // 总迭代次数

// 计算进度百分比（根据模式）
const loadingPercent = computed(() => {
  if (loadingMode.value === 'voronoi') {
    // 加权维诺图模式：基于迭代进度
    if (!loadingTotalIterations.value || loadingTotalIterations.value <= 0) return 0;
    const ratio = loadingCurrentIteration.value / loadingTotalIterations.value;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  } else {
    // 词云模式：基于城市进度
    if (!loadingTotalCities.value || loadingTotalCities.value <= 0) return 0;
    const ratio = loadingCurrentIndex.value / loadingTotalCities.value;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  }
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
              '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">绘制折线</strong><br/><span style="color:#64748b;">点击此处选择"手绘折线"或"自定义始末点"，划定需要分析的路线。</span></div>',
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
    const response = await axios.get(`${import.meta.env.BASE_URL}data/cityCoordinates.json`);
    cityCoordinates = response.data;
    return cityCoordinates;
  } catch (error) {
    console.error('加载城市坐标数据失败:', error);
    return null;
  }
};

// 计算每个城市景点权重（使用POI数量）
const calculateCityWeights = (data, cityOrder) => {
  return cityOrder.map(city => {
    const cityData = data[city] || [];
    // 权重直接使用POI数量
    const weight = cityData.length;
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
 * 基于区域像素映射构建邻接图（用于图着色）
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {Map} 邻接图，key为城市索引，value为相邻城市索引的Set
 */
const buildAdjacencyGraphFromRegionMap = (regionPixelMap, cityOrder, width, height) => {
  // 构建邻接图
  const adjacencyGraph = new Map();
  cityOrder.forEach((_, index) => {
    adjacencyGraph.set(index, new Set());
  });

  // 检测相邻区域（检查边界像素）
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 上下左右
  const checkedPairs = new Set(); // 避免重复检查
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const currentRegion = regionPixelMap[idx];
      if (currentRegion === undefined) continue;

      // 检查四个方向的邻居
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborIdx = ny * width + nx;
          const neighborRegion = regionPixelMap[neighborIdx];
          
          if (neighborRegion !== undefined && neighborRegion !== currentRegion) {
            // 两个区域相邻，添加到邻接图
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
 * 预计算所有城市的RGB颜色值（使用图着色确保相邻区域不同颜色）
 * @param {Array} cityOrder - 城市顺序
 * @param {Uint8Array} regionPixelMap - 区域像素映射（用于构建邻接图）
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {boolean} forceMultiColor - 是否强制使用复色模式（用于保存复色颜色信息）
 * @returns {Object} { colors: [{r, g, b, a}, ...], colorIndices: [0, 1, 2, ...] }
 */
const precomputeCityColors = (cityOrder, regionPixelMap = null, width = null, height = null, forceMultiColor = false) => {
  // 如果 forceMultiColor 为 true，总是使用复色模式的透明度（用于保存复色颜色信息）
  // 否则根据当前的 backgroundMode 决定
  const opacity = (forceMultiColor || poiStore.colorSettings.backgroundMode === 'multi')
    ? (poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1)
    : 1;
  
  // 如果有区域像素映射，使用图着色算法
  let colorIndices = null;
  if (regionPixelMap && width && height && cityOrder.length > 0) {
    try {
      // 基于区域像素映射构建邻接图
      const adjacencyGraph = buildAdjacencyGraphFromRegionMap(regionPixelMap, cityOrder, width, height);
      
      // 执行图着色
      const numColors = poiStore.Colors.length;
      colorIndices = graphColoring(adjacencyGraph, numColors);
      
      console.log('图着色完成（基于最优剖分），颜色分配:', colorIndices);
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
 * 快速更新背景颜色（基于缓存的区域像素映射）
 * @param {CanvasRenderingContext2D} ctx - canvas上下文
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} cityOrder - 城市顺序
 * @param {boolean} forceRecalculate - 是否强制从配色方案重新计算（默认false）
 * @returns {boolean} 是否成功更新
 */
const fastUpdateBackgroundColors = (ctx, width, height, cityOrder, forceRecalculate = false) => {
  // 检查必要的缓存数据
  if (!savedRegionPixelMap || !savedColorIndices || !cityOrder || cityOrder.length === 0) {
    console.warn('fastUpdateBackgroundColors: 缺少必要的缓存数据');
    return false;
  }
  
  // 检查背景模式
  const backgroundMode = poiStore.colorSettings.backgroundMode || 'single';
  
  if (backgroundMode === 'single') {
    // 单色模式：直接填充整个canvas
    const singleColor = poiStore.colorSettings.background || '#ffffff';
    ctx.fillStyle = singleColor;
    ctx.fillRect(0, 0, width, height);
    return true;
  }
  
  // 复色模式：基于区域像素映射更新颜色
  const opacity = poiStore.colorSettings.backgroundMultiColorOpacity ?? 0.1;
  
  // 计算每个城市的颜色（基于当前配色方案）
  const cityColors = cityOrder.map((city, cityIndex) => {
    const colorIndex = savedColorIndices[cityIndex];
    const bgColor = poiStore.Colors[colorIndex % poiStore.Colors.length];
    
    // 转换颜色为rgba
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
  
  // 创建ImageData用于批量绘制
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  // 遍历区域像素映射，填充颜色
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const cityIndex = savedRegionPixelMap[index];
      
      // 如果像素属于某个城市区域
      if (cityIndex !== undefined && cityIndex < cityColors.length) {
        const color = cityColors[cityIndex];
        const pixelIndex = (y * width + x) * 4;
        
        data[pixelIndex] = color.r;     // R
        data[pixelIndex + 1] = color.g; // G
        data[pixelIndex + 2] = color.b; // B
        data[pixelIndex + 3] = color.a; // A
      } else {
        // 如果像素不属于任何区域，填充白色
        const pixelIndex = (y * width + x) * 4;
        data[pixelIndex] = 255;     // R
        data[pixelIndex + 1] = 255; // G
        data[pixelIndex + 2] = 255; // B
        data[pixelIndex + 3] = 255; // A
      }
    }
  }
  
  // 将ImageData绘制到canvas
  ctx.putImageData(imageData, 0, 0);
  
  return true;
};

/**
 * 计算加权维诺图区域映射（不绘制，仅计算）
 * @param {Array} sitesWithWeights - 站点数组（包含x, y, weight, city）
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} resolution - 分辨率步长（默认2，值越小越精确但越慢）
 * @returns {Uint8Array} 区域像素映射，每个像素存储城市索引
 */
const computeWeightedVoronoiMap = async (sitesWithWeights, cityOrder, width, height, resolution = 2) => {
  // 创建城市索引映射
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });

  // 创建区域像素映射（用于快速更新背景颜色）
  const regionPixelMap = new Uint8Array(width * height);

  // 计算每个像素属于哪个区域（使用距离平方避免平方根运算）
  for (let y = 0; y < height; y += resolution) {
    for (let x = 0; x < width; x += resolution) {
      let minWeightedDistSq = Infinity;
      let closestSite = null;
      
      // 找到最近的站点（基于加权距离平方）
      for (const site of sitesWithWeights) {
        const dx = x - site.x;
        const dy = y - site.y;
        const euclideanDistSq = dx * dx + dy * dy;
        
        if (euclideanDistSq === 0) {
          closestSite = site;
          break;
        }
        
        const weight = Math.max(site.weight || 0.00001, 0.00001);
        // 加权距离平方：欧氏距离平方除以权重
        // 注意：加权距离 = 欧氏距离 / sqrt(weight)
        // 所以：加权距离² = 欧氏距离² / weight
        const weightedDistSq = euclideanDistSq / weight;
        
        if (weightedDistSq < minWeightedDistSq) {
          minWeightedDistSq = weightedDistSq;
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
                // 保存区域索引
                regionPixelMap[py * width + px] = cityIndex;
              }
            }
          }
        }
      }
    }
    
    // 每处理一定行数后，让浏览器有机会渲染
    if (y % (resolution * 50) === 0) {
      await waitNextFrame();
    }
  }
  
  return regionPixelMap;
};

/**
 * 绘制加权维诺图到canvas
 * @param {CanvasRenderingContext2D} ctx - canvas上下文
 * @param {Array} sitesWithWeights - 站点数组（包含x, y, weight, city）
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} colors - 颜色数组 [{r, g, b, a}, ...]
 * @param {number} resolution - 分辨率步长（默认2，值越小越精确但越慢）
 * @returns {Uint8Array} 区域像素映射，每个像素存储城市索引
 */
const drawWeightedVoronoi = async (ctx, sitesWithWeights, cityOrder, width, height, colors, resolution = 2) => {
  // 先计算区域映射（使用优化的算法，避免平方根）
  const regionPixelMap = await computeWeightedVoronoiMap(sitesWithWeights, cityOrder, width, height, resolution);
  
  // 创建ImageData用于批量绘制
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  // 根据区域映射填充颜色
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cityIndex = regionPixelMap[y * width + x];
      if (cityIndex !== undefined && colors[cityIndex]) {
        const color = colors[cityIndex];
        const idx = (y * width + x) * 4;
        data[idx] = color.r;     // R
        data[idx + 1] = color.g; // G
        data[idx + 2] = color.b; // B
        data[idx + 3] = color.a; // A
      }
    }
  }

  // 将ImageData绘制到canvas
  ctx.putImageData(imageData, 0, 0);
  
  return regionPixelMap;
};

/**
 * 计算面积误差率并输出到控制台
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {Array} sitesWithWeights - 站点数组（包含weight, city）
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {boolean} verbose - 是否输出详细信息到控制台
 * @returns {Object} { averageErrorRate, areaMetrics, actualAreas, expectedAreas }
 */
const calculateAreaErrorRate = (regionPixelMap, sitesWithWeights, cityOrder, width, height, verbose = true) => {
  if (!regionPixelMap || regionPixelMap.length === 0) {
    console.warn('区域像素映射为空，无法计算面积误差率');
    return { averageErrorRate: 0, areaMetrics: [], actualAreas: [], expectedAreas: [] };
  }
  
  // 创建城市索引映射
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });
  
  // 创建城市到权重的映射
  const cityWeightMap = new Map();
  sitesWithWeights.forEach(site => {
    cityWeightMap.set(site.city, site.weight);
  });
  
  // 计算总权重
  const totalWeight = sitesWithWeights.reduce((sum, site) => sum + site.weight, 0);
  
  // 计算总画布面积（像素数）
  const totalArea = width * height;
  
  // 统计每个区域的实际像素数
  const actualAreas = new Array(cityOrder.length).fill(0);
  for (let i = 0; i < regionPixelMap.length; i++) {
    const cityIndex = regionPixelMap[i];
    if (cityIndex !== undefined && cityIndex < cityOrder.length) {
      actualAreas[cityIndex]++;
    }
  }
  
  // 计算每个区域的指标
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
  
  // 计算平均面积误差率
  const averageErrorRate = cityOrder.length > 0 ? totalErrorRate / cityOrder.length : 0;
  
  
  return { averageErrorRate, areaMetrics, actualAreas, expectedAreas };
};

/**
 * 判断两个voronoi区域是否相邻
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} cityIndex1 - 城市1的索引
 * @param {number} cityIndex2 - 城市2的索引
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {boolean} 是否相邻
 */
const areVoronoiRegionsAdjacent = (regionPixelMap, cityIndex1, cityIndex2, width, height) => {
  // 检查两个区域是否有相邻的像素
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (regionPixelMap[idx] === cityIndex1) {
        // 检查上下左右四个方向的像素
        const neighbors = [
          { x: x - 1, y: y },     // 左
          { x: x + 1, y: y },     // 右
          { x: x, y: y - 1 },     // 上
          { x: x, y: y + 1 }      // 下
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
 * 计算指标的函数
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {Array} cityOrder - 城市顺序
 * @param {Array} sitesWithWeights - 站点数组（包含x, y, weight, city）
 * @param {Object} data - 编译后的数据
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} renderStartTime - 渲染开始时间
 * @returns {Object} 指标对象
 */
const calculateMetrics = (regionPixelMap, cityOrder, sitesWithWeights, data, width, height, renderStartTime) => {
  // 1. 线性序列：目前渲染的城市序列
  const linearSequence = cityOrder.join('-');
  
  // 2. 城市节点数量
  const cityNodeCount = cityOrder.length;
  
  // 创建城市索引映射
  const cityIndexMap = new Map();
  cityOrder.forEach((city, index) => {
    cityIndexMap.set(city, index);
  });
  
  // 3. 序列保持度（连续性）：原本相邻的城市节点在voronoi剖分结果下保持相邻的比例
  let adjacentPairs = 0; // 原本相邻的城市对
  let stillAdjacentPairs = 0; // 在voronoi剖分结果下仍然相邻的城市对
  const stillAdjacentCityPairs = []; // 仍然保持连续的城市节点对
  const brokenCityPairs = []; // 不再连续的城市节点对
  
  // 计算原本相邻的城市对
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
  
  // 4. 可读性：用户视线改变的多少
  // 计算方式：对于城市序列，计算相邻方向向量之间的夹角
  let noOffsetCount = 0; // 视线没有偏移的次数（夹角<=6°）
  let totalVectorPairs = 0; // 总的相邻方向向量对数量
  const noOffsetPairs = []; // 没有视线偏移的向量对
  const offsetPairs = []; // 需要转移视线的向量对
  
  // 首先计算所有方向向量（使用区域中心点）
  const directionVectors = [];
  for (let i = 0; i < cityOrder.length - 1; i++) {
    const city1 = cityOrder[i];
    const city2 = cityOrder[i + 1];
    
    const cityIndex1 = cityIndexMap.get(city1);
    const cityIndex2 = cityIndexMap.get(city2);
    
    if (cityIndex1 !== undefined && cityIndex2 !== undefined) {
      // 获取区域中心点
      const centroid1 = calculateRegionCentroid(regionPixelMap, cityIndex1, width, height);
      const centroid2 = calculateRegionCentroid(regionPixelMap, cityIndex2, width, height);
      
      // 计算方向向量（从city1到city2）
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
  
  // 计算相邻方向向量之间的夹角
  const angleDiffs = []; // 存储所有角度差值，用于计算均值和方差
  for (let i = 0; i < directionVectors.length - 1; i++) {
    const vector1 = directionVectors[i];
    const vector2 = directionVectors[i + 1];
    totalVectorPairs++;
    
    // 计算两个向量的夹角
    const angle1 = vector1.angle;
    const angle2 = vector2.angle;
    
    // 计算角度差（转换为度数）
    let angleDiff = Math.abs(angle2 - angle1) * 180 / Math.PI;
    // 处理角度超过180度的情况，取较小的角度
    if (angleDiff > 180) {
      angleDiff = 360 - angleDiff;
    }
    
    // 保存角度差值
    angleDiffs.push(angleDiff);
    
    // 如果角度差小于等于6度，认为没有偏移
    if (angleDiff <= 6) {
      noOffsetCount++;
      noOffsetPairs.push(`${vector1.toCity}处 (${vector1.fromCity}→${vector1.toCity} 与 ${vector2.fromCity}→${vector2.toCity} 夹角: ${angleDiff.toFixed(2)}°)`);
    } else {
      offsetPairs.push(`${vector1.toCity}处 (${vector1.fromCity}→${vector1.toCity} 与 ${vector2.fromCity}→${vector2.toCity} 夹角: ${angleDiff.toFixed(2)}°)`);
    }
  }
  
  const readability = totalVectorPairs > 0 ? noOffsetCount / totalVectorPairs : 0;
  
  // 计算角度均值和变异系数
  let angleMean = 0;
  let angleCoefficientOfVariation = 0;
  if (angleDiffs.length > 0) {
    // 计算均值
    angleMean = angleDiffs.reduce((sum, angle) => sum + angle, 0) / angleDiffs.length;
    
    // 计算变异系数（标准差/均值 × 100%）
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
  
  // 5. 面积-权重相关性：城市原本的权重与最后剖分得到的面积之间的皮尔逊相关系数
  const weights = [];
  const areas = [];
  
  // 统计每个区域的实际像素数
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
  
  // 计算皮尔逊相关系数
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
  
  // 6. 平均面积误差率：理论应分配的面积与实际分配的面积之间的误差率
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
  
  // 7. 紧凑性：衡量剖分的各个子空间形状的指标
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
  
  // 8. 语义信息密度：单位面积内语义信息量（整体标签总数/整体面积）
  let totalTags = 0;
  
  cityOrder.forEach(city => {
    const cityTags = data[city] ? data[city].length : 0;
    totalTags += cityTags;
  });
  
  const totalCanvasArea = width * height;
  const semanticDensity = totalCanvasArea > 0 ? totalTags / totalCanvasArea : 0;
  
  // 9. 运行效率：voronoi剖分+各个子节点词云渲染的耗时（ms）
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
 * 计算区域中心点（质心）
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} cityIndex - 城市索引
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {Object} { cx, cy } 区域中心点坐标
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
 * @param {Array} sitesWithWeights - 站点数组
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {Array} cityOrder - 城市顺序
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {Array} 调整后的站点数组
 */
const adjustSeedPoints = (sitesWithWeights, regionPixelMap, cityOrder, width, height) => {
  const adjustedSites = sitesWithWeights.map((site) => {
    const cityIndex = cityOrder.indexOf(site.city);
    if (cityIndex === -1) return site;
    
    // 计算区域质心
    const centroid = calculateRegionCentroid(regionPixelMap, cityIndex, width, height);
    
    // 直接将种子点移动到质心位置
    // 确保不超出画布边界
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
 * 检查点是否在指定区域内
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} cityIndex - 城市索引
 * @param {number} x - x坐标
 * @param {number} y - y坐标
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {boolean} 是否在区域内
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

// ========== 位图掩码碰撞检测系统（基于d3-cloud算法） ==========

// 常量定义（参考d3-cloud）
const SPRITE_CANVAS_WIDTH = 1 << 11 >> 5; // 64
const SPRITE_CANVAS_HEIGHT = 1 << 11; // 2048
const RADIANS = Math.PI / 180;

/**
 * 获取Canvas上下文和像素比
 * @param {HTMLCanvasElement} canvas - canvas元素
 * @returns {Object} {context, ratio}
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
 * @param {CanvasRenderingContext2D} spriteCtx - sprite canvas上下文
 * @param {number} spriteRatio - sprite canvas的像素比
 * @param {Object} word - 标签对象 {text, size, fontFamily, fontWeight}
 * @param {number} padding - 标签内边距
 * @returns {Object} {sprite, width, height, x0, y0, x1, y1} sprite位图掩码和尺寸信息
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
  
  // 计算绘制位置（文字居中）
  const anchorX = -Math.floor(textWidth / 2);
  const anchorY = 0;
  
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
  // 文字中心点在 (w/2, h/2)，实际内容从 firstSeenRow 到 seenRow
  const centerY = h >> 1;
  const x0 = -w >> 1;
  const y0 = firstSeenRow - centerY;
  const x1 = w >> 1;
  const y1 = seenRow - centerY + 1; // +1 因为seenRow是最后一个有内容的行
  
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
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {Uint32Array} 位图板数组
 */
const initBitmapBoard = (width, height) => {
  // board大小：(width/32) * height，每个元素是32位整数
  const boardSize = Math.ceil(width / 32) * height;
  return new Uint32Array(boardSize);
};

/**
 * 使用位运算检测碰撞（基于d3-cloud算法）
 * @param {Object} tag - 标签对象，包含 {sprite, width, height, x, y, x0, y0, x1, y1}
 * @param {Uint32Array} board - 位图板
 * @param {number} boardWidth - 画布宽度
 * @param {number} boardHeight - 画布高度
 * @returns {boolean} 是否碰撞
 */
const checkCollisionWithBitmap = (tag, board, boardWidth, boardHeight) => {
  const { sprite, width, height, x, y, x0, y0 } = tag;
  
  if (!sprite || sprite.length === 0) {
    return true; // 如果没有sprite，认为碰撞（避免放置）
  }
  
  const w = width >> 5; // 宽度（32位为单位）
  const sw = boardWidth >> 5; // 画布宽度（32位为单位）
  const lx = x - (w << 4); // 左边界（对齐到32位边界）
  const sx = lx & 0x7f; // x偏移（0-127）
  const msx = 32 - sx; // 右移量
  
  const h = height;
  const startY = y + y0;
  const endY = startY + h;
  
  // 边界检查：确保不越界
  if (startY < 0 || endY > boardHeight || lx < 0 || (lx >> 5) + w + 1 > sw) {
    return true; // 越界视为碰撞
  }
  
  let xIdx = startY * sw + (lx >> 5); // board中的起始索引
  let last = 0;
  
  // 遍历sprite的每一行
  for (let j = 0; j < h; j++) {
    last = 0;
    // 遍历sprite的每一列（32位为单位）
    for (let i = 0; i <= w; i++) {
      const boardIdx = xIdx + i;
      // 边界检查
      if (boardIdx < 0 || boardIdx >= board.length) {
        return true; // 越界视为碰撞
      }
      
      // 计算当前32位块的掩码
      const spriteValue = i < w ? sprite[j * w + i] : 0;
      const mask = (last << msx) | (i < w ? (spriteValue >>> sx) : 0);
      
      // 检查与board的碰撞（位与操作）
      if (mask & board[boardIdx]) {
        return true; // 碰撞
      }
      
      last = spriteValue;
    }
    xIdx += sw; // 移动到下一行
  }
  
  return false; // 无碰撞
};

/**
 * 将标签的sprite写入位图板
 * @param {Object} tag - 标签对象
 * @param {Uint32Array} board - 位图板
 * @param {number} boardWidth - 画布宽度
 * @param {number} boardHeight - 画布高度
 */
const placeTagOnBoard = (tag, board, boardWidth, boardHeight) => {
  const { sprite, width, height, x, y, x0, y0 } = tag;
  
  if (!sprite || sprite.length === 0) {
    return;
  }
  
  const w = width >> 5; // 宽度（32位为单位）
  const sw = boardWidth >> 5; // 画布宽度（32位为单位）
  const lx = x - (w << 4); // 左边界（对齐到32位边界）
  const sx = lx & 0x7f; // x偏移（0-127）
  const msx = 32 - sx; // 右移量
  
  const h = height;
  const startY = y + y0;
  const endY = startY + h;
  
  // 边界检查：确保不越界
  if (startY < 0 || endY > boardHeight || lx < 0 || (lx >> 5) + w + 1 > sw) {
    return; // 越界，不写入
  }
  
  let xIdx = startY * sw + (lx >> 5); // board中的起始索引
  let last = 0;
  
  // 遍历sprite的每一行
  for (let j = 0; j < h; j++) {
    last = 0;
    // 遍历sprite的每一列（32位为单位）
    for (let i = 0; i <= w; i++) {
      const boardIdx = xIdx + i;
      // 边界检查
      if (boardIdx >= 0 && boardIdx < board.length) {
        // 计算当前32位块的掩码
        const spriteValue = i < w ? sprite[j * w + i] : 0;
        const mask = (last << msx) | (i < w ? (spriteValue >>> sx) : 0);
        
        // 将掩码写入board（位或操作）
        board[boardIdx] |= mask;
      }
      
      last = i < w ? sprite[j * w + i] : 0;
    }
    xIdx += sw; // 移动到下一行
  }
};

/**
 * 检查矩形是否与已放置的标签碰撞（保留此函数用于边界框预检查）
 * @param {Array} placedWords - 已放置的标签数组 [{x, y, width, height}, ...]
 * @param {number} x - 新标签的x坐标
 * @param {number} y - 新标签的y坐标
 * @param {number} width - 新标签的宽度
 * @param {number} height - 新标签的高度
 * @param {number} padding - 标签之间的间距
 * @returns {boolean} 是否碰撞
 */
const checkCollision = (placedWords, x, y, width, height, padding = 2) => {
  for (const word of placedWords) {
    const dx = Math.abs(x - word.x);
    const dy = Math.abs(y - word.y);
    const minDistX = (width + word.width) / 2 + padding;
    const minDistY = (height + word.height) / 2 + padding;
    
    if (dx < minDistX && dy < minDistY) {
      return true;
    }
  }
  return false;
};

/**
 * 测量文字尺寸
 * @param {CanvasRenderingContext2D} ctx - canvas上下文
 * @param {string} text - 文字内容
 * @param {string} font - 字体样式字符串
 * @returns {Object} {width, height}
 */
const measureText = (ctx, text, font) => {
  ctx.save();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const width = metrics.width;
  // 使用实际测量高度，如果没有则估算
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 
                 parseInt(font.match(/\d+/)?.[0] || '16') * 1.2;
  ctx.restore();
  return { width, height };
};

/**
 * 使用阿基米德螺线算法布局词云（使用位图掩码碰撞检测）
 * @param {CanvasRenderingContext2D} ctx - canvas上下文
 * @param {string} city - 城市名
 * @param {Array} poiData - POI数据数组 [{text, rankInChina}, ...]
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {number} cityIndex - 城市索引
 * @param {Object} centroid - 质心坐标 {cx, cy}
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Object} fontSettings - 字体设置
 * @param {number} colorIndex - 颜色索引（用于从poiStore.Colors获取颜色）
 */
const layoutWordCloudWithSpiral = (ctx, city, poiData, regionPixelMap, cityIndex, centroid, width, height, fontSettings, colorIndex) => {
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
    // 根据排名计算字号（排名越小，字号越大）
    // 使用对数归一化
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
  const cityFontSize = Math.min(maxSize * 1.2, fontSettings.maxFontSize * 1.5); // 比最大字号大20%，但不超过maxFontSize的1.5倍
  
  // 处理城市名：根据语言设置和序号显示设置
  let cityName = city;
  // 根据语言设置选择城市名：中文使用原城市名，英文使用拼音
  if (fontSettings.language === 'en') {
    cityName = cityNameToPinyin(city);
  }
  // 如果需要显示序号，在城市名前添加序号（序号从1开始，cityIndex从0开始）
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
      // 如果生成失败，跳过该标签
      continue;
    }
  }
  
  // 已放置的标签（用于记录）
  const placedWords = [];
  
  // 阿基米德螺线参数
  const a = 1; // 螺线参数，控制起始半径
  const b = 0.5; // 螺线参数，控制螺线密度（值越小，螺线越紧密）
  const angleStep = 0.05; // 角度步长（更小的步长，更精确）
  
  // 布局每个词
  for (const word of wordsWithSprites) {
    let placed = false;
    let attempts = 0;
    const maxAttempts = 20000; // 最大尝试次数：10000次
    
    // 为每个词重置角度（从质心开始）
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
            // 获取文字配色设置
            const textColorMode = poiStore.colorSettings.textColorMode || 'multi';
            const textSingleColor = poiStore.colorSettings.textSingleColor || 'rgb(0, 0, 0)';
            
            if (word.isCity) {
              ctx.fillStyle = '#ff0000'; // 城市名：红色
            } else {
              // POI文字：根据文字配色模式设置颜色
              if (textColorMode === 'single') {
                ctx.fillStyle = textSingleColor; // 单色模式：使用统一颜色
              } else {
                // 复色模式：使用配色窗口的颜色（与背景色同色系）
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
    
    // // 如果maxAttempts次尝试后仍未放置，放弃当前标签，继续下一个
    // if (!placed) {
    //   console.warn(`标签 "${word.text}" 在 ${maxAttempts} 次尝试后仍无法放置，已跳过`);
    // }
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
 * @param {CanvasRenderingContext2D} ctx - canvas上下文
 * @param {Uint8Array} regionPixelMap - 区域像素映射
 * @param {Array} cityOrder - 城市顺序
 * @param {Object} compiledData - 编译后的POI数据
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {Array} colorIndices - 颜色索引数组，每个城市对应一个颜色索引
 */
const drawWordCloudsInRegions = async (ctx, regionPixelMap, cityOrder, compiledData, width, height, colorIndices) => {
  const fontSettings = poiStore.fontSettings;
  
  // 保存所有城市的布局信息
  const wordCloudLayout = {};
  
  // 为每个城市绘制词云
  for (let cityIndex = 0; cityIndex < cityOrder.length; cityIndex++) {
    const city = cityOrder[cityIndex];
    const poiData = compiledData[city] || [];
    
    // 更新城市进度
    loadingCurrentIndex.value = cityIndex + 1;
    loadingCurrentCity.value = city;
    
    if (poiData.length === 0) {
      continue; // 跳过没有POI数据的城市
    }
    
    // 获取该城市的颜色索引
    const colorIndex = colorIndices && colorIndices[cityIndex] !== undefined 
      ? colorIndices[cityIndex] 
      : cityIndex % poiStore.Colors.length; // 如果没有提供，使用循环分配
    
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
      colorIndex
    );
    
    // 保存布局信息
    wordCloudLayout[cityIndex] = {
      city,
      colorIndex,
      words: layoutResult.words || []
    };
    
    console.log(`城市 ${city}: 成功放置 ${layoutResult.placedCount}/${poiData.length + 1} 个标签`);
    
    // 让浏览器有机会渲染
    await waitNextFrame();
  }
  
  // 保存布局信息到全局变量
  savedWordCloudLayout = wordCloudLayout;
  
  return wordCloudLayout;
};

/**
 * 基于缓存的布局信息重新绘制词云（只更新颜色和字体样式，不重新布局）
 * @param {CanvasRenderingContext2D} ctx - canvas上下文
 * @param {Object} layout - 缓存的布局信息 {cityIndex: {city, colorIndex, words: [...]}}
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 */
const renderWordCloudFromLayout = (ctx, layout, width, height) => {
  if (!layout || !ctx) {
    console.warn('renderWordCloudFromLayout: 缺少布局信息或canvas上下文');
    return;
  }
  
  const fontSettings = poiStore.fontSettings;
  const fontFamily = fontSettings.fontFamily || 'Arial';
  const fontWeight = fontSettings.fontWeight || '700';
  
  // 获取文字配色设置
  const textColorMode = poiStore.colorSettings.textColorMode || 'multi';
  const textSingleColor = poiStore.colorSettings.textSingleColor || 'rgb(0, 0, 0)';
  
  // 遍历所有城市的布局信息
  for (const cityIndex in layout) {
    const cityLayout = layout[cityIndex];
    const { colorIndex, words } = cityLayout;
    
    // 获取该城市的颜色（用于复色模式）
    const multiTextColor = poiStore.Colors[colorIndex % poiStore.Colors.length];
    
    // 绘制每个已放置的标签
    for (const word of words) {
      ctx.save();
      
      // 设置字体（使用当前字体设置）
      const fontStr = `${fontWeight} ${Math.round(word.size)}px ${fontFamily}`;
      ctx.font = fontStr;
      
      // 设置颜色：城市名保持红色，POI根据文字配色模式设置
      if (word.isCity) {
        ctx.fillStyle = '#ff0000'; // 城市名：红色
      } else {
        // POI文字：根据文字配色模式设置颜色
        if (textColorMode === 'single') {
          ctx.fillStyle = textSingleColor; // 单色模式：使用统一颜色
        } else {
          ctx.fillStyle = multiTextColor; // 复色模式：使用配色窗口的颜色（与背景色同色系）
        }
      }
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word.text, word.x, word.y);
      ctx.restore();
    }
  }
};

/**
 * 仅重新生成词云布局（不重新计算加权维诺图）
 * 用于语言切换、序号显示、字号区间、英文字体变化等情况
 */
const relayoutWordCloudOnly = async () => {
  if (!savedRegionPixelMap || !savedCityOrder || !wordCloudCtx || !wordCloudCanvas) {
    console.warn('relayoutWordCloudOnly: 缺少必要的缓存数据');
    return;
  }
  
  const width = wordCloudCanvas.width;
  const height = wordCloudCanvas.height;
  const cityOrder = savedCityOrder;
  const data = poiStore.compiledData;
  
  // 设置词云模式
  loadingMode.value = 'wordcloud';
  loadingTotalCities.value = cityOrder.length;
  loadingCurrentIndex.value = 0;
  loadingStage.value = '正在重新布局词云...';
  
  // 设置loading状态
  poiStore.setCloudLoading(true);
  await nextTick();
  
  // 清空词云canvas
  wordCloudCtx.clearRect(0, 0, width, height);
  
  // 重新生成词云布局（使用当前的字体设置）
  await drawWordCloudsInRegions(
    wordCloudCtx,
    savedRegionPixelMap,
    cityOrder,
    data,
    width,
    height,
    savedColorIndices
  );
  
  // 关闭loading
  poiStore.setCloudLoading(false);
  loadingStage.value = '';
  loadingCurrentCity.value = '';
  loadingCurrentIndex.value = 0;
  loadingTotalCities.value = 0;
  
  // console.log('词云布局已重新生成（不重新计算加权维诺图）');
};

/**
 * 主渲染函数：生成加权维诺图
 */
const handleRenderCloud = async () => {
  const renderStartTime = Date.now(); // 记录开始时间，用于计算运行效率
  
  try {
    console.info('[TagCloudCanvas] handleRenderCloud 开始', {
      hasDrawing: poiStore.hasDrawing,
      cityOrderCount: poiStore.cityOrder.length,
      compiledKeys: Object.keys(poiStore.compiledData || {}).length,
    });
    
    // 检查数据是否已准备好
    if (!poiStore.hasDrawing || !poiStore.cityOrder.length || !Object.keys(poiStore.compiledData || {}).length) {
      console.warn('数据未准备好，请等待数据处理完成', {
        hasDrawing: poiStore.hasDrawing,
        cityOrder: poiStore.cityOrder,
        compiledDataKeys: Object.keys(poiStore.compiledData || {}),
      });
      return;
    }
    
    // 隐藏提示遮罩（用户已点击"运行生成标签云"按钮）
    showHintOverlay.value = false;
    
    // 设置loading状态
    poiStore.setCloudLoading(true);
    // 设置初始模式为加权维诺图模式
    loadingMode.value = 'voronoi';
    loadingStage.value = '正在准备数据...';
    loadingTotalCities.value = poiStore.cityOrder.length;
    loadingCurrentIndex.value = 0;
    
    await nextTick();
    
    // 检查canvas是否已初始化
    if (!voronoiCanvas || !voronoiCtx || !wrapperRef.value) {
      console.error('Canvas未初始化');
      poiStore.setCloudLoading(false);
      return;
    }
    
    // 获取画布尺寸
    const rect = wrapperRef.value.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    
    // 更新canvas尺寸
    voronoiCanvas.width = width;
    voronoiCanvas.height = height;
    
    // 清空canvas
    voronoiCtx.clearRect(0, 0, width, height);
    if (wordCloudCtx && wordCloudCanvas) {
      wordCloudCanvas.width = width;
      wordCloudCanvas.height = height;
      wordCloudCtx.clearRect(0, 0, width, height);
    }
    if (lineCtx && lineCanvas) {
      lineCanvas.width = width;
      lineCanvas.height = height;
      lineCtx.clearRect(0, 0, width, height);
    }
    
    const data = poiStore.compiledData;
    const cityOrder = poiStore.cityOrder;
    
    // 1. 计算城市权重（使用POI数量）
    loadingStage.value = '正在计算城市权重...';
    await waitNextFrame();
    const cityWeights = calculateCityWeights(data, cityOrder);
    console.log('城市权重:', cityWeights);
    
    // 2. 加载城市坐标数据
    loadingStage.value = '正在加载城市坐标...';
    await waitNextFrame();
    const cities = await loadCityCoordinates();
    if (!cities) {
      console.error('无法加载城市坐标数据');
      poiStore.setCloudLoading(false);
      return;
    }
    
    // 3. 映射城市中心点到画布空间
    loadingStage.value = '正在映射城市坐标...';
    await waitNextFrame();
    const sites = mapCoordinatesToCanvas(cities, cityOrder, width, height);
    if (sites.length === 0) {
      console.error('无法映射城市坐标');
      poiStore.setCloudLoading(false);
      return;
    }
    
    // 4. 合并站点和权重
    const sitesWithWeights = sites.map(site => {
      const weightInfo = cityWeights.find(w => w.city === site.city);
      return {
        ...site,
        weight: weightInfo ? weightInfo.weight : 0.00001
      };
    });
    
    // 保存站点信息（用于绘制线条）
    savedSites = sitesWithWeights;
    
    // 5. 创建临时颜色数组（用于迭代优化过程中的区域映射计算，颜色不重要）
    const tempColors = cityOrder.map(() => ({ r: 200, g: 200, b: 200, a: 255 }));
    
    // 6. 迭代优化算法（方案4）- 跑满20次迭代，找出最优方案
    const maxIterations = 20;
    let currentSites = sitesWithWeights.map(s => ({ ...s })); // 深拷贝
    let bestErrorRate = Infinity;
    let bestSites = sitesWithWeights.map(s => ({ ...s })); // 深拷贝
    let bestRegionPixelMap = null;
    
    // 设置加权维诺图模式
    loadingMode.value = 'voronoi';
    loadingTotalIterations.value = maxIterations;
    loadingCurrentIteration.value = 0;
    
    // 迭代优化时使用粗分辨率（加快计算速度）
    const iterationResolution = 4; // 粗分辨率，用于快速迭代
    // 最终绘制时使用细分辨率（保证精度）
    const finalResolution = 2; // 细分辨率，用于最终绘制
    
    console.log('========== 开始迭代优化（跑满20次） ==========');
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      loadingCurrentIteration.value = iteration + 1;
      loadingStage.value = `正在迭代优化加权维诺图...`;
      await waitNextFrame();
      
      // 使用粗分辨率计算区域映射（不绘制，只计算）
      // 优化：避免平方根运算，使用距离平方比较
      const currentRegionPixelMap = await computeWeightedVoronoiMap(
        currentSites, 
        cityOrder, 
        width, 
        height, 
        iterationResolution
      );
      
      // 计算面积误差率（不输出详细信息，只在最后一次输出）
      const { averageErrorRate, actualAreas, expectedAreas } = calculateAreaErrorRate(
        currentRegionPixelMap, 
        currentSites, 
        cityOrder, 
        width, 
        height, 
        false // 不输出详细信息
      );
      
      console.log(`迭代 ${iteration + 1}: 平均面积误差率 = ${averageErrorRate.toFixed(2)}%`);
      
      // 保存最佳结果（误差率最小的）
      if (averageErrorRate < bestErrorRate) {
        bestErrorRate = averageErrorRate;
        bestSites = currentSites.map(s => ({ ...s })); // 深拷贝
        bestRegionPixelMap = new Uint8Array(currentRegionPixelMap);
        // console.log(`  → 更新最佳结果: ${bestErrorRate.toFixed(2)}%`);
      }
      
      // 如果不是最后一次迭代，将种子点直接移动到质心处
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
    
    console.log(`迭代优化完成，最佳平均面积误差率: ${bestErrorRate.toFixed(2)}%`);
    console.log('');
    
    // 7. 基于最优剖分计算颜色（确保相邻区域颜色不同）
    loadingStage.value = '正在计算颜色分配（基于最优剖分）...';
    await waitNextFrame();
    
    // 使用最佳站点位置，用细分辨率重新计算最终的区域映射
    loadingStage.value = '正在计算最终区域映射（细分辨率）...';
    await waitNextFrame();
    
    // 使用细分辨率计算最终的区域映射（不绘制，只计算）
    bestRegionPixelMap = await computeWeightedVoronoiMap(
      bestSites, 
      cityOrder, 
      width, 
      height, 
      finalResolution
    );
    
    // 基于最优区域映射计算颜色
    const { colors, colorIndices } = precomputeCityColors(cityOrder, bestRegionPixelMap, width, height, true);
    savedColorIndices = colorIndices;
    savedMultiColorColors = colors;
    
    // 8. 使用最佳结果绘制最终维诺图
    loadingStage.value = '正在绘制最终加权维诺图...';
    await waitNextFrame();
    
    // 清空canvas
    voronoiCtx.clearRect(0, 0, width, height);
    
    // 保存区域映射（使用细分辨率计算的最终结果）
    savedRegionPixelMap = bestRegionPixelMap;
    
    // 根据背景模式决定如何绘制
    if (poiStore.colorSettings.backgroundMode === 'multi') {
      // 复色模式：从区域映射绘制颜色（使用基于最优剖分计算的颜色）
      const imageData = voronoiCtx.createImageData(width, height);
      const data = imageData.data;
      
      for (let i = 0; i < bestRegionPixelMap.length; i++) {
        const cityIndex = bestRegionPixelMap[i];
        if (cityIndex !== undefined && cityIndex < colors.length) {
          const color = colors[cityIndex];
          const idx = i * 4;
          data[idx] = color.r;
          data[idx + 1] = color.g;
          data[idx + 2] = color.b;
          data[idx + 3] = color.a;
        }
      }
      
      voronoiCtx.putImageData(imageData, 0, 0);
    } else {
      // 单色模式：填充单色背景
      const singleColor = poiStore.colorSettings.background || '#ffffff';
      voronoiCtx.fillStyle = singleColor;
      voronoiCtx.fillRect(0, 0, width, height);
    }
    
    // 8. 计算并输出最终面积误差率（输出详细信息）
    loadingStage.value = '正在计算最终面积误差率...';
    await waitNextFrame();
    const finalErrorRate = calculateAreaErrorRate(savedRegionPixelMap, bestSites, cityOrder, width, height, true);
    console.log(`最终平均面积误差率: ${finalErrorRate.averageErrorRate.toFixed(2)}%`);
    
    // 更新保存的站点信息（使用优化后的位置）
    savedSites = bestSites;
    
    // 9. 在各个城市子空间内绘制POI词云
    // 切换到词云模式
    loadingMode.value = 'wordcloud';
    loadingTotalCities.value = cityOrder.length;
    loadingCurrentIndex.value = 0;
    loadingStage.value = '正在绘制词云...';
    await waitNextFrame();
    await drawWordCloudsInRegions(wordCloudCtx, savedRegionPixelMap, cityOrder, data, width, height, savedColorIndices);
    
    // 10. 绘制城市之间的连接线
    drawCityLines();
    
    // 保存状态
    savedCanvasSize = { width, height };
    savedCityOrder = [...cityOrder];
    
    console.log('加权维诺图绘制完成');
    
    // 11. 计算并输出指标
    const metrics = calculateMetrics(
      savedRegionPixelMap, 
      cityOrder, 
      bestSites, 
      data, 
      width, 
      height, 
      renderStartTime
    );
    
    console.log('========== Voronoi 指标统计 ==========');
    console.log('1. 线性序列:', metrics.linearSequence);
    console.log('2. 城市节点数量:', metrics.cityNodeCount);
    
    console.log('3. 序列保持度（连续性）:', (metrics.sequenceContinuity * 100).toFixed(2) + '%');
    console.log('   仍然保持连续的城市节点对:', metrics.stillAdjacentCityPairs.length > 0 ? metrics.stillAdjacentCityPairs.join(', ') : '无');
    console.log('   不再连续的城市节点对:', metrics.brokenCityPairs.length > 0 ? metrics.brokenCityPairs.join(', ') : '无');
    
    console.log('4. 可读性:', (metrics.readability * 100).toFixed(2) + '%');
    console.log('   没有视线偏移的相邻向量对 (夹角<=6°):', metrics.noOffsetPairs.length > 0 ? metrics.noOffsetPairs.join('; ') : '无');
    console.log('   需要转移视线的相邻向量对 (夹角>6°):', metrics.offsetPairs.length > 0 ? metrics.offsetPairs.join('; ') : '无');
    console.log('   角度均值:', metrics.angleMean.toFixed(2) + '°');
    console.log('   角度变异系数:', metrics.angleCoefficientOfVariation.toFixed(2) + '%');
    
    console.log('5. 面积-权重相关性:', metrics.areaWeightCorrelation.toFixed(4));
    
    console.log('6. 平均面积误差率:', metrics.averageAreaErrorRate.toFixed(2) + '%');
    console.log('   各个子空间的面积误差率:');
    metrics.areaErrorRates.forEach(item => {
      console.log(`      ${item.city}: 理论面积=${item.expectedArea}, 实际面积=${item.actualArea}, 误差率=${item.errorRate}%`);
    });
    
    console.log('7. 紧凑性:', metrics.averageCompactness.toFixed(4));
    console.log('   各个子空间的紧凑性:');
    if (metrics.compactnessValues && metrics.compactnessValues.length > 0) {
      // 统计每个区域的实际面积，用于匹配紧凑性值
      const actualAreasForCompactness = new Array(cityOrder.length).fill(0);
      for (let i = 0; i < savedRegionPixelMap.length; i++) {
        const cityIndex = savedRegionPixelMap[i];
        if (cityIndex !== undefined && cityIndex < cityOrder.length) {
          actualAreasForCompactness[cityIndex]++;
        }
      }
      
      let compactnessIndex = 0;
      cityOrder.forEach((city, index) => {
        const area = actualAreasForCompactness[index] || 0;
        if (area > 0 && compactnessIndex < metrics.compactnessValues.length) {
          console.log(`      ${city}: ${metrics.compactnessValues[compactnessIndex].toFixed(4)}`);
          compactnessIndex++;
        }
      });
    }
    
    console.log('8. 语义信息密度:', metrics.semanticDensity.toFixed(6));
    console.log('   总标签数量:', metrics.totalTags);
    console.log('   总面积:', metrics.totalArea);
    console.log('   总宽度:', metrics.totalWidth);
    console.log('   总高度:', metrics.totalHeight);
    
    console.log('9. 运行效率:', metrics.renderEfficiency + 'ms');
    console.log('=====================================');
    
    // 记录词云生成
    try {
      await recordTagCloudGeneration('voronoi');
      window.dispatchEvent(new CustomEvent('tagcloud-generated'));
    } catch (error) {
      console.warn('记录词云生成失败:', error);
    }
    
  } catch (error) {
    console.error('[TagCloudCanvas] handleRenderCloud 错误:', error);
  } finally {
    poiStore.setCloudLoading(false);
    loadingMode.value = 'voronoi';
    loadingStage.value = '';
    loadingCurrentCity.value = '';
    loadingCurrentIndex.value = 0;
    loadingTotalCities.value = 0;
    loadingCurrentIteration.value = 0;
    loadingTotalIterations.value = 0;
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
    // 绘制折线（优化版：连接处使用弧形）
    const shrinkRatio = 0.15; // 缩进比例
    
    if (points.length === 2) {
      // 只有两个点，直接连接
      lineCtx.moveTo(points[0].x, points[0].y);
      lineCtx.lineTo(points[1].x, points[1].y);
    } else {
      // 多个点，使用圆角折线
      // 计算每个顶点处的缩进点
      const shrunkPoints = [];
      
      for (let i = 0; i < points.length; i++) {
        if (i === 0) {
          // 第一个点：不缩进，直接使用
          shrunkPoints.push({
            point: points[0],
            vertex: null
          });
        } else if (i === points.length - 1) {
          // 最后一个点：不缩进，直接使用
          shrunkPoints.push({
            point: points[i],
            vertex: null
          });
        } else {
          // 中间点：计算前后两段的缩进点
          const prev = points[i - 1];
          const curr = points[i];
          const next = points[i + 1];
          
          // 前一段的方向和距离
          const dx1 = curr.x - prev.x;
          const dy1 = curr.y - prev.y;
          const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
          
          // 后一段的方向和距离
          const dx2 = next.x - curr.x;
          const dy2 = next.y - curr.y;
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          
          if (dist1 > 0 && dist2 > 0) {
            const unitX1 = dx1 / dist1;
            const unitY1 = dy1 / dist1;
            const unitX2 = dx2 / dist2;
            const unitY2 = dy2 / dist2;
            
            const shrinkDist1 = dist1 * shrinkRatio;
            const shrinkDist2 = dist2 * shrinkRatio;
            
            // 前一段的缩进点（从顶点往回缩）
            const shrinkPointBefore = {
              x: curr.x - unitX1 * shrinkDist1,
              y: curr.y - unitY1 * shrinkDist1
            };
            
            // 后一段的缩进点（从顶点往前缩）
            const shrinkPointAfter = {
              x: curr.x + unitX2 * shrinkDist2,
              y: curr.y + unitY2 * shrinkDist2
            };
            
            // 存储前一个缩进点
            shrunkPoints.push({
              point: shrinkPointBefore,
              vertex: null
            });
            
            // 存储顶点信息（用于贝塞尔曲线）
            shrunkPoints.push({
              point: shrinkPointAfter,
              vertex: curr // 原始顶点作为控制点
            });
          } else {
            shrunkPoints.push({ point: curr, vertex: null });
          }
        }
      }
      
      // 绘制路径
      lineCtx.moveTo(shrunkPoints[0].point.x, shrunkPoints[0].point.y);
      
      for (let i = 1; i < shrunkPoints.length; i++) {
        const current = shrunkPoints[i];
        
        if (current.vertex) {
          // 使用二次贝塞尔曲线连接，控制点为原始顶点
          lineCtx.quadraticCurveTo(
            current.vertex.x, current.vertex.y,
            current.point.x, current.point.y
          );
        } else {
          // 直线连接
          lineCtx.lineTo(current.point.x, current.point.y);
        }
      }
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

// 监听绘制状态变化，当绘制被清除时重新显示提示遮罩
watch(
  () => poiStore.hasDrawing,
  (hasDrawing) => {
    if (!hasDrawing) {
      // 绘制被清除，重新显示提示遮罩
      showHintOverlay.value = true;
    }
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
          // console.log('切换到单色模式，快速填充canvas...');
          const singleColor = newVal.background || '#ffffff';
          voronoiCtx.fillStyle = singleColor;
          voronoiCtx.fillRect(0, 0, voronoiCanvas.width, voronoiCanvas.height);
          
          // 文字颜色不需要变化（因为文字颜色由textColorMode控制）
        } else if (newVal.backgroundMode === 'multi' && savedRegionPixelMap && savedCityOrder && savedColorIndices) {
          // 切换回复色模式：使用保存的复色颜色信息（即使一开始是单色模式，也保存了复色颜色）
          // console.log('切换回复色模式，使用保存的复色颜色信息...');
          const success = fastUpdateBackgroundColors(
            voronoiCtx, 
            voronoiCanvas.width, 
            voronoiCanvas.height, 
            poiStore.cityOrder
          );
          if (success && savedWordCloudLayout && wordCloudCtx && wordCloudCanvas) {
            // 同步更新文字颜色
            // console.log('同步更新文字颜色...');
            wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
            renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
          } else if (!success) {
            // console.warn('快速更新背景颜色失败，可能需要完整重新生成');
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
        // console.log('配色方案变化（色带颜色自定义），快速更新背景和文字颜色...');
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
              // console.log('已更新保存的复色颜色信息，使用新的配色方案');
            }
            
            // 背景颜色更新成功后，同步更新文字颜色（确保使用相同的颜色索引和颜色值）
            if (savedWordCloudLayout && wordCloudCtx && wordCloudCanvas) {
              console.log('同步更新文字颜色（使用相同的图着色颜色索引和新的配色方案）...');
              // wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
              renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
            }
          } else {
            // 如果快速更新失败，回退到完整重新生成
            // console.log('快速更新失败，回退到完整重新生成');
            handleRenderCloud();
          }
        }
        return; // 配色方案变化处理完成，直接返回
      }
      
      // 处理纯文字配色变化
      if (pureTextColorChanged && !backgroundChanged && savedWordCloudLayout) {
        // 只有文字配色变化（不包括配色方案），且已有保存的布局，快速重绘词云
        // console.log('文字配色变化，快速重绘词云...');
        if (wordCloudCtx && wordCloudCanvas) {
          wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
          renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
        }
        return; // 文字配色变化处理完成，直接返回
      }
      
      // 处理背景配色变化（不包括配色方案变化和背景模式变化）
      if (backgroundChanged && !paletteChanged && !backgroundModeChanged && savedRegionPixelMap && savedCityOrder && savedColorIndices) {
        // 背景配色变化（不包括配色方案变化），且已有保存的区域映射和颜色索引，快速更新背景和文字颜色
        // console.log('背景配色变化（快速更新模式）...');
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
              // console.log('同步更新文字颜色（使用相同的图着色颜色索引）...');
              wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
              renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
            }
          } else {
            // 如果快速更新失败，回退到完整重新生成
            // console.log('快速更新失败，回退到完整重新生成');
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

// 中文字体列表（用于判断字体类型）
const chineseFonts = [
  '等线', '等线 Light', '方正舒体', '方正姚体', '仿宋', '黑体',
  '华文彩云', '华文仿宋', '华文琥珀', '华文楷体', '华文隶书', '华文宋体', 
  '华文细黑', '华文新魏', '华文行楷', '华文中宋', '楷体', '隶书', 
  '宋体', '微软雅黑', '微软雅黑 Light', '新宋体', '幼圆', '思源黑体'
];

// 英文字体列表（用于判断字体类型）
const englishFonts = [
  'Arial', 'Inter', 
  'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Comic Sans MS',
  'Impact', 'Trebuchet MS', 'Palatino', 'Garamond', 
  'Helvetica', 'Tahoma', 'Lucida Console', 'Century Gothic', 'Franklin Gothic',
  'Baskerville',
];

// 判断字体是否为中文字体
const isChineseFont = (fontName) => {
  return chineseFonts.includes(fontName);
};

// 判断字体是否为英文字体
const isEnglishFont = (fontName) => {
  return englishFonts.includes(fontName);
};

// watch字体设置变化 - 区分"仅重新布局词云"和"仅样式重绘"
watch(
  () => ({...poiStore.fontSettings}),
  async (newVal, oldVal) => {
    if (!oldVal || !poiStore.hasDrawing) {
      return;
    }
    
    // ========== 改变词云布局的交互（需要重新生成词云） ==========
    // 语言切换（中英文切换）
    const languageChanged = newVal.language !== oldVal.language;
    // 序号的显示与否
    const showCityIndexChanged = newVal.showCityIndex !== oldVal.showCityIndex;
    // 字号区间变化（会影响标签大小，需要重新布局）
    const fontSizeChanged = 
      newVal.minFontSize !== oldVal.minFontSize ||
      newVal.maxFontSize !== oldVal.maxFontSize;
    // 英文字体变化（会影响标签大小，需要重新布局）
    const englishFontChanged = 
      newVal.fontFamily !== oldVal.fontFamily && 
      (isEnglishFont(newVal.fontFamily) || isEnglishFont(oldVal.fontFamily));
    // 英文字重变化（会影响标签大小，需要重新布局）
    const englishWeightChanged = 
      newVal.fontWeight !== oldVal.fontWeight &&
      newVal.language === 'en';
    
    // ========== 不改变词云布局的交互（只需要更新显示） ==========
    // 中文字重变化（不影响标签大小，只需更新样式）
    const chineseWeightChanged = 
      newVal.fontWeight !== oldVal.fontWeight &&
      newVal.language === 'zh';
    // 中文字体变化（不影响标签大小，只需更新样式）
    const chineseFontChanged = 
      newVal.fontFamily !== oldVal.fontFamily &&
      (isChineseFont(newVal.fontFamily) || isChineseFont(oldVal.fontFamily)) &&
      newVal.language === 'zh';
    
    // 处理改变词云布局的交互
    if (languageChanged || showCityIndexChanged || fontSizeChanged || englishFontChanged || englishWeightChanged) {
      console.log('字体设置变化（需要重新布局词云）：', {
        languageChanged,
        showCityIndexChanged,
        fontSizeChanged,
        englishFontChanged,
        englishWeightChanged
      });
      
      // 如果是语言切换，需要等待数据重新编译
      if (languageChanged) {
        await nextTick();
        await new Promise(resolve => setTimeout(resolve, 100)); // 给一点时间让数据编译完成
      }
      
      // 仅在现有加权Voronoi基础上重新生成词云布局
      await relayoutWordCloudOnly();
      return;
    }
    
    // 处理不改变词云布局的交互（只需要更新显示）
    if ((chineseWeightChanged || chineseFontChanged) && savedWordCloudLayout && wordCloudCtx && wordCloudCanvas) {
      console.log('字体设置变化（只需更新样式）：', {
        chineseWeightChanged,
        chineseFontChanged
      });
      
      // 基于原有位置重新绘制样式
      wordCloudCtx.clearRect(0, 0, wordCloudCanvas.width, wordCloudCanvas.height);
      renderWordCloudFromLayout(wordCloudCtx, savedWordCloudLayout, wordCloudCanvas.width, wordCloudCanvas.height);
      return;
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

.cloud-loading-iteration-text {
  font-size: 16px;
  color: #606266;
  margin-top: 8px;
  font-weight: 500;
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



