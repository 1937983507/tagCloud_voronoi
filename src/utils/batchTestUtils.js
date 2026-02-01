/**
 * 批量测试工具函数
 */

import * as turf from '@turf/turf';
import { loadGeoJson } from './geojsonLoader';
import { normalizeCityName } from './normalizeCityName';
import { getCityCoordinates, getAllCityNames } from './cityCoordinates';

/**
 * 密集化折线的函数
 */
export function densifyPath(path, segmentLength, amapGlobal) {
  if (!path || path.length === 0) {
    console.warn('[batchTestUtils] densifyPath: 路径为空');
    return [];
  }
  
  const densifiedPath = [];
  let accumulatedDistance = 0;
  
  // 安全获取第一个点的坐标
  let firstPoint = path[0];
  let lng0, lat0;
  if (Array.isArray(firstPoint)) {
    lng0 = firstPoint[0];
    lat0 = firstPoint[1];
  } else if (firstPoint && typeof firstPoint === 'object') {
    lng0 = typeof firstPoint.getLng === 'function' ? firstPoint.getLng() : firstPoint.lng;
    lat0 = typeof firstPoint.getLat === 'function' ? firstPoint.getLat() : firstPoint.lat;
  } else {
    console.warn('[batchTestUtils] densifyPath: 第一个点格式无效', firstPoint);
    return [];
  }
  
  if (typeof lng0 !== 'number' || typeof lat0 !== 'number' || !isFinite(lng0) || !isFinite(lat0)) {
    console.warn('[batchTestUtils] densifyPath: 第一个点坐标无效', { lng0, lat0 });
    return [];
  }
  
  let currentPoint = [lng0, lat0];
  densifiedPath.push(currentPoint);

  for (let i = 1; i < path.length; i++) {
    const start = currentPoint;
    
    // 安全获取当前点的坐标
    let point = path[i];
    let lng, lat;
    if (Array.isArray(point)) {
      lng = point[0];
      lat = point[1];
    } else if (point && typeof point === 'object') {
      lng = typeof point.getLng === 'function' ? point.getLng() : point.lng;
      lat = typeof point.getLat === 'function' ? point.getLat() : point.lat;
    } else {
      console.warn('[batchTestUtils] densifyPath: 跳过无效点', point);
      continue;
    }
    
    if (typeof lng !== 'number' || typeof lat !== 'number' || !isFinite(lng) || !isFinite(lat)) {
      console.warn('[batchTestUtils] densifyPath: 跳过坐标无效的点', { lng, lat });
      continue;
    }
    
    const end = [lng, lat];
    const distance = amapGlobal.GeometryUtil.distance(start, end);
    
    if (!isFinite(distance) || distance <= 0) {
      continue;
    }
    
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
}

/**
 * 获得折线经过的城市名
 */
export async function getAdministrativeRegions(path) {
  const administrativeRegions = new Set();
  try {
    const geoData = await loadGeoJson();
    if (!geoData || !geoData.features) {
      console.warn('geojson数据未加载', geoData);
      return administrativeRegions;
    }

    path.forEach(coord => {
      // 验证坐标格式：确保是有效的 [经度, 纬度] 数组
      let lng, lat;
      
      if (Array.isArray(coord)) {
        // 如果是数组格式 [lng, lat]
        lng = coord[0];
        lat = coord[1];
      } else if (coord && typeof coord === 'object') {
        // 如果是对象格式 {lng: ..., lat: ...}
        lng = coord.lng;
        lat = coord.lat;
      } else {
        // 无效格式，跳过
        console.warn('[batchTestUtils] 无效的坐标格式:', coord);
        return;
      }
      
      // 验证坐标值是否为有效数字
      if (typeof lng !== 'number' || typeof lat !== 'number' || 
          !isFinite(lng) || !isFinite(lat)) {
        console.warn('[batchTestUtils] 坐标值不是有效数字:', { lng, lat });
        return;
      }
      
      try {
        const point = turf.point([lng, lat]);
        geoData.features.forEach(feature => {
          try {
            if (turf.booleanPointInPolygon(point, feature)) {
              const cityName = feature.properties?.shi || feature.properties?.name;
              if (cityName) {
                administrativeRegions.add(cityName);
              }
            }
          } catch (featureError) {
            // 跳过有问题的feature
            console.warn('[batchTestUtils] 处理feature失败:', featureError);
          }
        });
      } catch (pointError) {
        console.warn('[batchTestUtils] 创建点失败:', pointError, { lng, lat });
      }
    });
  } catch (error) {
    console.error('[batchTestUtils] 获取城市边界失败', error);
  }

  return administrativeRegions;
}

/**
 * 根据起点和终点坐标获取驾车路径及经过的城市列表
 * @param {Object} amapGlobal - 高德地图全局对象
 * @param {[number, number]} startCoord - 起点坐标 [经度, 纬度]
 * @param {[number, number]} endCoord - 终点坐标 [经度, 纬度]
 * @returns {Promise<{path: Array, cityList: Array}>} - 路径和城市列表
 */
export async function getRouteAndCities(amapGlobal, startCoord, endCoord) {
  return new Promise((resolve, reject) => {
    try {
      const driving = new amapGlobal.Driving({
        policy: amapGlobal.DrivingPolicy.LEAST_FEE,
        map: null, // 不显示在地图上
      });

      driving.search(
        new amapGlobal.LngLat(startCoord[0], startCoord[1]),
        new amapGlobal.LngLat(endCoord[0], endCoord[1]),
        (status, result) => {
          if (status === 'complete' && result.routes && result.routes.length > 0) {
            const route = result.routes[0];
            const path = [];
            
            // 提取路径点
            route.steps.forEach(step => {
              if (step.path && step.path.length > 0) {
                step.path.forEach(point => {
                  // 处理LngLat对象或普通对象
                  const lng = typeof point.getLng === 'function' ? point.getLng() : point.lng;
                  const lat = typeof point.getLat === 'function' ? point.getLat() : point.lat;
                  path.push({
                    lng: lng,
                    lat: lat
                  });
                });
              }
            });

            // 密集化路径
            const densifiedPath = densifyPath(path, 5000, amapGlobal);
            
            // densifyPath 返回的是 [lng, lat] 格式的数组，直接使用
            // 但需要验证并过滤无效点
            const validPath = densifiedPath.filter(p => {
              if (!Array.isArray(p) || p.length < 2) {
                return false;
              }
              const lng = p[0];
              const lat = p[1];
              return typeof lng === 'number' && typeof lat === 'number' && 
                     isFinite(lng) && isFinite(lat);
            });
            
            // 获取经过的城市
            getAdministrativeRegions(validPath).then(citySet => {
              const cityList = Array.from(citySet);
              resolve({
                path: densifiedPath,
                cityList: cityList
              });
            }).catch(err => {
              reject(err);
            });
          } else {
            reject(new Error('路径规划失败: ' + (result.info || '未知错误')));
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 根据城市名获取坐标并规划路径
 * @param {Object} amapGlobal - 高德地图全局对象
 * @param {string} startCity - 起点城市名
 * @param {string} endCity - 终点城市名
 * @returns {Promise<{path: Array, cityList: Array, startCity: string, endCity: string}>}
 */
export async function getRouteByCityNames(amapGlobal, startCity, endCity) {
  const startCoord = getCityCoordinates(startCity);
  const endCoord = getCityCoordinates(endCity);

  if (!startCoord) {
    throw new Error(`起点城市 "${startCity}" 的坐标不存在`);
  }
  if (!endCoord) {
    throw new Error(`终点城市 "${endCity}" 的坐标不存在`);
  }

  const result = await getRouteAndCities(amapGlobal, startCoord, endCoord);
  return {
    ...result,
    startCity,
    endCity
  };
}

/**
 * 随机生成n个起点与终点对
 * @param {number} count - 需要生成的对数
 * @returns {Array<{startCity: string, endCity: string}>} - 起点终点对数组
 */
export function generateRandomCityPairs(count) {
  const allCities = getAllCityNames();
  const pairs = [];
  
  for (let i = 0; i < count; i++) {
    const startIndex = Math.floor(Math.random() * allCities.length);
    let endIndex = Math.floor(Math.random() * allCities.length);
    
    // 确保起点和终点不同
    while (endIndex === startIndex) {
      endIndex = Math.floor(Math.random() * allCities.length);
    }
    
    pairs.push({
      startCity: allCities[startIndex],
      endCity: allCities[endIndex]
    });
  }
  
  return pairs;
}

/**
 * 筛选城市序列（根据城市数量）
 * @param {Array<{cityList: Array, ...other}>} sequences - 城市序列数组
 * @param {number|null} minCityCount - 最小城市数量（null表示不筛选）
 * @param {number|null} maxCityCount - 最大城市数量（null表示不筛选）
 * @returns {Array} - 筛选后的序列数组
 */
export function filterSequencesByCityCount(sequences, minCityCount = null, maxCityCount = null) {
  if (minCityCount === null && maxCityCount === null) {
    return sequences;
  }
  
  return sequences.filter(seq => {
    const cityCount = seq.cityList ? seq.cityList.length : 0;
    if (minCityCount !== null && cityCount < minCityCount) {
      return false;
    }
    if (maxCityCount !== null && cityCount > maxCityCount) {
      return false;
    }
    return true;
  });
}

