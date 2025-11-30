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

// 使用D3力导向图绘制路径城市
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

  // 创建节点
  const nodes = cities.map((city, index) => {
    const match = poiStore.allPOI.find(
      (poi) => normalizeCityName(poi.city) === normalizeCityName(city)
    );
    return {
      id: `${city}-${index}`,
      name: city,
      index,
      lon: match?.X_gcj02 ?? 105 + (index % 6) * 2,
      lat: match?.Y_gcj02 ?? 30 + (index % 6) * 1.5,
      radius: 6,
    };
  });

  // 创建边（按顺序连接）
  const links = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    links.push({ source: nodes[i].id, target: nodes[i + 1].id });
  }

  // 计算地理坐标范围
  const lonExtent = d3.extent(nodes, (d) => d.lon);
  const latExtent = d3.extent(nodes, (d) => d.lat);
  if (lonExtent[0] === lonExtent[1]) {
    lonExtent[0] -= 1;
    lonExtent[1] += 1;
  }
  if (latExtent[0] === latExtent[1]) {
    latExtent[0] -= 1;
    latExtent[1] += 1;
  }

  const padding = 40;
  const xScale = d3
    .scaleLinear()
    .domain(lonExtent)
    .range([padding, width - padding]);
  const yScale = d3
    .scaleLinear()
    .domain(latExtent)
    .range([height - padding, padding]);

  // 初始化节点位置（基于地理坐标）
  nodes.forEach((node) => {
    node.x = xScale(node.lon);
    node.y = yScale(node.lat);
    node.vx = 0;
    node.vy = 0;
  });

  // 创建力导向图（使用较弱的力，保持地理布局）
  simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(80)
        .strength(0.8)
    )
    .force('charge', d3.forceManyBody().strength(-300))
    .force('collision', d3.forceCollide().radius((d) => d.radius + 5))
    .alpha(0.5)
    .alphaDecay(0.1)
    .velocityDecay(0.6);

  // 创建渐变
  const gradientId = `route-gradient-${Date.now()}`;
  const defs = group.append('defs');
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0%')
    .attr('x2', '100%')
    .attr('y1', '0%')
    .attr('y2', '100%');
  gradient.append('stop').attr('offset', '0%').attr('stop-color', '#4b9cff');
  gradient.append('stop').attr('offset', '100%').attr('stop-color', '#ffe873');

  // 绘制边
  const link = group
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('stroke', `url(#${gradientId})`)
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
    .append('g');

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

  // 更新位置（添加边界约束）
  const routeMinX = padding;
  const routeMaxX = width - padding;
  const routeMinY = padding;
  const routeMaxY = height - padding;

  simulation.on('tick', () => {
    // 约束节点在画布内
    nodes.forEach((d) => {
      const radius = d.radius || 6;
      d.x = Math.max(routeMinX + radius, Math.min(routeMaxX - radius, d.x));
      d.y = Math.max(routeMinY + radius, Math.min(routeMaxY - radius, d.y));
    });

    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);

    labels.attr('transform', (d) => `translate(${d.x},${d.y - d.radius - 15})`);
  });
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