<template>
  <div :class="['graph-panel', $attrs.class]" ref="containerRef">
    <svg ref="svgRef"></svg>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import { usePoiStore } from '@/stores/poiStore';
import { normalizeCityName } from '@/utils/normalizeCityName';
import { buildAdjacencyGraph } from '@/utils/provinceAdjacency';

const provinceLayoutPositions = {
  新疆: { x: 0.1, y: 0.28 },
  西藏: { x: 0.18, y: 0.72 },
  青海: { x: 0.24, y: 0.5 },
  甘肃: { x: 0.32, y: 0.40 },
  宁夏: { x: 0.46, y: 0.38 },
  内蒙古: { x: 0.47, y: 0.24 },
  黑龙江: { x: 0.92, y: 0.14 },
  吉林: { x: 0.85, y: 0.22 },
  辽宁: { x: 0.82, y: 0.30 },
  北京: { x: 0.73, y: 0.32 },
  天津: { x: 0.78, y: 0.38 },
  河北: { x: 0.68, y: 0.38 },
  山西: { x: 0.58, y: 0.40 },
  山东: { x: 0.74, y: 0.47 },
  河南: { x: 0.64, y: 0.5 },
  陕西: { x: 0.55, y: 0.52 },
  重庆: { x: 0.50, y: 0.64 },
  四川: { x: 0.37, y: 0.64 },
  湖北: { x: 0.62, y: 0.6 },
  湖南: { x: 0.62, y: 0.70 },
  安徽: { x: 0.7, y: 0.58 },
  江苏: { x: 0.79, y: 0.55 },
  上海: { x: 0.87, y: 0.60 },
  浙江: { x: 0.8, y: 0.66 },
  福建: { x: 0.83, y: 0.76 },
  江西: { x: 0.72, y: 0.69 },
  广东: { x: 0.70, y: 0.8 },
  广西: { x: 0.57, y: 0.84 },
  海南: { x: 0.64, y: 0.95 },
  云南: { x: 0.38, y: 0.82 },
  贵州: { x: 0.47, y: 0.74 },
  香港: { x: 0.78, y: 0.86 },
  澳门: { x: 0.71, y: 0.88 },
  台湾: { x: 0.9, y: 0.78 },
};

const containerRef = ref(null);
const svgRef = ref(null);
const poiStore = usePoiStore();
const size = ref({ width: 0, height: 0 });
const mode = computed(() => (poiStore.hasDrawing ? 'route' : 'province'));
const routeCities = computed(() => poiStore.cityOrder || []);
const provinceList = computed(() => Object.keys(provinceLayoutPositions));

// 使用预定义的省份相邻关系
const provinceAdjacency = computed(() => buildAdjacencyGraph());

let resizeObserver = null;
let simulation = null;

const updateSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    if (rect.width && rect.height) {
      size.value = { width: rect.width, height: rect.height };
    }
  }
};

const drawGraph = () => {
  if (!svgRef.value || !size.value.width || !size.value.height) return;
  
  // 停止之前的模拟
  if (simulation) {
    simulation.stop();
  }
  
  const svg = d3.select(svgRef.value);
  svg.attr('width', size.value.width).attr('height', size.value.height);
  svg.selectAll('*').remove();

  const group = svg.append('g');

  if (mode.value === 'province') {
    drawProvinceGraph(group, size.value.width, size.value.height);
  } else {
    drawRouteGraph(group, size.value.width, size.value.height);
  }
};

