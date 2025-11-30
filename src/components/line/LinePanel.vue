<template>
  <section class="panel-card line-panel">
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">线条形态选择</span>
        <span class="section-desc">设置标签云上的路径形态</span>
      </div>
      <div class="section-content">
        <el-radio-group v-model="lineType" @change="updateLineType">
          <el-radio-button label="none">无</el-radio-button>
          <el-radio-button label="curve">曲线</el-radio-button>
          <el-radio-button label="polyline">折线</el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">线条样式</span>
        <span class="section-desc">调整线宽（形态为"无"时不可操作）</span>
      </div>
      <div class="section-content">
        <el-form label-position="left" label-width="60px">
          <el-form-item label="线宽">
            <el-slider
              v-model="lineWidth"
              :min="1"
              :max="10"
              :step="1"
              :disabled="lineType==='none'"
              style="width: 160px;"
              @change="updateLineWidth"
            />
          </el-form-item>
          <el-form-item label="颜色">
            <el-color-picker
              v-model="lineColor"
              :disabled="lineType==='none'"
              @change="updateLineColor"
              @active-change="updateLineColor"
            />
          </el-form-item>
        </el-form>
      </div>
    </div>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import { usePoiStore } from '@/stores/poiStore';
import { ElColorPicker } from 'element-plus';
const poiStore = usePoiStore();

const lineType = ref(poiStore.linePanel?.type || 'curve');
const lineWidth = ref(poiStore.linePanel?.width || 2);
const lineColor = ref(poiStore.linePanel?.color || '#aaa');

function updateLineType(val) {
  poiStore.setLinePanel({ type: val, width: lineWidth.value, color: lineColor.value });
}
function updateLineWidth(val) {
  poiStore.setLinePanel({ type: lineType.value, width: val, color: lineColor.value });
}
function updateLineColor(val) {
  if (val) {
    poiStore.setLinePanel({ type: lineType.value, width: lineWidth.value, color: val });
  }
}

// 保持和store同步
watch(() => poiStore.linePanel, (panel) => {
  if (!panel) return;
  lineType.value = panel.type || 'curve';
  lineWidth.value = panel.width || 2;
  lineColor.value = panel.color || '#aaa';
});
</script>
<style scoped>
.line-panel {
  padding: 0;
}
.config-section {
  margin-bottom: 18px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 4px 14px 0 rgba(33,82,138,.06);
  padding: 22px 24px 16px 24px;
}
.section-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #222e39;
}
.section-desc {
  font-size: 12px;
  color: #878c99;
}
</style>
