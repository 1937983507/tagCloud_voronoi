<template>
  <section class="panel-card typeface-panel">
    <!-- 语言选择 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">语言</span>
        <span class="section-desc">选择标签显示的语言</span>
      </div>
      <div class="section-content">
        <el-select
          v-model="localSettings.language"
          style="width: 200px"
          @change="handleLanguageChange"
        >
          <el-option label="中文" value="zh" />
          <el-option label="English" value="en" />
        </el-select>
      </div>
    </div>

    <!-- 序号选择 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">序号</span>
        <span class="section-desc">是否在城市名前显示序号</span>
      </div>
      <div class="section-content">
        <el-switch
          v-model="localSettings.showCityIndex"
          @change="handleShowCityIndexChange"
        />
        <span style="margin-left: 12px; font-size: 14px; color: #606266;">
          {{ localSettings.showCityIndex ? '显示序号' : '不显示序号' }}
        </span>
      </div>
    </div>

    <!-- 字号设置 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">字号区间</span>
        <span class="section-desc">设置标签字号的最大/最小值</span>
      </div>
      <div class="section-content">
        <div class="fontsize-row">
          <span class="fontsize-label">最小字号：</span>
          <el-input-number 
            v-model="localSettings.minFontSize" 
            :min="2" 
            :max="localSettings.maxFontSize" 
            :step="2" 
            @change="handleMinFontSizeChange" 
          />
          <span class="fontsize-unit">px</span>
        </div>
        <div class="fontsize-row">
          <span class="fontsize-label">最大字号：</span>
          <el-input-number 
            v-model="localSettings.maxFontSize" 
            :min="localSettings.minFontSize" 
            :max="120" 
            :step="2" 
            @change="handleMaxFontSizeChange" 
          />
          <span class="fontsize-unit">px</span>
        </div>
      </div>
    </div>

    <!-- 字重选择 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">字重选择</span>
        <span class="section-desc">设置标签的字体粗细</span>
      </div>
      <div class="section-content">
        <el-select
          v-model="localSettings.fontWeight"
          style="width: 200px"
          @change="handleWeightChange"
        >
          <el-option label="Thin 100" value="100" />
          <el-option label="Light 300" value="300" />
          <el-option label="Regular 400" value="400" />
          <el-option label="Medium 500" value="500" />
          <el-option label="Semibold 600" value="600" />
          <el-option label="Bold 700" value="700" />
          <el-option label="Extra Bold 800" value="800" />
          <el-option label="Black 900" value="900" />
        </el-select>
      </div>
    </div>

    <!-- 字体库 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">字体库</span>
        <span class="section-desc">选择标签使用的字体</span>
      </div>
      <div class="section-content">
        <div class="font-gallery">
          <button
            v-for="font in filteredFonts"
            :key="font"
            class="font-chip"
            :style="{ fontFamily: font }"
            :class="{ active: poiStore.fontSettings.fontFamily === font }"
            @click="handleFamilyChange(font)"
          >
            <span class="font-name">{{ font }}</span>
            <span 
              v-if="poiStore.fontSettings.fontFamily === font" 
              class="font-active-badge"
            >
              使用中
            </span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { reactive, computed, watch } from 'vue';
import { usePoiStore } from '@/stores/poiStore';

const poiStore = usePoiStore();

const localSettings = reactive({
  language: poiStore.fontSettings.language || 'zh',
  showCityIndex: poiStore.fontSettings.showCityIndex || false,
  minFontSize: poiStore.fontSettings.minFontSize,
  maxFontSize: poiStore.fontSettings.maxFontSize,
  fontWeight: poiStore.fontSettings.fontWeight,
});

// 中文字体列表
const chineseFonts = [
  '等线', '等线 Light', '方正舒体', '方正姚体', '仿宋', '黑体',
  '华文彩云', '华文仿宋', '华文琥珀', '华文楷体', '华文隶书', '华文宋体', 
  '华文细黑', '华文新魏', '华文行楷', '华文中宋', '楷体', '隶书', 
  '宋体', '微软雅黑', '微软雅黑 Light', '新宋体', '幼圆', '思源黑体'
];

// 英文字体列表
const englishFonts = [
  'Arial', 'Inter', 'Times New Roman',  'Courier New', 'Comic Sans MS',
  'Impact', 'Trebuchet MS', 'Palatino', 'Helvetica', 'Lucida Console', 
  'Century Gothic', 'Franklin Gothic', 'Baskerville',
];