// 使用D3力导向图绘制省份网络
const drawProvinceGraph = (group, width, height) => {
  const provinces = provinceList.value;
  if (!provinces.length) {
    group
      .append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#88b9ff')
      .attr('font-size', 14)
      .text('正在加载省份图谱...');
    return;
  }

  // 创建节点
  const nodes = provinces.map((province) => ({
    id: province,
    name: province,
    radius: 6,
  }));

  // 创建边（基于相邻关系）
  const links = [];
  const adj = provinceAdjacency.value;
  provinces.forEach((prov1) => {
    const neighbors = adj.get(prov1);
    if (neighbors) {
      neighbors.forEach((prov2) => {
        if (provinces.indexOf(prov1) < provinces.indexOf(prov2)) {
          links.push({ source: prov1, target: prov2 });
        }
      });
    }
  });

  const layoutPadding = 10;
  nodes.forEach((node, i) => {
    const layout = provinceLayoutPositions[node.id];
    if (layout) {
      node.x = layoutPadding + layout.x * (width - layoutPadding * 2);
      node.y = layoutPadding + layout.y * (height - layoutPadding * 2);
    } else {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const fallbackRadius = Math.min(width, height) / 2 - layoutPadding;
      node.x = width / 2 + Math.cos(angle) * fallbackRadius * 0.6;
      node.y = height / 2 + Math.sin(angle) * fallbackRadius * 0.6;
    }
  });

  simulation = null;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const layoutLinks = links
    .map((link) => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) return null;
      return { source, target };
    })
    .filter(Boolean);

  // 绘制边
  const link = group
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(layoutLinks)
    .enter()
    .append('line')
    .attr('stroke', '#4dd2ff')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.6)
    .attr('stroke-linecap', 'round');

  // 绘制节点
  const node = group
    .append('g')
    .attr('class', 'nodes')
    .selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('r', (d) => d.radius)
    .attr('fill', '#4dd2ff')
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.8)
    .attr('cursor', 'pointer')
    .style('filter', 'drop-shadow(0 0 6px rgba(77, 210, 255, 0.6))')
    .on('mouseover', function (event, d) {
      d3.select(this).attr('r', d.radius + 1).style('filter', 'drop-shadow(0 0 10px rgba(77, 210, 255, 0.9))');
    })
    .on('mouseout', function (event, d) {
      d3.select(this).attr('r', d.radius).style('filter', 'drop-shadow(0 0 6px rgba(77, 210, 255, 0.6))');
    });

  // 绘制标签（黑色文字无背景）
  const labels = group
    .append('g')
    .attr('class', 'labels')
    .selectAll('text')
    .data(nodes)
    .enter()
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', 4)
    .attr('fill', '#000000')
    .attr('font-size', 11)
    .attr('font-weight', 600)
    .text((d) => d.name);

  link
    .attr('x1', (d) => d.source.x)
    .attr('y1', (d) => d.source.y)
    .attr('x2', (d) => d.target.x)
    .attr('y2', (d) => d.target.y);

  node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);

  labels.attr('x', (d) => d.x).attr('y', (d) => d.y - d.radius - 10);
};

