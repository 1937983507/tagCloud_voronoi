<template>
  <aside class="side-menu">
    <div class="menu-group">
      <button
        v-for="item in mainMenu"
        :key="item.key"
        class="menu-item"
        :class="{ active: activePanel === item.key }"
        @click="$emit('change-panel', item.key)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
    </div>
    <div class="menu-group footer-group">
      <button class="menu-item ghost" @click="handleSettingsClick">设置</button>
      <button class="menu-item ghost" @click="handleShortcutClick">快捷键</button>
      <button class="menu-item ghost" @click="handleHelpClick">帮助</button>
      <button class="menu-item ghost" @click="handleHideClick">隐藏</button>
    </div>
    
    <!-- 设置对话框 -->
    <el-dialog
      v-model="settingsDialogVisible"
      title="模块显示设置"
      width="400px"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
    >
      <div class="settings-content">
        <div class="settings-item" v-for="module in moduleSettings" :key="module.key">
          <el-checkbox
            :model-value="moduleVisibility[module.key]"
            @update:model-value="(val) => handleModuleVisibilityChange(module.key, val)"
          >
            {{ module.label }}
          </el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="settingsDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  BrushFilled,
  Collection,
  EditPen,
  Connection,
  DataAnalysis,
} from '@element-plus/icons-vue';

defineProps({
  activePanel: {
    type: String,
    default: 'content',
  },
});

const emit = defineEmits(['change-panel', 'navigate', 'module-visibility-change']);

// localStorage key
const MODULE_VISIBILITY_KEY = 'tagCloud_voronoi_moduleVisibility';

// 默认模块可见性设置（只有批量测试默认不显示）
const defaultModuleVisibility = {
  content: true,
  typeface: true,
  color: true,
  line: true,
  batchtest: false,
};

// 从 localStorage 读取模块可见性设置
const loadModuleVisibility = () => {
  try {
    const saved = localStorage.getItem(MODULE_VISIBILITY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 合并默认设置和保存的设置，确保所有模块都有值
      // 对于批量测试，如果用户没有明确设置过，使用默认值 false
      const result = { ...defaultModuleVisibility, ...parsed };
      // 如果保存的设置中没有 batchtest 字段，使用默认值 false
      if (!('batchtest' in parsed)) {
        result.batchtest = defaultModuleVisibility.batchtest;
      }
      return result;
    }
  } catch (error) {
    console.warn('读取模块可见性设置失败:', error);
  }
  return { ...defaultModuleVisibility };
};

// 保存模块可见性设置到 localStorage
const saveModuleVisibility = (visibility) => {
  try {
    localStorage.setItem(MODULE_VISIBILITY_KEY, JSON.stringify(visibility));
  } catch (error) {
    console.warn('保存模块可见性设置失败:', error);
  }
};

// 模块可见性状态
const moduleVisibility = ref(loadModuleVisibility());

// 设置对话框可见性
const settingsDialogVisible = ref(false);

// 模块设置列表（用于对话框显示）
const moduleSettings = [
  { key: 'content', label: '内容' },
  { key: 'typeface', label: '字体' },
  { key: 'color', label: '配色' },
  { key: 'line', label: '线条' },
  { key: 'batchtest', label: '批量测试' },
];

// 完整的菜单配置
const allMenuItems = [
  { key: 'content', label: '内容', icon: Collection },
  { key: 'typeface', label: '字体', icon: EditPen },
  { key: 'color', label: '配色', icon: BrushFilled },
  { key: 'line', label: '线条', icon: Connection },
  { key: 'batchtest', label: '批量测试', icon: DataAnalysis },
];

// 根据模块可见性设置过滤菜单项
const mainMenu = computed(() => {
  return allMenuItems.filter(item => {
    // 检查模块可见性设置
    return moduleVisibility.value[item.key] === true;
  });
});

// 处理模块可见性变化
const handleModuleVisibilityChange = (moduleKey, visible) => {
  moduleVisibility.value[moduleKey] = visible;
  saveModuleVisibility(moduleVisibility.value);
  emit('module-visibility-change', { moduleKey, visible });
};

// 打开设置对话框
const handleSettingsClick = () => {
  settingsDialogVisible.value = true;
};

const handleShortcutClick = () => {
  ElMessage.info('该功能正在开发中，敬请期待！');
};

const handleHelpClick = () => {
  emit('navigate', 'help');
};

const handleHideClick = () => {
  ElMessage.info('该功能正在开发中，敬请期待！');
};

// 暴露模块可见性状态，供父组件访问
defineExpose({
  moduleVisibility,
});
</script>

<style scoped>
.side-menu {
  width: 108px;
  min-width: 108px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 24px 8px 20px 8px;
  background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
  border-right: 1px solid rgba(15, 20, 36, 0.08);
  min-height: 0;
  overflow: hidden;
  box-shadow: 2px 0 8px rgba(15, 20, 36, 0.06);
}

.menu-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.menu-item {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 8px;
  padding: 12px 10px;
  border-radius: 10px;
  background: transparent;
  color: #1f2333;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  max-width: 92px;
  position: relative;
  overflow: hidden;
}

.menu-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: linear-gradient(180deg, #7dd3fc, #38bdf8);
  border-radius: 0 3px 3px 0;
  transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-item:hover {
  background: rgba(148, 163, 184, 0.2);
  color: #0f172a;
  transform: translateX(2px);
}

.menu-item:hover::before {
  height: 60%;
}

.menu-item.active {
  background: linear-gradient(120deg, #dbeafe, #bfdbfe);
  color: #0f172a;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(148, 163, 184, 0.4);
}

.menu-item.active::before {
  height: 100%;
  width: 4px;
}

.menu-item.ghost {
  justify-content: center;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
  padding: 8px;
}

.menu-item.ghost:hover {
  background: rgba(15, 23, 42, 0.05);
  color: rgba(15, 23, 42, 0.9);
}

.footer-group {
  margin-top: auto;
  flex-direction: column;
  gap: 12px;
}

.settings-content {
  padding: 8px 0;
}

.settings-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.settings-item:last-child {
  border-bottom: none;
}

.settings-item :deep(.el-checkbox) {
  width: 100%;
}

.settings-item :deep(.el-checkbox__label) {
  font-size: 14px;
  color: #1f2333;
}
</style>

