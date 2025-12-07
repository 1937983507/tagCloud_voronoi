<template>
  <div class="app-shell">
    <HeaderBar
      ref="headerRef"
      :show-tutorial-icon="!showHelpPage && !showFeedbackPage"
      @navigate="handleNavigate"
      @start-tutorial="restartIntro"
    />
    <FeedbackPage
      v-if="showFeedbackPage && !showHelpPage"
      @navigate="handleNavigate"
    />
    <template v-else-if="!showHelpPage">
      <div class="app-body">
        <SideMenu
          :active-panel="activePanel"
          @change-panel="handleChangePanel"
          @navigate="handleNavigate"
        />
        <div class="workspace">
          <PoiContent ref="poiContentRef" v-show="activePanel === 'content'" />
          <TypefacePanel v-show="activePanel === 'typeface'" />
          <ColorPanel v-show="activePanel === 'color'" />
          <LinePanel v-show="activePanel === 'line'" />
        </div>
        <SplitterBar />
        <TagCloudCanvas ref="tagCloudCanvasRef" />
      </div>
      <FooterBar @navigate="handleNavigate" />
    </template>
    <HelpPage v-else @navigate="handleNavigate" />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import introJs from 'intro.js';
import 'intro.js/minified/introjs.min.css';
import HeaderBar from '@/components/layout/HeaderBar.vue';
import FooterBar from '@/components/layout/FooterBar.vue';
import SideMenu from '@/components/layout/SideMenu.vue';
import PoiContent from '@/components/content/PoiContent.vue';
import TypefacePanel from '@/components/typeface/TypefacePanel.vue';
import ColorPanel from '@/components/color/ColorPanel.vue';
import TagCloudCanvas from '@/components/tagcloud/TagCloudCanvas.vue';
import SplitterBar from '@/components/common/SplitterBar.vue';
import LinePanel from '@/components/line/LinePanel.vue';
import FeedbackPage from '@/components/feedback/FeedbackPage.vue';
import HelpPage from '@/components/help/HelpPage.vue';

const activePanel = ref('content');
const headerRef = ref(null);
const poiContentRef = ref(null);
const tagCloudCanvasRef = ref(null);
const showHelpPage = ref(false);
const showFeedbackPage = ref(false);

let firstIntroStarted = false;
let currentIntro = null;

// localStorage key for tutorial preference
const TUTORIAL_DISABLED_KEY = 'tagCloud_voronoi_tutorialDisabled';

// Check if tutorial should be disabled
const shouldDisableTutorial = () => {
  return localStorage.getItem(TUTORIAL_DISABLED_KEY) === 'true';
};

// Save tutorial preference
const saveTutorialPreference = (disabled) => {
  localStorage.setItem(TUTORIAL_DISABLED_KEY, disabled ? 'true' : 'false');
};

// Get current tutorial preference
const getTutorialPreference = () => {
  return localStorage.getItem(TUTORIAL_DISABLED_KEY) === 'true';
};

// Expose function to window for inline event handler
if (typeof window !== 'undefined') {
  window.__saveTutorialPreference_voronoi = saveTutorialPreference;
  window.__getTutorialPreference_voronoi = getTutorialPreference;
}

// Helper function to add checkbox to intro content
const addCheckboxToIntro = (content) => {
  const isChecked = getTutorialPreference();
  const checkedAttr = isChecked ? 'checked' : '';
  const checkboxHtml = `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:left;"><label style="display:flex;align-items:center;cursor:pointer;font-size:13px;color:#64748b;"><input type="checkbox" class="tutorial-disable-checkbox-voronoi" ${checkedAttr} style="margin-right:8px;cursor:pointer;width:16px;height:16px;" onchange="window.__saveTutorialPreference_voronoi && window.__saveTutorialPreference_voronoi(this.checked); const allCheckboxes = document.querySelectorAll('.tutorial-disable-checkbox-voronoi'); allCheckboxes.forEach(cb => cb.checked = this.checked);" /><span>最近不再默认显示此引导</span></label></div>`;
  return content + checkboxHtml;
};

const handleChangePanel = (panel) => {
  activePanel.value = panel;
};

const handleNavigate = (route) => {
  if (route === 'help') {
    showHelpPage.value = true;
    showFeedbackPage.value = false;
  } else if (route === 'feedback') {
    showFeedbackPage.value = true;
    showHelpPage.value = false;
  } else if (route === 'home') {
    showHelpPage.value = false;
    showFeedbackPage.value = false;
  } else if (route === 'about') {
    // 跳转到关于我们页面
    window.location.href = 'https://hubutagcloud.cn/cxq-group/';
  } else {
    console.log('navigate to', route);
  }
};