// 初始化时，如果字体不在对应语言的字体列表中，设置默认字体
const currentLanguage = poiStore.fontSettings.language || 'zh';
const availableFonts = currentLanguage === 'zh' ? chineseFonts : englishFonts;
if (!availableFonts.includes(poiStore.fontSettings.fontFamily)) {
  const defaultFont = currentLanguage === 'zh' ? '等线' : 'Arial';
  poiStore.updateFontLevel({ fontFamily: defaultFont });
}

// 根据语言过滤字体
const filteredFonts = computed(() => {
  return localSettings.language === 'zh' ? chineseFonts : englishFonts;
});

// 监听语言变化，自动设置默认字体
watch(
  () => localSettings.language,
  (newLanguage) => {
    const defaultFont = newLanguage === 'zh' ? '等线' : 'Arial';
    // 如果当前字体不在对应语言的字体列表中，则切换到默认字体
    const availableFonts = newLanguage === 'zh' ? chineseFonts : englishFonts;
    if (!availableFonts.includes(poiStore.fontSettings.fontFamily)) {
      poiStore.updateFontLevel({ fontFamily: defaultFont });
    }
  }
);

function handleLanguageChange() {
  const newLanguage = localSettings.language;
  const availableFonts = newLanguage === 'zh' ? chineseFonts : englishFonts;
  const defaultFont = newLanguage === 'zh' ? '等线' : 'Arial';
  
  // 如果当前字体不在新语言的字体列表中，则切换到默认字体
  const updatePayload = { language: newLanguage };
  if (!availableFonts.includes(poiStore.fontSettings.fontFamily)) {
    updatePayload.fontFamily = defaultFont;
  }
  
  poiStore.updateFontLevel(updatePayload);
  // 语言变化需要重新编译数据并重绘（TagCloudCanvas.vue 中的 watch 会自动处理）
}

function handleShowCityIndexChange() {
  poiStore.updateFontLevel({ showCityIndex: localSettings.showCityIndex });
  // 序号变化需要重新计算位置，需要完整重绘（TagCloudCanvas.vue 中的 watch 会自动处理）
}

function handleWeightChange() {
  poiStore.updateFontLevel({ fontWeight: localSettings.fontWeight });
  // 只有在已绘制路线的情况下才触发重绘（TagCloudCanvas.vue 中的 watch 会自动处理）
}

function handleFamilyChange(font) {
  poiStore.updateFontLevel({ fontFamily: font });
  // 只有在已绘制路线的情况下才触发重绘（TagCloudCanvas.vue 中的 watch 会自动处理）
}

function handleMinFontSizeChange() {
  // 如果最小字号超过最大字号，自动将其设置为最大字号
  if (localSettings.minFontSize > localSettings.maxFontSize) {
    localSettings.minFontSize = localSettings.maxFontSize;
  }
  poiStore.updateFontLevel({ minFontSize: localSettings.minFontSize });
}

function handleMaxFontSizeChange() {
  // 如果最大字号小于最小字号，自动将其设置为最小字号
  if (localSettings.maxFontSize < localSettings.minFontSize) {
    localSettings.maxFontSize = localSettings.minFontSize;
  }
  poiStore.updateFontLevel({ maxFontSize: localSettings.maxFontSize });
}
</script>

<style scoped>
.typeface-panel {
  /* min-height: calc(100vh - 160px); */
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0px;
  background: #f5f7fa;
}

.config-section {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  overflow: hidden;
}

.section-header {
  padding: 16px 20px;
  background: #fafbfc;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.section-desc {
  font-size: 12px;
  color: #909399;
  margin-left: 12px;
}

.section-content {
  padding: 20px;
}

.level-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-size: 14px;
  color: #606266;
  min-width: 80px;
}

.font-size-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.font-size-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.font-size-label {
  min-width: 60px;
  font-size: 14px;
  color: #606266;
}

.font-size-unit {
  font-size: 12px;
  color: #909399;
}

.font-tabs {
  margin-top: 0;
}

.font-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 0;
  max-height: 250px;
  overflow-y: auto;
  padding: 4px;
}

.font-chip {
  position: relative;
  border-radius: 8px;
  border: 2px solid #e4e7ed;
  padding: 12px 16px;
  cursor: pointer;
  background: #fff;
  transition: all 0.15s;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.font-chip:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
  transform: translateY(-1px);
}

.font-chip.active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.25);
}

.font-name {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.font-active-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  padding: 2px 6px;
  background: #409eff;
  color: #fff;
  border-radius: 10px;
  font-weight: 500;
}
.fontsize-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0 0 0;
}
.fontsize-label {font-size:14px;color:#606266;min-width:68px;}
.fontsize-unit {font-size:12px;color:#909399;}
</style>

