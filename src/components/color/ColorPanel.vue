<template>
  <section class="panel-card color-panel">
    <!-- 背景配色 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">背景配色</span>
        <span class="section-desc">设置标签云的背景颜色</span>
      </div>
      <div class="section-content">
        <!-- 单色/复色选择 -->
        <div class="color-item">
          <span class="label">配色模式：</span>
          <el-radio-group v-model="localSettings.backgroundMode" @change="handleBackgroundModeChange">
            <el-radio label="single">单色</el-radio>
            <el-radio label="multi">复色</el-radio>
          </el-radio-group>
        </div>

        <!-- 单色模式 -->
        <div v-if="localSettings.backgroundMode === 'single'" class="color-item">
          <span class="label">当前背景颜色：</span>
          <el-color-picker
            v-model="localSettings.background"
            @change="handleBackgroundChange"
            @active-change="handleBackgroundChange"
            show-alpha
          />
          <span class="color-preview" :style="{ background: localSettings.background }"></span>
        </div>

        <!-- 复色模式 -->
        <div v-if="localSettings.backgroundMode === 'multi'">
          <!-- 当前色带展示 -->
          <div class="ribbon-preview-section">
            <div class="ribbon-header">
              <span class="label">当前色带：</span>
              <el-button 
                size="small" 
                @click="handleColorFlip"
                :icon="Refresh"
              >
                颜色翻转
              </el-button>
            </div>
            <div class="current-ribbon">
              <div
                v-for="(color, index) in currentRibbon"
                :key="`ribbon-${index}`"
                class="ribbon-color-item"
                style="display: flex; align-items: center; gap: 8px; padding: 4px;"
              >
                <el-color-picker
                  :model-value="localSettings.palette?.[index] || currentRibbon[index]"
                  @change="(val) => handleSingleColorChange(index, val)"
                  @active-change="(val) => handleSingleColorChange(index, val)"
                  size="small"
                  :predefine="[]"
                />
                <span
                  class="color-preview"
                  :style="{
                    background: color || '#fff',
                    height: '24px',
                    display: 'block',
                    borderRadius: '4px',
                    flex: '1 1 auto',
                    minWidth: '0'
                  }"
                ></span>
              </div>
            </div>
          </div>

          <!-- 透明度调节 -->
          <div class="color-item">
            <span class="label">透明度：</span>
            <el-slider
              v-model="backgroundOpacityValue"
              :min="0"
              :max="100"
              :step="1"
              @change="handleBackgroundOpacityChange"
              style="flex: 1; margin: 0 12px;"
            />
            <span style="min-width: 50px; text-align: right; font-size: 12px; color: #606266;">
              {{ backgroundOpacityValue }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 文字配色 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">文字配色</span>
        <span class="section-desc">设置标签文字的颜色方案</span>
      </div>
      <div class="section-content">
        <!-- 单色/复色选择 -->
        <div class="color-item">
          <span class="label">配色模式：</span>
          <el-radio-group v-model="localSettings.textColorMode" @change="handleTextColorModeChange">
            <el-radio label="single">单色</el-radio>
            <el-radio label="multi">复色</el-radio>
          </el-radio-group>
        </div>

        <!-- 单色模式 -->
        <div v-if="localSettings.textColorMode === 'single'" class="color-item">
          <span class="label">当前文字颜色：</span>
          <el-color-picker
            v-model="localSettings.textSingleColor"
            @change="handleTextSingleColorChange"
            @active-change="handleTextSingleColorChange"
            show-alpha
          />
          <span class="color-preview" :style="{ background: localSettings.textSingleColor }"></span>
        </div>

        <!-- 复色模式 -->
        <div v-if="localSettings.textColorMode === 'multi'">
          <!-- 当前色带展示 -->
          <div class="ribbon-preview-section">
            <div class="ribbon-header">
              <span class="label">当前色带：</span>
              <el-button 
                size="small" 
                @click="handleColorFlip"
                :icon="Refresh"
              >
                颜色翻转
              </el-button>
            </div>
            <div class="current-ribbon">
              <div
                v-for="(color, index) in currentRibbon"
                :key="`ribbon-${index}`"
                class="ribbon-color-item"
                style="display: flex; align-items: center; gap: 8px; padding: 4px;"
              >
                <el-color-picker
                  :model-value="localSettings.palette?.[index] || currentRibbon[index]"
                  @change="(val) => handleSingleColorChange(index, val)"
                  @active-change="(val) => handleSingleColorChange(index, val)"
                  size="small"
                  :predefine="[]"
                />
                <span
                  class="color-preview"
                  :style="{
                    background: color || '#fff',
                    height: '24px',
                    display: 'block',
                    borderRadius: '4px',
                    flex: '1 1 auto',
                    minWidth: '0'
                  }"
                ></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 配色方案 -->
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">配色方案</span>
        <span class="section-desc">选择预设的配色方案</span>
      </div>
      <div class="section-content">
        <div class="scheme-selection">
          <div class="scheme-header">
            <span class="label">配色方案：</span>
            <span class="scheme-count">共 {{ availableRibbons.length }} 种方案</span>
          </div>
          <div class="ribbon-gallery">
            <div
              v-for="(scheme, index) in availableRibbons"
              :key="`ribbon-${index}`"
              class="ribbon-scheme-item"
              :class="{ active: currentRibbonIndex === index }"
              @click="handleRibbonSchemeSelect(index)"
            >
              <div class="ribbon-scheme-colors">
                <div
                  v-for="(color, cIndex) in scheme"
                  :key="`scheme-${index}-${cIndex}`"
                  class="scheme-color-block"
                  :style="{ background: color }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, computed, nextTick, onMounted } from 'vue';
