<template>
  <div class="map-wrapper">
    <header class="map-head">
      <el-dropdown 
        trigger="click" 
        @command="handleDrawCommand"
      >
        <span
          class="el-dropdown-link dropdown-btn"
          data-intro-target="drawLineTrigger"
        >
          绘制折线
          <el-icon><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="drawAMAPLine" :disabled="poiStore.hasDrawing">手绘折线</el-dropdown-item>
            <el-dropdown-item command="drawAMAPMarker" :disabled="poiStore.hasDrawing">自定义始末点</el-dropdown-item>
            <el-dropdown-item 
              divided 
              command="clearDrawing"
              :disabled="!poiStore.hasDrawing"
            >
              清除绘制
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown @command="changeMapType">
        <span class="el-dropdown-link dropdown-btn">
          地图切换
          <el-icon><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="normal">普通地图</el-dropdown-item>
            <el-dropdown-item command="satellite">卫星地图</el-dropdown-item>
            <el-dropdown-item command="roadnet">路网地图</el-dropdown-item>
            <el-dropdown-item command="traffic">交通地图</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button text @click="openSearch = true">检索定位</el-button>
    </header>
    <div
      ref="mapRef"
      class="map-canvas"
      data-intro-target="mapCanvas"
    ></div>
    <el-dialog v-model="openSearch" title="搜索位置、公交站、地铁站" width="360px">
      <el-input v-model="searchKeyword" placeholder="请输入关键词" @keyup.enter="searchPlace">
        <template #append>
          <el-button @click="searchPlace">搜索</el-button>
        </template>
      </el-input>
    </el-dialog>
  </div>
</template>

<script setup>
import { ArrowDown } from '@element-plus/icons-vue';
import { usePoiStore } from '@/stores/poiStore';
import AMapLoader from '@amap/amap-jsapi-loader';
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import * as turf from '@turf/turf';
import { loadGeoJson } from '@/utils/geojsonLoader';
import { normalizeCityName } from '@/utils/normalizeCityName';

const poiStore = usePoiStore();
const mapRef = ref(null);
const openSearch = ref(false);
const searchKeyword = ref('');

let mapInstance = null;
let mapLayers = {};
let autoComplete = null;
let placeSearch = null;
let amapGlobal = null;
let mouseTool = null;
let drawEditor = null;
let contextMenu = null;
let contextMenuPosition = null;
let startPoint = null;
let endPoint = null;
let heatmapLayer = null;
let massLayer = null;
let MASS_STYLES = [];

// 密集化折线的函数
const densifyPath = (path, segmentLength) => {
  const densifiedPath = [];
  let accumulatedDistance = 0;
  let currentPoint = [path[0].lng, path[0].lat];
  densifiedPath.push(currentPoint);

  for (let i = 1; i < path.length; i++) {
    const start = currentPoint;
    const end = [path[i].lng, path[i].lat];
    const distance = amapGlobal.GeometryUtil.distance(start, end);
    accumulatedDistance += distance;

    while (accumulatedDistance >= segmentLength) {
      const fraction = (segmentLength - (accumulatedDistance - distance)) / distance;
      currentPoint = [
        start[0] + fraction * (end[0] - start[0]),
        start[1] + fraction * (end[1] - start[1])
      ];
      densifiedPath.push(currentPoint);
      accumulatedDistance -= segmentLength;
    }

    currentPoint = end;
  }

  if (accumulatedDistance > 0) {
    densifiedPath.push(currentPoint);
  }

  return densifiedPath;
};

// 获得折线经过的城市名
const getAdministrativeRegions = async (path) => {
  const administrativeRegions = new Set();
  try {
    const geoData = await loadGeoJson();
    if (!geoData || !geoData.features) {
      console.warn('geojson数据未加载', geoData);
      return administrativeRegions;
    }

    path.forEach(coord => {
      const point = turf.point(coord);
      geoData.features.forEach(feature => {
        if (turf.booleanPointInPolygon(point, feature)) {
          const cityName = feature.properties?.shi || feature.properties?.name;
          if (cityName) {
            administrativeRegions.add(cityName);
          }
        }
      });
    });
  } catch (error) {
    console.error('[PoiMap] 获取城市边界失败', error);
  }

  return administrativeRegions;
};

// 根据城市名筛选POI数据
const filterPOIByCities = (allPOI, administrativeRegions) => {
  const normalizedRegions = new Set();
  administrativeRegions.forEach(name => {
    if (name) {
      normalizedRegions.add(name);
      normalizedRegions.add(normalizeCityName(name));
    }
  });

  const filtered = allPOI.filter(poi => {
    const cityName = poi.city || '';
    return normalizedRegions.has(cityName) || normalizedRegions.has(normalizeCityName(cityName));
  });

  if (!filtered.length) {
    console.warn('[PoiMap] 未匹配到任何 POI，已尝试使用规范化规则：', Array.from(administrativeRegions));
  }

  return filtered;
};

