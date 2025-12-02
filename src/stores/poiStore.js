import { defineStore } from 'pinia';
import axios from 'axios';

const DATA_URL = `${import.meta.env.BASE_URL}data/chinapoi.csv`;

export const usePoiStore = defineStore('poiStore', {
  state: () => ({
    poiList: [],
    allPOI: [], // 存储所有POI数据（原始格式）
    dataLoaded: false,
    dataLoadingPromise: null,
    visibleMode: 'all',
    selectedIds: [],
    hasDrawing: false, // 是否有绘制折线
    userDrawObj: null, // 用户绘制的折线对象
    route: null, // 导航路线
    startMarker: null, // 起点标记
    endMarker: null, // 终点标记
    cityOrder: [], // 城市顺序
    compiledData: {}, // 编译后的数据（按城市分组）
    fontSettings: {
      minFontSize: 10,
      maxFontSize: 40,
      fontFamily: '等线',
      fontWeight: '700',
      language: 'zh', // 语言选择：'zh' 中文，'en' 英文
      showCityIndex: false, // 是否在城市名前显示序号
    },
    colorSettings: {
      background: 'rgb(255, 255, 255)',
      palette: ['rgb(31,119,180)', 'rgb(255,127,14)', 'rgb(44,160,44)', 'rgb(214,39,40)'],
      inverted: false,
      // 背景配色模式：'single' 单色，'multi' 复色
      backgroundMode: 'multi',
      // 文字配色模式：'single' 单色，'multi' 复色
      textColorMode: 'multi',
      // 背景复色模式的透明度（0-1）
      backgroundMultiColorOpacity: 0.1,
      // 文字单色模式的颜色
      textSingleColor: 'rgb(0, 0, 0)',
      // 移除 discreteMethod, discreteCount
    },
    lineType: 'Resquarify', // 默认布局方式已调整为Resquarify
    colorNum: 4, // 默认颜色数量
    Colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'], // 简化后保持和palette一致，随palette变
    cloudLoading: false, // 标签云遮罩 loading 状态
    linePanel: {
      type: 'curve', // 默认曲线
      width: 3,
      color: '#aaa'
    },
  }),
  getters: {
    totalCount: (state) => state.poiList.length,
    selectedCount: (state) => state.selectedIds.length,
    visibleList: (state) => {
      if (state.visibleMode === 'selected') {
        return state.poiList.filter((poi) =>
          state.selectedIds.includes(poi.id),
        );
      }
      return state.poiList;
    },
  },
  actions: {
    async loadDefaultData() {
      if (this.dataLoaded) {
        return;
      }
      if (this.dataLoadingPromise) {
        return this.dataLoadingPromise;
      }

      this.dataLoadingPromise = (async () => {
        try {
          const response = await axios.get(DATA_URL, {
            responseType: 'arraybuffer',
          });
          const decoderCandidates = ['gb18030', 'gbk', 'utf-8'];
          let text = null;
          for (const encoding of decoderCandidates) {
            try {
              text = new TextDecoder(encoding, { fatal: false }).decode(response.data);
              if (text && text.trim()) {
                console.info('[poiStore] 使用解码格式', encoding);
                break;
              }
            } catch (decodeError) {
              console.warn('[poiStore] TextDecoder 无法使用', encoding, decodeError);
            }
          }
          if (!text) {
            throw new Error('无法解码 POI 数据');
          }
          const lines = text.split('\n');
          this.allPOI = [];
          this.poiList = [];

          for (let i = 1; i < lines.length; i++) {
            const currentLine = lines[i].split(',');
            if (currentLine.length < 6) continue;

            const pname = currentLine[0];
            const X_gcj02 = parseFloat(currentLine[1]);
            const Y_gcj02 = parseFloat(currentLine[2]);
            const city = currentLine[3];
            const rankInCity = parseInt(currentLine[4]);
            const rankInChina = parseInt(currentLine[5]);
            const name_en = currentLine.length >= 7 ? currentLine[6].trim() : ''; // 读取英文名，如果不存在则为空字符串

            const onePOI = {
              pid: i - 1,
              pname: pname,
              name_en: name_en,
              X_gcj02: X_gcj02,
              Y_gcj02: Y_gcj02,
              lnglat: [X_gcj02, Y_gcj02],
              rankInCity: rankInCity,
              rankInChina: rankInChina,
              city: city,
              selected: false,
              checked: false,
              deleted: false,
            };

            this.allPOI.push(onePOI);

            // 同时添加到poiList（用于兼容）
            this.poiList.push({
              id: onePOI.pid,
              name: onePOI.pname,
              city: onePOI.city,
              rank: onePOI.rankInChina,
              lng: onePOI.X_gcj02,
              lat: onePOI.Y_gcj02,
              selected: false,
            });
          }

          this.dataLoaded = true;
        } catch (error) {
          console.error('加载数据失败:', error);
          throw error;
        } finally {
          this.dataLoadingPromise = null;
        }
      })();

      return this.dataLoadingPromise;
    },
    setHasDrawing(hasDrawing) {
      this.hasDrawing = hasDrawing;
    },
    setUserDrawObj(obj) {
      this.userDrawObj = obj;
    },
    setRoute(route) {
      this.route = route;
    },
    setStartMarker(marker) {
      this.startMarker = marker;
    },
    setEndMarker(marker) {
      this.endMarker = marker;
    },
    setCityOrderAndData(cityOrder, data) {
      this.cityOrder = cityOrder;
      this.compiledData = data;
    },
    clearDrawing() {
      this.hasDrawing = false;
      this.userDrawObj = null;
      this.route = null;
      this.startMarker = null;
      this.endMarker = null;
      this.cityOrder = [];
      this.compiledData = {};
    },
    updateFontLevel(payload) {
      this.fontSettings = {
        ...this.fontSettings,
        ...payload,
      };
    },
    updateColorSettings(payload) {
      this.colorSettings = {
        ...this.colorSettings,
        ...payload,
      };
      // 若 palette 改变，Colors 跟随
      if (payload.palette) {
        // palette 为 ['rgb(r,g,b)', ...]，需转成颜色字符串
        this.Colors = payload.palette.map(rgb => {
          if (rgb.startsWith('rgb')) {
            const rgbArr = rgb.match(/\d+/g);
            if (!rgbArr) return rgb;
            return '#' + rgbArr.map(x => (+x).toString(16).padStart(2,'0')).join('');
          }
          return rgb;
        });
      }
    },
    setCloudLoading(isLoading) {
      this.cloudLoading = isLoading;
    },
    setLayoutType(type) {
      this.lineType = type;
    },
    setLinePanel(panel) {
      this.linePanel = {
        ...this.linePanel,
        ...panel,
      };
    },
  },
});