const getHeaderElement = () => {
  if (headerRef.value?.$el) return headerRef.value.$el;
  return document.querySelector('header.header');
};

const getSideMenuElement = () => {
  return document.querySelector('.side-menu');
};

const getMapElement = () => {
  if (poiContentRef.value?.$el) {
    const mapWrapper = poiContentRef.value.$el.querySelector('.map-wrapper');
    if (mapWrapper) return mapWrapper;
  }
  return document.querySelector('.map-wrapper');
};

const getGraphElement = () => {
  if (poiContentRef.value?.$el) {
    const graphEl =
      poiContentRef.value.$el.querySelector('.graph-panel') ||
      poiContentRef.value.$el.querySelector('.table-card-placeholder');
    if (graphEl) return graphEl;
  }
  return document.querySelector('.graph-panel') || document.querySelector('.table-card-placeholder');
};

const getTagCloudPanelElement = () => {
  if (tagCloudCanvasRef.value?.$el) {
    const headEl = tagCloudCanvasRef.value.$el.querySelector('.panel-head');
    if (headEl) return headEl;
  }
  return document.querySelector('.tagcloud-panel .panel-head');
};

const getCanvasElement = () => {
  if (tagCloudCanvasRef.value?.$el) {
    const wrapperEl = tagCloudCanvasRef.value.$el.querySelector('.canvas-wrapper');
    if (wrapperEl) return wrapperEl;
  }
  return document.querySelector('.tagcloud-panel .canvas-wrapper') || document.querySelector('.tagcloud-panel svg');
};

const getTutorialButtonElement = () => {
  const tutorialBtn = document.querySelector('[data-intro-tutorial="tutorial-btn"]');
  if (tutorialBtn) return tutorialBtn;
  if (headerRef.value?.$el) {
    return headerRef.value.$el.querySelector('.tutorial-icon-link') || getHeaderElement();
  }
  return getHeaderElement();
};

const createIntro = () => {
  // Check if introJs is available
  if (!introJs || typeof introJs.tour !== 'function') {
    console.error('Intro.js is not properly loaded');
    throw new Error('Intro.js is not properly loaded');
  }
  
  const intro = introJs.tour();
  
  // Build steps array with checkbox in each step
  const steps = [
    {
      intro: addCheckboxToIntro(
        '<div style="text-align:center;padding:8px 0;"><div style="font-size:18px;font-weight:600;margin-bottom:8px;">欢迎体验地名标签云</div><div style="font-size:13px;color:#64748b;">我们将带您快速认识核心功能，帮助更顺利地生成路线标签云。</div></div>'
      ),
    },
    {
      element: getHeaderElement(),
      intro: addCheckboxToIntro(
        '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">导航栏</strong><br/><span style="color:#64748b;">这里可以返回首页、查看帮助或反馈意见。点击右上角的<span style="color:#399ceb;">"引导教程"</span>图标可再次查看本引导。</span></div>'
      ),
    },
    {
      element: getSideMenuElement(),
      intro: addCheckboxToIntro(
        '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">侧边面板</strong><br/><span style="color:#64748b;">按照"内容 → 字体 → 配色 → 线条"的顺序逐步完善展示效果。</span></div>'
      ),
    },
    {
      element: getMapElement(),
      intro: addCheckboxToIntro(
        '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">地图绘制区</strong><br/><span style="color:#64748b;">在此绘制折线或选择路线，系统将根据经过的城市提取景点数据。</span></div>'
      ),
    },
    {
      element: getGraphElement(),
      intro: addCheckboxToIntro(
        '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">数据分析视图</strong><br/><span style="color:#64748b;">实时查看城市关联、路径统计等信息，帮助评估线路覆盖情况。</span></div>'
      ),
    },
    {
      element: getTagCloudPanelElement(),
      intro: addCheckboxToIntro(
        '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">标签云控制面板</strong><br/><span style="color:#64748b;">点击"运行生成标签云"并根据需求调整导出、字号、配色等参数。</span></div>'
      ),
    },
    {
      element: getCanvasElement(),
      intro: addCheckboxToIntro(
        '<div style="line-height:1.6;"><strong style="font-size:16px;color:#1f2333;">标签云画布</strong><br/><span style="color:#64748b;">生成结果会显示在此处，可搭配缩放、导出等操作完成展示。</span></div>'
      ),
    },
    {
      element: getTutorialButtonElement(),
      intro: addCheckboxToIntro(
        '<div style="text-align:center;line-height:1.6;"><div style="font-size:20px;margin-bottom:12px;">🎉 引导完成</div><div style="color:#64748b;margin-bottom:12px;">随时点击右上角的<span style="color:#399ceb;">"引导教程"</span>图标重新查看操作提示。</div><div style="font-size:12px;color:#94a3b8;">祝您创作顺利！</div></div>'
      ),
    },
  ];
  
  intro.addSteps(steps);

  intro.setOptions({
    nextLabel: '下一步 →',
    prevLabel: '← 上一步',
    skipLabel: '跳过',
    doneLabel: '完成',
    showStepNumbers: true,
    showProgress: true,
    disableInteraction: false,
    tooltipClass: 'customTooltipClass',
    highlightClass: 'customHighlightClass',
    scrollToElement: true,
    scrollPadding: 20,
    overlayOpacity: 0.4,
    tooltipPosition: 'auto',
    exitOnOverlayClick: true,
    exitOnEsc: true,
    keyboardNavigation: true,
    tooltipRenderAsHtml: true,
  });

  // Set up checkbox listeners when step changes (if callback is available)
  // Note: We also use inline onchange handler in HTML as fallback
  if (typeof intro.onchange === 'function') {
    intro.onchange(() => {
      nextTick(() => {
        // Update all checkboxes to reflect current state
        const checkboxes = document.querySelectorAll('.tutorial-disable-checkbox-voronoi');
        const isDisabled = getTutorialPreference();
        checkboxes.forEach((checkbox) => {
          checkbox.checked = isDisabled;
          if (!checkbox.hasAttribute('data-listener-attached')) {
            checkbox.setAttribute('data-listener-attached', 'true');
            checkbox.addEventListener('change', (e) => {
              saveTutorialPreference(e.target.checked);
              // Sync all checkboxes
              document.querySelectorAll('.tutorial-disable-checkbox-voronoi').forEach((cb) => {
                cb.checked = e.target.checked;
              });
            });
          }
        });
      });
    });
  }

  intro.onComplete(() => {
    // Check checkbox state when completing (check any checkbox, they should all be in sync)
    const checkbox = document.querySelector('.tutorial-disable-checkbox-voronoi');
    if (checkbox) {
      saveTutorialPreference(checkbox.checked);
    }
    firstIntroStarted = false;
    currentIntro = null;
  });

  intro.onExit(() => {
    // Check checkbox state when exiting (check any checkbox, they should all be in sync)
    const checkbox = document.querySelector('.tutorial-disable-checkbox-voronoi');
    if (checkbox) {
      saveTutorialPreference(checkbox.checked);
    }
    firstIntroStarted = false;
    currentIntro = null;
  });

  return intro;
};