// 整编筛选完成的数据
const compileData = (selectedPOI) => {
  const data = {};
  if (!selectedPOI.length) {
    return data;
  }

  const rankInChinaList = selectedPOI.map(poi => parseInt(poi.rankInChina));
  const minRank = Math.min(...rankInChinaList);
  const maxRank = Math.max(...rankInChinaList);

  function rankToSize(rank) {
    const minSize = 10;
    const maxSize = 45;
    const logMinRank = Math.log(minRank);
    const logMaxRank = Math.log(maxRank);
    const logRank = Math.log(rank);
    return minSize + (maxSize - minSize) * (logMaxRank - logRank) / (logMaxRank - logMinRank);
  }

  selectedPOI.forEach(poi => {
    const { pname, name_en, city, rankInChina } = poi;
    if (!data[city]) {
      data[city] = [];
    }
    // 根据语言设置选择使用中文名或英文名
    const text = poiStore.fontSettings.language === 'en' && name_en ? name_en : pname;
    // 添加city字段，确保每个POI都明确标识所属城市（解决重名景点问题）
    data[city].push({ text: text, rankInChina, city: city });
  });

  return data;
};

// 获取并整编POI数据的主函数
const getPOIMain = async () => {
  console.info('[PoiMap] 开始收集POI数据', {
    hasUserDrawn: !!poiStore.userDrawObj,
    hasRoute: !!poiStore.route,
  });

  await poiStore.loadDefaultData();
  console.info('[PoiMap] POI数据准备完成，共', poiStore.allPOI.length, '条');

  let objPath;
  if (poiStore.userDrawObj) {
    objPath = poiStore.userDrawObj.getPath();
  } else if (poiStore.route) {
    objPath = poiStore.route.getRoute();
  } else {
    console.warn('[PoiMap] 没有有效折线对象', {
      userDrawObj: poiStore.userDrawObj,
      route: poiStore.route,
    });
    return [[], {}];
  }

  const path = densifyPath(objPath, 5000);
  console.info('[PoiMap] 折线路径点数量', path.length);

  const administrativeRegions = await getAdministrativeRegions(path);
  console.info('[PoiMap] 折线经过的城市数量', administrativeRegions.size, Array.from(administrativeRegions));

  const cityOrder = Array.from(administrativeRegions);
  const selectedPOI = filterPOIByCities(poiStore.allPOI, administrativeRegions);
  console.info('[PoiMap] 筛选到的POI数量', selectedPOI.length);

  const data = compileData(selectedPOI);
  console.info('[PoiMap] 编译完成的城市数', Object.keys(data));
  
  poiStore.setCityOrderAndData(cityOrder, data);
  console.info('[PoiMap] 已更新 store.cityOrder 和 compiledData');

  return [cityOrder, data];
};

