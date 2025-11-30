<template>
  <section class="panel-card layout-panel">
    <div class="config-section">
      <div class="section-header">
        <span class="section-title">空间布局方式选择</span>
        <span class="section-desc">设置标签云的空间布局算法</span>
      </div>
      <div class="section-content">
        <div class="layout-grid">
          <div
            v-for="layout in layouts"
            :key="layout.value"
            class="layout-card"
            :class="{ selected: currentLayout === layout.value }"
            @click="selectLayout(layout.value)"
          >
            <img :src="layout.img" :alt="layout.name" class="layout-img" />
            <div class="layout-name">{{ layout.name }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { usePoiStore } from '@/stores/poiStore';
const poiStore = usePoiStore();

const layouts = [
  { value: 'Resquarify', name: 'Resquarify', img: '/img/Resquarify.png' },
  { value: 'Dice', name: 'Dice', img: '/img/Dice.png' },
  { value: 'Slice', name: 'Slice', img: '/img/Slice.png' },
  { value: 'Binary', name: 'Binary', img: '/img/Binary.png' },
  { value: 'Strip', name: 'Strip', img: '/img/Strip.png' },
  { value: 'Spiral', name: 'Spiral', img: '/img/Spiral.png' },
  { value: 'Pivot', name: 'Pivot', img: '/img/Pivot.png' },
];

const currentLayout = computed(() => poiStore.lineType);

function selectLayout(type) {
  poiStore.setLayoutType(type);
}
</script>

<style scoped>
.layout-panel {
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
.section-content {
  width: 100%;
}
.layout-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 18px;
  padding-top: 4px;
}
.layout-card {
  border: 2px solid #f0f0f0;
  border-radius: 13px;
  text-align: center;
  padding: 14px 8px 8px 8px;
  background: #fbfcfd;
  transition: box-shadow 0.23s,cubic-bezier(.57,1.48,1,1), border 0.18s,transform 0.19s, background 0.16s;
  cursor: pointer;
  position: relative;
  box-shadow: 0 2px 8px #0001;
}
.layout-card.selected {
  border: 2.5px solid #399ceb;
  box-shadow: 0 3px 14px #399ceb26;
  background: #e8f3fd;
}
.layout-card:hover {
  border: 2.5px solid #77baff;
  box-shadow: 0 8px 22px #39c2;
  background: #f2f8fe;
  transform: translateY(-3px) scale(1.035);
  z-index: 2;
}
.layout-img {
  height: 54px;
  margin-bottom: 6px;
  user-drag: none;
  user-select: none;
  pointer-events: none;
}
.layout-name {
  font-size: 15px;
  font-weight: 500;
  color: #183354;
}
</style>