import { usePoiStore } from '@/stores/poiStore';
import { Refresh } from '@element-plus/icons-vue';
import { ribbonColorSchemes } from './ribbonColorSchemes';
import { ElRadioGroup, ElRadio, ElSlider } from 'element-plus';

const poiStore = usePoiStore();

const localSettings = ref({ ...poiStore.colorSettings });
// 只保留4色带
const currentRibbonIndex = ref(1); // 默认第二组配色方案，索引为1

const currentRibbon = computed(() => {
  return localSettings.value.palette || [];
});

const availableRibbons = computed(() => {
  // 这里只留四色带方案
  return ribbonColorSchemes.map(scheme => scheme.map(c => `rgb(${c.join(',')})`));
});

// 背景透明度值（0-100）
const backgroundOpacityValue = computed({
  get: () => {
    const opacity = localSettings.value.backgroundMultiColorOpacity;
    // 使用 nullish coalescing 来正确处理 0 值
    return Math.round((opacity ?? 0.1) * 100);
  },
  set: (val) => {
    localSettings.value.backgroundMultiColorOpacity = val / 100;
  }
});

// 标记是否正在更新，避免watch循环
const isUpdating = ref(false);

watch(
  () => poiStore.colorSettings,
  (settings) => {
    // 如果正在更新，跳过watch，避免覆盖正在进行的修改
    if (isUpdating.value) {
      return;
    }
    
    // 确保palette数组是新的引用，保持响应式
    const newPalette = settings.palette ? [...settings.palette] : [];
    localSettings.value = {
      ...settings,
      palette: newPalette
    };
    
    // 保持只允许四色带，但如果 palette 不是标准候选色带之一（如翻转后），允许索引为 -1
    nextTick(() => {
      if (availableRibbons.value.length > 0) {
        const paletteStr = JSON.stringify(settings.palette?.map(c => {
          if (c.startsWith('rgb')) return c;
          if (c.startsWith('#')) {
            const hex = c.slice(1);
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return `rgb(${r},${g},${b})`;
          }
          return c;
        }) || []);

        const schemes = availableRibbons.value;
        const index = schemes.findIndex(scheme => {
          const schemeStr = JSON.stringify(scheme);
          return schemeStr === paletteStr;
        });
        currentRibbonIndex.value = index;
      }
    });
  },
  { immediate: true, deep: true }
);

const handleBackgroundChange = (color) => {
  if (!color) return;
  localSettings.value.background = color;
  poiStore.updateColorSettings({
    background: color,
  });
};

const handleBackgroundModeChange = (mode) => {
  localSettings.value.backgroundMode = mode;
  poiStore.updateColorSettings({
    backgroundMode: mode,
  });
  // 通知主视图区刷新标签云
  if (poiStore.hasDrawing) {
    setTimeout(() => {
      if (window && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('refreshTagCloud'));
      }
    }, 50);
  }
};

const handleBackgroundOpacityChange = (value) => {
  // 确保可以设置为 0
  const opacity = value / 100;
  localSettings.value.backgroundMultiColorOpacity = opacity;
  poiStore.updateColorSettings({
    backgroundMultiColorOpacity: opacity,
  });
  // 通知主视图区刷新标签云
  if (poiStore.hasDrawing) {
    setTimeout(() => {
      if (window && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('refreshTagCloud'));
      }
    }, 50);
  }
};

const handleTextColorModeChange = (mode) => {
  localSettings.value.textColorMode = mode;
  poiStore.updateColorSettings({
    textColorMode: mode,
  });
  // 通知主视图区刷新标签云
  if (poiStore.hasDrawing) {
    setTimeout(() => {
      if (window && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('refreshTagCloud'));
      }
    }, 50);
  }
};

const handleTextSingleColorChange = (color) => {
  if (!color) return;
  localSettings.value.textSingleColor = color;
  poiStore.updateColorSettings({
    textSingleColor: color,
  });
  // 通知主视图区刷新标签云
  if (poiStore.hasDrawing) {
    setTimeout(() => {
      if (window && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('refreshTagCloud'));
      }
    }, 50);
  }
};