const loadMap = async () => {
  // 确保地图容器已经准备好
  if (!mapRef.value) {
    console.error('地图容器未准备好');
    return;
  }
  
  try {
    // 先初始化地图，不等待数据加载完成
    amapGlobal = await AMapLoader.load({
      key: '80838eddfb922202b289fd1ad6fa4e58',
      version: '2.0',
      plugins: [
        'AMap.ToolBar',
        'AMap.Scale',
        'AMap.AutoComplete',
        'AMap.PlaceSearch',
        'AMap.TileLayer.Satellite',
        'AMap.TileLayer.RoadNet',
        'AMap.TileLayer.Traffic',
        'AMap.HeatMap',
        'AMap.MouseTool',
        'AMap.GeometryUtil',
        'AMap.MassMarks',
        'AMap.PolyEditor',
        'AMap.DragRoute',
        'AMap.Driving',
        'AMap.ContextMenu',
      ],
    });

    mapInstance = new amapGlobal.Map(mapRef.value, {
      zoom: 5,
      viewMode: '2D',
      center: [108.95, 34.27], // 设置初始中心点（中国中心）
    });
    
    // 地图初始化成功后，异步加载数据（不阻塞）
    poiStore.loadDefaultData().catch(err => {
      console.error('加载POI数据失败:', err);
    });
    
    // 异步预加载geojson数据（不阻塞地图显示）
    loadGeoJson().catch(err => {
      console.warn('预加载geojson数据失败，将在需要时重试:', err);
    });

    mapLayers = {
      satellite: new amapGlobal.TileLayer.Satellite(),
      roadnet: new amapGlobal.TileLayer.RoadNet(),
      traffic: new amapGlobal.TileLayer.Traffic(),
    };
    Object.values(mapLayers).forEach((layer) => {
      mapInstance.add(layer);
      layer.hide();
    });

    mapInstance.addControl(new amapGlobal.ToolBar());
    mapInstance.addControl(new amapGlobal.Scale());

    autoComplete = new amapGlobal.AutoComplete();
    placeSearch = new amapGlobal.PlaceSearch({
      map: mapInstance,
    });
    autoComplete.on('select', (event) => {
      placeSearch.setCity(event.poi.adcode);
      placeSearch.search(event.poi.name);
      openSearch.value = false;
    });

    heatmapLayer = new amapGlobal.HeatMap(mapInstance, {
      radius: 15,
      opacity: [0, 0.15],
    });

    MASS_STYLES = [
      {
        url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB2aWV3Qm94PSIwIDAgOCA4IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxjaXJjbGUgY3g9IjQiIGN5PSI0IiByPSIzLjUiIGZpbGw9IiM0NWM0ZjkiLz48L3N2Zz4=',
        anchor: new amapGlobal.Pixel(4, 4),
        size: new amapGlobal.Size(8, 8),
      },
    ];

    massLayer = new amapGlobal.MassMarks([], {
      zIndex: 111,
      cursor: 'pointer',
      alwaysRender: true,
      style: MASS_STYLES,
    });
    massLayer.setMap(mapInstance);

    // 创建右键菜单
    contextMenu = new amapGlobal.ContextMenu();
    contextMenu.addItem("确定起点", function (e) {
      const temppoint = contextMenuPosition;
      startPoint = new amapGlobal.LngLat(temppoint.lng, temppoint.lat);
      if (poiStore.startMarker) {
        poiStore.startMarker.setPosition(startPoint);
      } else {
        const marker = new amapGlobal.Marker({
          position: startPoint,
          map: mapInstance,
          anchor: "bottom-center",
          icon: new amapGlobal.Icon({
            image: "/img/start.png",
            size: new amapGlobal.Size(18, 30),
            imageSize: new amapGlobal.Size(18, 30)
          }),
        });
        poiStore.setStartMarker(marker);
      }
      contextMenu.hide();
      if (startPoint && endPoint) {
        planRoute(startPoint, endPoint);
      }
    }, 0);
    
    contextMenu.addItem("确定终点", function (e) {
      const temppoint = contextMenuPosition;
      endPoint = new amapGlobal.LngLat(temppoint.lng, temppoint.lat);
      if (poiStore.endMarker) {
        poiStore.endMarker.setPosition(endPoint);
      } else {
        const marker = new amapGlobal.Marker({
          position: endPoint,
          map: mapInstance,
          anchor: "bottom-center",
          icon: new amapGlobal.Icon({
            image: "/img/end.png",
            size: new amapGlobal.Size(18, 30),
            imageSize: new amapGlobal.Size(18, 30)
          }),
        });
        poiStore.setEndMarker(marker);
      }
      contextMenu.hide();
      if (startPoint && endPoint) {
        planRoute(startPoint, endPoint);
      }
    }, 1);

    mapInstance.on('rightclick', function (e) {
      contextMenuPosition = e.lnglat;
      contextMenu.open(mapInstance, e.lnglat);
    });

    mapInstance.on('moveend', updateLayerByView);
    mapInstance.on('zoomend', updateLayerByView);

    updateLayerByView();
  } catch (error) {
    console.error('地图初始化失败:', error);
  }
};

const buildHeatmapData = () => {
  if (!mapInstance) return [];
  const bounds = mapInstance.getBounds();
  const boundPOIs = poiStore.allPOI.filter((poi) => 
    bounds.contains([poi.X_gcj02, poi.Y_gcj02])
  );
  return boundPOIs
    .filter((_, index) => index % 10 === 0)
    .map((poi) => ({
      lng: poi.X_gcj02,
      lat: poi.Y_gcj02,
      count: 41960 - (poi.rankInChina || 0),
    }));
};

const buildMassPoints = () => {
  if (!mapInstance) return [];
  const bounds = mapInstance.getBounds();
  const boundPOIs = poiStore.allPOI.filter((poi) => 
    bounds.contains([poi.X_gcj02, poi.Y_gcj02])
  );
  return boundPOIs.map((poi) => ({
    lnglat: [poi.X_gcj02, poi.Y_gcj02],
    pname: poi.pname,
    id: poi.pid,
    style: 0,
  }));
};

const updateLayerByView = () => {
  if (!mapInstance || !heatmapLayer || !massLayer) return;
  const bounds = mapInstance.getBounds();
  const boundPOIs = poiStore.allPOI.filter((poi) => 
    bounds.contains([poi.X_gcj02, poi.Y_gcj02])
  );
  const boundCount = boundPOIs.length;
  
  if (boundCount > 500) {
    massLayer.hide();
    const heatmapData = buildHeatmapData();
    heatmapLayer.setDataSet({ data: heatmapData });
    heatmapLayer.show();
  } else {
    heatmapLayer.hide();
    const massData = buildMassPoints();
    massLayer.setData(massData);
    massLayer.show();
  }
};