// 使用蛇形排布绘制路径城市
const drawRouteGraph = (group, width, height) => {
  const cities = routeCities.value || [];
  if (!cities.length) {
    group
      .append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#88b9ff')
      .attr('font-size', 14)
      .text('路径城市尚未生成');
    return;
  }

  const padding = 40;
  const nodeRadius = 6;
  const labelOffsetY = 15; // 标签在节点上方的偏移
  
  // 根据节点数量动态调整最小间距（点少时间距小，点多时间距大）
  const baseMinSpacingX = 60;
  const baseMinSpacingY = 40;
  const minNodeSpacingX = Math.max(50, baseMinSpacingX - Math.min(cities.length * 2, 30));
  const minNodeSpacingY = Math.max(35, baseMinSpacingY - Math.min(cities.length * 1.5, 20));

  // 计算可用空间（确保所有节点都在这个范围内）
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  // 智能计算布局参数
  // 首先尝试不同的行数，找到最优的布局方案
  let bestLayout = null;
  let bestScore = Infinity;

  // 尝试不同的行数（从1行到最多需要的行数）
  const maxPossibleRows = Math.min(Math.ceil(cities.length), Math.ceil(availableHeight / minNodeSpacingY) + 1);
  for (let numRows = 1; numRows <= maxPossibleRows; numRows++) {
    const nodesPerRow = Math.ceil(cities.length / numRows);
    
    // 计算需要的间距（确保第一个节点在 padding，最后一个节点在 width - padding）
    const requiredSpacingX = nodesPerRow > 1 
      ? availableWidth / (nodesPerRow - 1) 
      : 0;
    const requiredSpacingY = numRows > 1 
      ? availableHeight / (numRows - 1) 
      : 0;
    
    // 检查是否满足最小间距要求
    if (requiredSpacingX < minNodeSpacingX || requiredSpacingY < minNodeSpacingY) {
      continue;
    }
    
    // 计算布局评分（优先选择宽高比更接近容器宽高比的方案）
    const containerAspectRatio = availableWidth / availableHeight;
    const layoutAspectRatio = (nodesPerRow * requiredSpacingX) / (numRows * requiredSpacingY);
    const aspectRatioDiff = Math.abs(containerAspectRatio - layoutAspectRatio);
    
    // 同时考虑间距的均匀性
    const spacingUniformity = Math.abs(requiredSpacingX - requiredSpacingY) / Math.max(requiredSpacingX, requiredSpacingY);
    
    const score = aspectRatioDiff * 0.7 + spacingUniformity * 0.3;
    
    if (score < bestScore) {
      bestScore = score;
      bestLayout = {
        numRows,
        nodesPerRow,
        spacingX: requiredSpacingX,
        spacingY: requiredSpacingY,
      };
    }
  }

  // 如果没有找到合适的布局，使用强制布局（确保所有节点都在边界内）
  if (!bestLayout) {
    // 根据可用空间和最小间距计算最大可能的行数和列数
    const maxNodesPerRow = Math.max(1, Math.floor(availableWidth / minNodeSpacingX) + 1);
    const maxRows = Math.max(1, Math.floor(availableHeight / minNodeSpacingY) + 1);
    
    // 尝试找到最接近正方形布局的方案
    let nodesPerRow = Math.ceil(Math.sqrt(cities.length * (availableWidth / availableHeight)));
    nodesPerRow = Math.max(1, Math.min(nodesPerRow, maxNodesPerRow));
    const numRows = Math.ceil(cities.length / nodesPerRow);
    
    // 确保行数不超过限制
    const finalNumRows = Math.min(numRows, maxRows);
    const finalNodesPerRow = Math.ceil(cities.length / finalNumRows);
    
    bestLayout = {
      numRows: finalNumRows,
      nodesPerRow: finalNodesPerRow,
      spacingX: finalNodesPerRow > 1 ? availableWidth / (finalNodesPerRow - 1) : 0,
      spacingY: finalNumRows > 1 ? availableHeight / (finalNumRows - 1) : 0,
    };
  }

  const { numRows, nodesPerRow, spacingX, spacingY } = bestLayout;

  // 计算起始位置（第一个节点在 padding 位置）
  const startX = padding;
  const startY = padding;

  // 创建节点并计算蛇形位置
  const nodes = cities.map((city, index) => {
    const row = Math.floor(index / nodesPerRow);
    const colInRow = index % nodesPerRow;
    
    // 判断当前行是奇数行还是偶数行（从0开始计数）
    // 偶数行（0, 2, 4...）：从左到右
    // 奇数行（1, 3, 5...）：从右到左
    const isEvenRow = row % 2 === 0;
    
    // 计算当前行的实际节点数
    const nodesInCurrentRow = row === numRows - 1 
      ? cities.length - row * nodesPerRow 
      : nodesPerRow;
    
    // 计算当前行的起始X位置（居中该行）
    let rowStartX;
    if (nodesInCurrentRow === 1) {
      // 单节点居中
      rowStartX = startX + availableWidth / 2;
    } else {
      // 多节点：第一个节点在 startX，最后一个节点在 startX + availableWidth
      const rowWidth = (nodesInCurrentRow - 1) * spacingX;
      rowStartX = startX + (availableWidth - rowWidth) / 2;
    }
    
    // 计算列位置（考虑蛇形）
    let col;
    if (isEvenRow) {
      col = colInRow;
    } else {
      col = nodesInCurrentRow - 1 - colInRow;
    }
    
    // 计算节点位置（确保在边界内）
    const x = nodesInCurrentRow > 1 
      ? rowStartX + col * spacingX 
      : rowStartX;
    const y = numRows > 1 
      ? startY + row * spacingY 
      : startY + availableHeight / 2;
    
    // 边界检查：确保节点在可见区域内
    const finalX = Math.max(padding + nodeRadius, Math.min(width - padding - nodeRadius, x));
    const finalY = Math.max(padding + nodeRadius, Math.min(height - padding - nodeRadius, y));

    return {
      id: `${city}-${index}`,
      name: city,
      index,
      x: finalX,
      y: finalY,
      radius: nodeRadius,
    };
  });

  // 创建边（按顺序连接相邻节点）
  const links = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    links.push({ source: nodes[i], target: nodes[i + 1] });
  }

  // 绘制边
  const link = group
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('x1', (d) => d.source.x)
    .attr('y1', (d) => d.source.y)
    .attr('x2', (d) => d.target.x)
    .attr('y2', (d) => d.target.y)
    .attr('stroke', '#000000')
    .attr('stroke-width', 3)
    .attr('stroke-opacity', 0.8)
    .attr('stroke-linecap', 'round');

  // 绘制节点
  const node = group
    .append('g')
    .attr('class', 'nodes')
    .selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => d.radius)
    .attr('fill', '#ff7a7a')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2.5)
    .attr('cursor', 'pointer')
    .style('filter', 'drop-shadow(0 0 6px rgba(255, 122, 122, 0.6))')
    .on('mouseover', function (event, d) {
      d3.select(this).attr('r', d.radius + 1).style('filter', 'drop-shadow(0 0 10px rgba(255, 122, 122, 0.9))');
    })
    .on('mouseout', function (event, d) {
      d3.select(this).attr('r', d.radius).style('filter', 'drop-shadow(0 0 6px rgba(255, 122, 122, 0.6))');
    });

  // 绘制标签
  const labels = group
    .append('g')
    .attr('class', 'labels')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('transform', (d) => `translate(${d.x},${d.y - d.radius - labelOffsetY})`);

  labels
    .append('rect')
    .attr('x', -35)
    .attr('y', -8)
    .attr('width', 70)
    .attr('height', 16)
    .attr('rx', 8)
    .attr('fill', 'rgba(0, 0, 0, 0.75)')
    .attr('stroke', 'rgba(255, 255, 255, 0.3)')
    .attr('stroke-width', 1);

  labels
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', 5)
    .attr('fill', '#ffffff')
    .attr('font-size', 11)
    .attr('font-weight', 600)
    .text((d) => `${d.index + 1}. ${d.name}`);

  // 不再需要 simulation，因为位置已经固定
  simulation = null;
};

onMounted(() => {
  updateSize();
  if ('ResizeObserver' in window && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateSize();
      drawGraph();
    });
    resizeObserver.observe(containerRef.value);
  } else {
    window.addEventListener('resize', updateSize);
  }
  drawGraph();
});

onBeforeUnmount(() => {
  if (simulation) {
    simulation.stop();
  }
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value);
    resizeObserver.disconnect();
  } else {
    window.removeEventListener('resize', updateSize);
  }
});

watch(
  [mode, () => size.value.width, () => size.value.height, () => routeCities.value.join('|')],
  () => {
    drawGraph();
  },
  { immediate: true }
);
</script>

<style scoped>
.graph-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 14px;
  background: radial-gradient(circle at top, rgba(79, 165, 255, 0.25), rgba(5, 9, 33, 0.95));
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 40px rgba(12, 251, 255, 0.08);
}

.graph-panel svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>