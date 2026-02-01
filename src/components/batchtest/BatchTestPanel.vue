<!--
  批量测试面板 - Voronoi 版本（简化版）
  
  由于 Voronoi 渲染过程非常复杂（包含20次迭代优化），完整的批量测试会非常耗时。
  这个简化版本使用模拟数据进行快速测试，主要用于演示功能。
  
  如需完整测试，请在 TagCloudCanvas 中手动运行生成标签云，然后查看控制台输出的指标。
-->
<template>
  <div class="batch-test-panel">
    <div class="panel-header">
      <h2>批量测试</h2>
        <el-alert
        title="功能说明"
        type="info"
        :closable="false"
        style="margin-top: 12px;"
      >
        <p style="margin: 0; font-size: 13px;">
          批量测试将对每个测试用例执行完整的生成加权维诺图（20轮次迭代优化）+ 逐一生成各子空间词云流程，<br/>
          并记录所有指标（序列保持度、可读性、面积误差率等）。<br/>
          由于每个用例都需要完整的渲染流程，批量测试会非常耗时，请耐心等待。
        </p>
      </el-alert>
    </div>
    
    <el-tabs v-model="activeTab" class="test-tabs" style="margin-top: 16px;">
      <!-- 手动输入模式 -->
      <el-tab-pane label="手动输入" name="manual">
        <div class="tab-content">
          <div class="input-section">
            <label>城市节点（用逗号或换行分隔）：</label>
            <el-input
              v-model="manualCityInput"
              type="textarea"
              :rows="4"
              placeholder="例如：北京,上海,广州,深圳 或 北京，上海，广州，深圳"
              class="city-input"
            />
            <el-button 
              type="primary" 
              @click="handleManualInput"
              :disabled="!manualCityInput.trim()"
              style="margin-top: 12px;"
            >
              添加为测试用例
            </el-button>
          </div>
          
          <div v-if="manualTestCases.length > 0" class="test-cases-section">
            <h3>已添加的测试用例（{{ manualTestCases.length }}个）：</h3>
            <div class="test-case-list">
              <div 
                v-for="(testCase, index) in manualTestCases" 
                :key="index"
                class="test-case-item"
              >
                <span class="case-number">{{ index + 1 }}</span>
                <span class="case-cities">{{ testCase.cityList.join(' → ') }}</span>
                <el-button 
                  type="danger" 
                  size="small" 
                  text
                  @click="removeManualTestCase(index)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
      
      <!-- 自动生成模式 -->
      <el-tab-pane label="自动生成" name="auto">
        <div class="tab-content">
          <div class="input-section">
            <div class="input-row">
              <label>测试用例数量：</label>
              <el-input-number
                v-model="testCaseCount"
                :min="1"
                :step="1"
                style="width: 150px;"
              />
            </div>
            
            <el-button 
              type="primary" 
              @click="handleGenerateSequences"
              :disabled="testCaseCount < 1 || generatingSequences"
              :loading="generatingSequences"
              style="margin-top: 16px;"
            >
              {{ generatingSequences ? '生成中...' : '生成序列' }}
            </el-button>
          </div>
          
          <div v-if="autoTestCases.length > 0" class="test-cases-section">
            <h3>生成的测试用例（{{ autoTestCases.length }}个）：</h3>
            <div class="test-case-list">
              <div 
                v-for="(testCase, index) in autoTestCases" 
                :key="index"
                class="test-case-item"
              >
                <span class="case-number">{{ index + 1 }}</span>
                <span class="case-cities">
                  {{ testCase.startCity }} → {{ testCase.endCity }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
    
    <!-- 测试控制区域 -->
    <div class="test-control-section">
      <div class="test-info">
        <span>总测试用例数：{{ totalTestCases }}</span>
        <span v-if="testing" class="test-progress">
          当前进度：{{ currentTestIndex }} / {{ totalTestCases }}
        </span>
      </div>
      <el-progress 
        v-if="testing && totalTestCases > 0"
        :percentage="Math.round((currentTestIndex / totalTestCases) * 100)"
        :stroke-width="8"
        style="margin-top: 12px; margin-bottom: 16px;"
      />
      
      <div class="test-buttons">
        <el-button 
          type="primary" 
          @click="handleStartTest"
          :disabled="totalTestCases === 0 || testing"
          :loading="testing"
        >
          {{ testing ? '测试中...' : '开始测试' }}
        </el-button>
        <el-button 
          @click="handleStopTest"
          :disabled="!testing"
        >
          停止
        </el-button>
        <el-button 
          @click="handleClearResults"
          :disabled="testing || testResults.length === 0"
        >
          清空结果
        </el-button>
        <el-button 
          type="success"
          @click="handleExportResults"
          :disabled="testResults.length === 0"
        >
          导出结果
        </el-button>
      </div>
    </div>
    
    <!-- 测试结果区域 -->
    <div v-if="testResults.length > 0" class="test-results-section">
      <h3>测试结果（{{ testResults.length }}条）：</h3>
      <div class="results-table-wrapper">
        <table class="results-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>城市序列</th>
              <th>城市数</th>
              <th>序列保持度</th>
              <th>可读性</th>
              <th>角度均值(°)</th>
              <th>角度变异系数</th>
              <th>面积-权重相关性</th>
              <th>平均面积误差率</th>
              <th>紧凑性</th>
              <th>语义信息密度</th>
              <th>运行效率(ms)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(result, index) in testResults" :key="index">
              <td>{{ index + 1 }}</td>
              <td class="sequence-cell">{{ result.linearSequence }}</td>
              <td>{{ result.cityNodeCount }}</td>
              <td>{{ result.sequenceContinuity !== undefined ? result.sequenceContinuity.toFixed(3) : '-' }}</td>
              <td>{{ result.readability !== undefined ? result.readability.toFixed(3) : '-' }}</td>
              <td>{{ result.angleMean !== undefined ? result.angleMean.toFixed(2) : '-' }}</td>
              <td>{{ result.angleCoefficientOfVariation !== undefined ? (result.angleCoefficientOfVariation / 100).toFixed(3) : '-' }}</td>
              <td>{{ result.areaWeightCorrelation !== undefined ? result.areaWeightCorrelation.toFixed(4) : '-' }}</td>
              <td>{{ result.averageAreaErrorRate !== undefined ? (result.averageAreaErrorRate / 100).toFixed(3) : '-' }}</td>
              <td>{{ result.averageCompactness !== undefined ? result.averageCompactness.toFixed(4) : '-' }}</td>
              <td>{{ result.semanticDensity !== undefined ? result.semanticDensity.toFixed(6) : '-' }}</td>
              <td>{{ result.renderEfficiency !== undefined ? result.renderEfficiency : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePoiStore } from '@/stores/poiStore';
import { 
  getRouteByCityNames, 
  generateRandomCityPairs
} from '@/utils/batchTestUtils';
import { renderVoronoiAndCalculateMetrics } from '@/utils/voronoiRenderer';
import AMapLoader from '@amap/amap-jsapi-loader';

const poiStore = usePoiStore();

// 标签页
const activeTab = ref('manual');

// 手动输入
const manualCityInput = ref('');
const manualTestCases = ref([]);

// 自动生成
const testCaseCount = ref(10);
const autoTestCases = ref([]);
const generatingSequences = ref(false);

// 测试控制
const testing = ref(false);
const shouldStop = ref(false);
const currentTestIndex = ref(0);
const testResults = ref([]);

// 高德地图实例
let amapGlobal = null;

// 总测试用例数
const totalTestCases = computed(() => {
  return manualTestCases.value.length + autoTestCases.value.length;
});

// 初始化高德地图
onMounted(async () => {
  try {
    const AMap = await AMapLoader.load({
      key: '80838eddfb922202b289fd1ad6fa4e58',
      version: '2.0',
      plugins: ['AMap.Driving', 'AMap.GeometryUtil'],
    });
    amapGlobal = AMap;
    console.log('[BatchTestPanel] 高德地图加载成功');
  } catch (error) {
    console.error('[BatchTestPanel] 高德地图加载失败:', error);
    ElMessage.error('地图加载失败，批量测试功能将无法使用');
  }
});

// 手动输入处理
const handleManualInput = () => {
  const input = manualCityInput.value.trim();
  if (!input) return;
  
  const cityList = input
    .split(/[,，\n\r]+/)
    .map(city => city.trim())
    .filter(city => city.length > 0);
  
  if (cityList.length === 0) {
    ElMessage.warning('请输入至少一个城市');
    return;
  }
  
  manualTestCases.value.push({ cityList });
  manualCityInput.value = '';
  ElMessage.success(`已添加测试用例：${cityList.join(' → ')}`);
};

// 删除手动测试用例
const removeManualTestCase = (index) => {
  manualTestCases.value.splice(index, 1);
  ElMessage.info('已删除测试用例');
};

// 生成随机序列
const handleGenerateSequences = async () => {
  generatingSequences.value = true;
  try {
    const pairs = generateRandomCityPairs(testCaseCount.value);
    autoTestCases.value = pairs;
    ElMessage.success(`成功生成 ${pairs.length} 个测试用例`);
  } catch (error) {
    console.error('生成序列失败:', error);
    ElMessage.error('生成序列失败：' + error.message);
  } finally {
    generatingSequences.value = false;
  }
};

// 开始测试
const handleStartTest = async () => {
  if (!amapGlobal) {
    ElMessage.error('高德地图未加载，无法进行测试');
    return;
  }
  
  if (totalTestCases.value === 0) {
    ElMessage.warning('请先添加或生成测试用例');
    return;
  }
  
  // 确认开始测试
  try {
    await ElMessageBox.confirm(
      `即将开始测试 ${totalTestCases.value} 个用例。每个用例将执行完整的生成加权维诺图（20轮次）+ 子空间词云流程，耗时较长。`,
      '确认开始测试',
      {
        confirmButtonText: '开始',
        cancelButtonText: '取消',
        type: 'info',
      }
    );
  } catch {
    return;
  }
  
  // 确保POI数据已加载
  try {
    if (!poiStore.dataLoaded) {
      ElMessage.info('正在加载POI数据...');
      await poiStore.loadDefaultData();
      ElMessage.success('POI数据加载完成');
    }
  } catch (error) {
    ElMessage.error('POI数据加载失败：' + error.message);
    return;
  }
  
  testing.value = true;
  shouldStop.value = false;
  currentTestIndex.value = 0;
  testResults.value = [];
  
  // 合并所有测试用例
  const allCases = [
    ...manualTestCases.value,
    ...autoTestCases.value
  ];
  
  // 逐个执行测试
  for (let i = 0; i < allCases.length; i++) {
    if (shouldStop.value) {
      ElMessage.info('测试已停止');
      break;
    }
    
    currentTestIndex.value = i + 1;
    
    try {
      const result = await executeSingleTest(allCases[i], amapGlobal);
      testResults.value.push(result);
    } catch (error) {
      console.error(`测试用例 ${i + 1} 失败:`, error);
      ElMessage.warning(`测试用例 ${i + 1} 失败：${error.message}`);
    }
  }
  
  testing.value = false;
  ElMessage.success(`测试完成！共完成 ${testResults.value.length} 个用例`);
};

// 编译POI数据（按城市分组）
const compilePOIData = (cityOrder) => {
  const compiledData = {};
  const allPOI = poiStore.allPOI || [];
  
  cityOrder.forEach(city => {
    compiledData[city] = allPOI
      .filter(poi => poi.city === city)
      .map(poi => ({
        text: poi.pname || '',
        rankInChina: poi.rankInChina || 100000
      }));
  });
  
  return compiledData;
};

// 执行单个测试用例
const executeSingleTest = async (testCase, amapGlobal) => {
  const startTime = Date.now();
  
  // 如果是自动生成的用例，需要先获取路径和城市列表
  let cityOrder = testCase.cityList;
  if (!cityOrder && testCase.startCity && testCase.endCity) {
    try {
      const routeResult = await getRouteByCityNames(
        amapGlobal,
        testCase.startCity,
        testCase.endCity
      );
      cityOrder = routeResult.cityList;
    } catch (error) {
      throw new Error(`获取路径失败：${error.message}`);
    }
  }
  
  if (!cityOrder || cityOrder.length === 0) {
    throw new Error('城市列表为空');
  }
  
  const fetchTime = Date.now() - startTime;
  
  // 确保POI数据已加载
  if (!poiStore.dataLoaded) {
    await poiStore.loadDefaultData();
  }
  
  // 编译POI数据
  const compiledData = compilePOIData(cityOrder);
  
  // 执行完整的渲染流程（生成加权维诺图20轮次+子空间词云）
  const renderStartTime = Date.now();
  let metrics = null;
  
  try {
    // 获取真实的画布大小（从 TagCloudCanvas 的 wrapperRef 获取）
    let canvasWidth = 800;
    let canvasHeight = 600;
    
    // 等待 DOM 更新，确保 TagCloudCanvas 已经渲染
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 100)); // 给一点时间让 DOM 完全渲染
    
    try {
      // 优先尝试获取 TagCloudCanvas 的实际画布大小
      const canvasWrapper = document.querySelector('.tagcloud-panel .canvas-wrapper');
      if (canvasWrapper) {
        const rect = canvasWrapper.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvasWidth = Math.floor(rect.width);
          canvasHeight = Math.floor(rect.height);
          console.log(`[批量测试] 获取到真实画布大小: ${canvasWidth}x${canvasHeight}`);
        }
      }
      
      // 如果 wrapper 没有有效大小，尝试从 canvas 元素获取
      if (canvasWidth === 800 && canvasHeight === 600) {
        const voronoiCanvas = document.querySelector('.voronoi-canvas');
        if (voronoiCanvas && voronoiCanvas.width > 0 && voronoiCanvas.height > 0) {
          canvasWidth = voronoiCanvas.width;
          canvasHeight = voronoiCanvas.height;
          console.log(`[批量测试] 从canvas元素获取大小: ${canvasWidth}x${canvasHeight}`);
        }
      }
      
      // 如果还是默认值，给出警告
      if (canvasWidth === 800 && canvasHeight === 600) {
        console.warn(`[批量测试] 无法获取真实画布大小，使用默认值: ${canvasWidth}x${canvasHeight}`);
        console.warn(`[批量测试] 提示：请确保 TagCloudCanvas 已经渲染，或者手动设置画布大小`);
      }
    } catch (error) {
      console.warn(`[批量测试] 获取画布大小失败，使用默认值:`, error);
    }
    
    // 进度回调
    const progressCallback = (stage, current, total) => {
      console.log(`[批量测试] ${stage} (${current}/${total})`);
    };
    
    // 执行渲染并计算指标（使用真实画布大小）
    metrics = await renderVoronoiAndCalculateMetrics(
      cityOrder,
      compiledData,
      canvasWidth,
      canvasHeight,
      poiStore,
      progressCallback
    );
    
    console.log(`[批量测试] 测试用例完成: ${cityOrder.join('-')}`, metrics);
  } catch (error) {
    console.error(`[批量测试] 渲染失败:`, error);
    throw new Error(`渲染失败：${error.message}`);
  }
  
  const renderTime = Date.now() - renderStartTime;
  
  // 返回包含所有指标的结果
  return {
    linearSequence: metrics.linearSequence,
    cityNodeCount: metrics.cityNodeCount,
    fetchTime,
    sequenceContinuity: metrics.sequenceContinuity,
    stillAdjacentCityPairs: metrics.stillAdjacentCityPairs,
    brokenCityPairs: metrics.brokenCityPairs,
    readability: metrics.readability,
    noOffsetPairs: metrics.noOffsetPairs,
    offsetPairs: metrics.offsetPairs,
    angleMean: metrics.angleMean,
    angleCoefficientOfVariation: metrics.angleCoefficientOfVariation,
    areaWeightCorrelation: metrics.areaWeightCorrelation,
    averageAreaErrorRate: metrics.averageAreaErrorRate,
    areaErrorRates: metrics.areaErrorRates,
    averageCompactness: metrics.averageCompactness,
    compactnessValues: metrics.compactnessValues,
    semanticDensity: metrics.semanticDensity,
    totalTags: metrics.totalTags,
    totalArea: metrics.totalArea,
    totalWidth: metrics.totalWidth,
    totalHeight: metrics.totalHeight,
    renderEfficiency: metrics.renderEfficiency
  };
};