const resetDrawing = () => {
  if (drawEditor) {
    drawEditor.close();
    drawEditor = null;
  }
  if (poiStore.userDrawObj?.setMap) {
    poiStore.userDrawObj.setMap(null);
  }
  poiStore.setUserDrawObj(null);
  if (mouseTool) {
    mouseTool.close(false);
    mouseTool = null;
  }
};

const clearDrawing = () => {
  if (!amapGlobal || !mapInstance) return;
  resetDrawing();
  if (poiStore.route) {
    poiStore.route.destroy();
    poiStore.setRoute(null);
  }
  if (poiStore.startMarker) {
    mapInstance.remove(poiStore.startMarker);
    poiStore.setStartMarker(null);
  }
  if (poiStore.endMarker) {
    mapInstance.remove(poiStore.endMarker);
    poiStore.setEndMarker(null);
  }
  startPoint = null;
  endPoint = null;
  poiStore.clearDrawing();
  updateLayerByView();
};

const handleDrawCommand = (command) => {
  if (!amapGlobal || !mapInstance) return;
  
  if (poiStore.hasDrawing && command !== 'clearDrawing') {
    return;
  }
  
  resetDrawing();
  if (command === 'clearDrawing') {
    clearDrawing();
    return;
  }
  
  if (command === 'drawAMAPLine') {
    drawAMAPLineFun();
  } else if (command === 'drawAMAPMarker') {
    // 自定义始末点功能已通过右键菜单实现
    // 这里只需要提示用户
    console.log('请在地图上右键点击选择起点和终点');
  }
};

const drawAMAPLineFun = () => {
  mouseTool = new amapGlobal.MouseTool(mapInstance);
  mouseTool.on('draw', async function (e) {
    const drawObj = e.obj;
    poiStore.setUserDrawObj(drawObj);
    mouseTool.close(false);
    
    drawEditor = new amapGlobal.PolyEditor(mapInstance, drawObj);
    drawEditor.open();
    
    poiStore.setHasDrawing(true);
    
    // 绘制完成后自动处理数据
    await getPOIMain();
  });
  
  mouseTool.polyline({
    strokeColor: '#FF33FF',
    strokeWeight: 2,
    lineJoin: 'round'
  });
};

const planRoute = async (start, end) => {
  const path = [start, end];
  if (poiStore.route) {
    poiStore.route.destroy();
  }
  const route = new amapGlobal.DragRoute(mapInstance, path, amapGlobal.DrivingPolicy.LEAST_FEE);
  route.search();
  poiStore.setRoute(route);
  poiStore.setHasDrawing(true);
  
  // 路径规划完成后自动处理数据
  route.on('complete', async () => {
    await getPOIMain();
  });
};

const changeMapType = (type) => {
  if (!mapInstance) return;
  Object.entries(mapLayers).forEach(([name, layer]) => {
    if (type === name) layer.show();
    else layer.hide();
  });
  if (type === 'normal') {
    Object.values(mapLayers).forEach((layer) => layer.hide());
  }
};

const searchPlace = () => {
  if (!searchKeyword.value || !placeSearch) return;
  placeSearch.search(searchKeyword.value);
  openSearch.value = false;
};

// 暴露getPOIMain函数给外部调用
defineExpose({
  getPOIMain,
  clearDrawing,
});

onMounted(async () => {
  // 等待 DOM 渲染完成
  await nextTick();
  // 确保地图容器已经存在
  if (mapRef.value) {
    await loadMap();
  } else {
    console.error('地图容器未找到');
  }
});

watch(
  () => poiStore.allPOI,
  () => {
    updateLayerByView();
  },
  { deep: true },
);

// 监听语言变化，自动重新编译数据
watch(
  () => poiStore.fontSettings.language,
  async (newLanguage, oldLanguage) => {
    // 只有在语言真正变化且已有绘制路线时才重新编译
    if (oldLanguage !== undefined && newLanguage !== oldLanguage && poiStore.hasDrawing) {
      console.info('[PoiMap] 语言变化，重新编译数据', { oldLanguage, newLanguage });
      await getPOIMain();
    }
  },
);

onBeforeUnmount(() => {
  resetDrawing();
  if (mapInstance) {
    mapInstance.destroy();
  }
  mapInstance = null;
});
</script>

<style scoped>
.map-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.map-head {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.el-dropdown-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #e3e6f4;
  cursor: pointer;
}

.dropdown-btn {
  color: #1f2333 !important;
  background: #fff !important;
  border: 1px solid #dcdfe6;
}

.dropdown-btn:hover {
  background: #f5f7fa !important;
  border-color: #c0c4cc;
}

.map-canvas {
  width: 100%;
  flex: 1 1 auto;
  min-height: 200px;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  position: relative;
  background-color: #f5f5f5;
}
</style>