const restartIntro = () => {
  // Exit current intro if exists
  if (currentIntro) {
    try {
      if (typeof currentIntro.exit === 'function') {
        currentIntro.exit(true);
      } else if (typeof currentIntro.exitIntro === 'function') {
        currentIntro.exitIntro(true);
      }
    } catch (e) {
      console.warn('Error exiting current intro:', e);
    }
  }
  
  // Also try to exit any existing intro.js instance
  try {
    if (introJs && typeof introJs.exit === 'function') {
      introJs.exit(true);
    }
  } catch (e) {
    // Ignore errors
  }
  
  firstIntroStarted = false;
  currentIntro = null;
  
  // Wait a bit for cleanup, then start new intro
  setTimeout(() => {
    nextTick(() => {
      try {
        const intro = createIntro();
        currentIntro = intro;
        // Ensure intro.js is available
        if (!intro || typeof intro.start !== 'function') {
          console.error('Intro.js not properly initialized');
          return;
        }
        console.log('Starting intro.js tour...');
        intro.start();
      } catch (error) {
        console.error('Error starting intro:', error);
        firstIntroStarted = false;
        currentIntro = null;
      }
    });
  }, 200);
};

const initIntro = () => {
  // Check if user has disabled tutorial
  if (shouldDisableTutorial()) {
    return;
  }
  if (firstIntroStarted || showHelpPage.value || showFeedbackPage.value) return;
  firstIntroStarted = true;
  nextTick(() => {
    try {
      const intro = createIntro();
      currentIntro = intro;
      // Ensure intro.js is available
      if (!intro || typeof intro.start !== 'function') {
        console.error('Intro.js not properly initialized');
        firstIntroStarted = false;
        currentIntro = null;
        return;
      }
      intro.start();
    } catch (error) {
      console.error('Error starting intro:', error);
      firstIntroStarted = false;
      currentIntro = null;
    }
  });
};

onMounted(() => {
  setTimeout(() => {
    if (!showHelpPage.value && !showFeedbackPage.value) {
      initIntro();
    }
  }, 500);
});
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.app-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: 108px 1fr 12px 68vw;
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
}

.workspace {
  padding: 18px;
  background: #ffffff;
  min-height: 0;
  height: 100%;
}

.workspace > * {
  display: block;
  height: 100%;
}
</style>