let flipTimer = null;
const handleColorFlip = () => {
  if (flipTimer) clearTimeout(flipTimer);
  flipTimer = setTimeout(() => {
    const reversed = [...currentRibbon.value].reverse();
    // 只更新palette，currentRibbonIndex不变
    localSettings.value.palette = reversed;
    poiStore.updateColorSettings({
      palette: reversed,
      inverted: !localSettings.value.inverted,
    });
    // 通知主视图区刷新标签云
    if (poiStore.hasDrawing) {
      setTimeout(() => {
        if (window && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('refreshTagCloud'));
        }
      }, 50);
    }
  }, 50);
};

// 将颜色值转换为rgb格式字符串
function convertToRgbStr(color) {
  if (!color) return 'rgb(0,0,0)';
  // 如果已经是rgb格式，直接返回
  if (color.startsWith('rgb')) return color;
  // 如果是hex格式，转换为rgb
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgb(${r},${g},${b})`;
  }
  // 其他格式直接返回
  return color;
}

// 处理单个颜色修改
const handleSingleColorChange = (index, color) => {
  if (color === null || color === undefined) return;
  
  // 设置更新标志，避免watch循环
  isUpdating.value = true;
  
  try {
    // 确保palette数组存在且长度为4
    const currentPalette = localSettings.value.palette || [];
    const palette = currentPalette.length > 0 ? [...currentPalette] : [];
    while (palette.length < 4) {
      palette.push('rgb(0,0,0)');
    }
    
    // 转换颜色格式为rgb
    const rgbStr = convertToRgbStr(color);
    
    // 创建新数组，确保响应式更新
    const newPalette = [...palette];
    newPalette[index] = rgbStr;
    
    // 直接更新localSettings，确保UI立即响应（使用新数组引用）
    localSettings.value = {
      ...localSettings.value,
      palette: newPalette
    };
    
    // 更新store
    poiStore.updateColorSettings({
      palette: newPalette,
    });
    
    // 自定义颜色后，将索引设为-1，表示不是标准色带
    currentRibbonIndex.value = -1;
    
    // 通知主视图区刷新标签云
    if (poiStore.hasDrawing) {
      setTimeout(() => {
        if (window && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('refreshTagCloud'));
        }
      }, 50);
    }
  } finally {
    // 延迟重置标志，确保watch不会立即覆盖
    setTimeout(() => {
      isUpdating.value = false;
    }, 100);
  }
};

const handleRibbonSchemeSelect = (index) => {
  currentRibbonIndex.value = index;
  const selectedScheme = availableRibbons.value[index];
  localSettings.value.palette = selectedScheme;
  poiStore.updateColorSettings({
    palette: selectedScheme,
  });
  // 通知主视图区刷新标签云
  if (poiStore.hasDrawing) {
    // 假定有 handleRenderCloud 方法/动作
    setTimeout(()=>{
      if(window && window.dispatchEvent){
        window.dispatchEvent(new CustomEvent('refreshTagCloud'));
      }
    }, 50);
  }
};

onMounted(() => {
  nextTick(() => {
    // 确保背景配色模式默认为复色
    if (poiStore.colorSettings.backgroundMode !== 'multi') {
      poiStore.updateColorSettings({
        backgroundMode: 'multi',
      });
    }
    
    if (availableRibbons.value.length > 0) {
      const currentPalette = poiStore.colorSettings.palette || [];
      const paletteStr = JSON.stringify(currentPalette);
      const matched = availableRibbons.value.some((scheme, index) => {
        if (JSON.stringify(scheme) === paletteStr) {
          currentRibbonIndex.value = index;
          return true;
        }
        return false;
      });
      if (!matched) {
        const defaultIndex = 1;
        const defaultScheme = availableRibbons.value[defaultIndex];
        currentRibbonIndex.value = defaultIndex;
        poiStore.updateColorSettings({
          palette: defaultScheme,
        });
      }
    }
  });
});
</script>

<style scoped>
.color-panel {
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

.color-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.color-item:last-child {
  margin-bottom: 0;
}

.color-item.spaced {
  justify-content: space-between;
}

.label {
  font-size: 14px;
  color: #606266;
  min-width: 100px;
}

.color-preview {
  width: 48px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: background 0.2s;
}

/* 当前色带展示 */
.ribbon-preview-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.ribbon-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.current-ribbon {
  display: flex;
  gap: 4px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.ribbon-color-item {
  flex: 1;
  height: 32px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  min-width: 40px;
}

/* 离散设置 */
.discrete-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: #fafbfc;
  border-radius: 6px;
}

/* 配色方案选择 */
.scheme-selection {
  margin-top: 8px;
}

.scheme-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.scheme-count {
  font-size: 12px;
  color: #909399;
}

.ribbon-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  max-height:350px;
  overflow-y: auto;
  padding: 4px;
}

.ribbon-scheme-item {
  padding: 12px;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
}

.ribbon-scheme-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
  transform: translateY(-1px);
}

.ribbon-scheme-item.active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.3);
}

.ribbon-scheme-colors {
  display: flex;
  gap: 2px;
  height: 40px;
}

.scheme-color-block {
  flex: 1;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  min-width: 8px;
}
</style>