// 停止测试
const handleStopTest = () => {
  shouldStop.value = true;
  ElMessage.info('正在停止测试...');
};

// 清空结果
const handleClearResults = () => {
  testResults.value = [];
  ElMessage.info('已清空测试结果');
};

// 导出结果
const handleExportResults = () => {
  const headers = [
    '序号',
    '城市序列',
    '城市节点数量',
    '序列保持度',
    '可读性',
    '角度均值(°)',
    '角度变异系数',
    '面积-权重相关性',
    '平均面积误差率',
    '紧凑性',
    '语义信息密度',
    '运行效率(ms)'
  ];
  
  const rows = testResults.value.map((result, index) => [
    index + 1,
    result.linearSequence,
    result.cityNodeCount,
    result.sequenceContinuity !== undefined ? result.sequenceContinuity.toFixed(3) : '-',
    result.readability !== undefined ? result.readability.toFixed(3) : '-',
    result.angleMean !== undefined ? result.angleMean.toFixed(2) : '-',
    result.angleCoefficientOfVariation !== undefined ? (result.angleCoefficientOfVariation / 100).toFixed(3) : '-',
    result.areaWeightCorrelation !== undefined ? result.areaWeightCorrelation.toFixed(4) : '-',
    result.averageAreaErrorRate !== undefined ? (result.averageAreaErrorRate / 100).toFixed(3) : '-',
    result.averageCompactness !== undefined ? result.averageCompactness.toFixed(4) : '-',
    result.semanticDensity !== undefined ? result.semanticDensity.toFixed(6) : '-',
    result.renderEfficiency !== undefined ? result.renderEfficiency : '-'
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  // 添加BOM以支持中文
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `batch_test_results_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  ElMessage.success('导出成功');
};
</script>

<style scoped>
.batch-test-panel {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.panel-header h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2333;
}

.test-tabs {
  margin-top: 16px;
}

.tab-content {
  padding: 16px 0;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-section label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.city-input {
  width: 100%;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-row label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
  min-width: 120px;
}

.test-cases-section {
  margin-top: 24px;
}

.test-cases-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2333;
}

.test-case-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.test-case-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.case-number {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #409eff;
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

.case-cities {
  flex: 1;
  font-size: 13px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-control-section {
  padding: 16px 0;
  border-top: 1px solid #e4e7ed;
  margin-top: 16px;
}

.test-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: #606266;
}

.test-progress {
  color: #409eff;
  font-weight: 600;
}

.test-buttons {
  display: flex;
  gap: 12px;
}

.test-results-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e4e7ed;
}

.test-results-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2333;
}

.results-table-wrapper {
  max-height: 400px;
  overflow: auto;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.results-table thead {
  background: #f5f7fa;
  position: sticky;
  top: 0;
  z-index: 10;
}

.results-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #606266;
  border-bottom: 1px solid #e4e7ed;
  white-space: nowrap;
}

.results-table td {
  padding: 12px;
  border-bottom: 1px solid #e4e7ed;
  color: #606266;
}

.results-table tbody tr:hover {
  background: #f5f7fa;
}

.sequence-cell {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

