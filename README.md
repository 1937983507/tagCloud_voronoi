# Voronoi - 地名标签云（tagCloud_voronoi）

本项目作为一个面向空间路径分析的可视化系统，将地名标签、**加权 Voronoi 图剖分**和路线语义紧密耦合，为研究者和数据分析师提供“绘制线路 → 精准筛选 POI → 生成标签云”的一站式工作台。项目在 TreeMap 版本的基础上，引入了 **Weighted Voronoi Diagram + 图着色 + 多层 Canvas 渲染**，以区域面积表达城市权重，并支持语言切换、城市序号展示等高级标签云功能，可应用于空间旅游推荐、交通线路讲解、地理教学、区域热点识别等场景。

---

## 🌐 项目在线访问

本项目已部署在线网站，用户可以直接通过浏览器访问体验完整功能：

🔗 [访问在线网站](https://www.hubutagcloud.cn/voronoi)

无需本地下载或安装，即可进行地名标签云的生成、样式调整等交互操作。

---

## ✨ 特性总览

- **一体化交互流程**：顶部导航、侧边分步面板、内容工作区与标签云画布组成协同布局，辅以 Intro.js 引导降低首次上手成本。
- **高德地图深度整合**：支持手绘折线、自定义起止点、路线规划、热力/点状切换、多底图切换与地点搜索；可从绘制的路径自动感知经过城市。
- **数据管线自动化**：基于 `@turf/turf` 和 GeoJSON 判定路径穿越城市，从 `chinapoi.csv` 中筛选城市景点，并按照全国排名计算城市权重。
- **加权 Voronoi 标签云**：使用加权 Voronoi 图对画布进行剖分，通过迭代优化和权重调整，使每个城市区域面积与其权重成比例，并在区域内进行标签布局。
- **图着色与多层 Canvas 渲染**：基于区域邻接关系进行图着色，确保相邻区域颜色不同；采用 Voronoi 背景层 + 城市连线层 + 词云文字层三层 Canvas 叠加渲染。
- **可视化可编排**：字体（含中文/英文切换、城市序号显示）、配色（单色/复色背景、文字颜色模式）、路径线型均以卡片式面板配置，实时写入 Pinia Store 并驱动画布更新。
- **导出与分享**：支持 PNG/JPEG 导出、画布尺寸可调、Loading 遮罩与多状态提示，适合在汇报、论文和 Demo 中复用（当前版本基于 Canvas，暂不支持 SVG 导出）。

---

## 🛠 技术栈

- **构建工具**：Vite 5 + ESBuild（原生 ESM，秒级冷启动）
- **框架**：Vue 3 `<script setup>` + Pinia（状态管理）
- **UI / 交互**：Element Plus、Intro.js、Sass
- **数据 & 可视化**：Canvas 2D、多层 Canvas 渲染、自研 **加权 Voronoi 生成与迭代优化算法**、图着色算法、@turf/turf
- **地图能力**：高德地图 JSAPI 2.0（AMapLoader，含 ToolBar/HeatMap/MassMarks/Driving 等插件）

依赖与脚本定义见 `package.json`。

---

## 📂 项目结构

```text
tagCloud_voronoi/
├── public/
│   ├── data/               # POI & 行政区数据（CSV / GeoJSON）、城市坐标（cityCoordinates.json）
│   └── img/                # 示例缩略图、起止点图标、LOGO 等
├── src/
│   ├── assets/styles/      # 全局样式 (SCSS)
│   ├── components/
│   │   ├── content/        # PoiMap、LocationGraph 等数据面板
│   │   ├── tagcloud/       # TagCloudCanvas：加权 Voronoi + 词云 + 导出逻辑
│   │   ├── layout|color|typeface|line  # 交互控制面板（布局/配色/字体/线路样式）
│   │   └── layout/HeaderBar、FooterBar、SideMenu…
│   ├── stores/poiStore.js  # Pinia 数据中心（POI 数据、城市顺序、字体/配色/线型配置等）
│   ├── utils/              # GeoJSON Loader、城市名归一化、城市坐标、加权 Voronoi 辅助函数等
│   ├── App.vue / main.js   # 根组件与入口
│   └── ...
├── vite.config.js
└── README.md
```

---

## 🚀 快速开始

1. **准备环境**
   - Node.js ≥ 18（Vite 官方推荐版本）
   - 配置高德 JSAPI 的 Referer 白名单，必要时替换 `PoiMap.vue` 中的 `key`

2. **安装依赖**

   ```bash
   npm install
   ```

3. **本地开发**

   ```bash
   npm run dev
   ```

   - 默认启动在 `http://localhost:5176`
   - 支持 Vite HMR，适合快速迭代前端面板

4. **生产构建 / 预览**

   ```bash
   npm run build
   npm run preview
   ```

---

## 🔧 核心模块说明

| 模块 | 功能摘要 |
| --- | --- |
| `src/App.vue` | 负责整体布局、侧边多面板切换、底部页脚导航，并在首次加载时触发 Intro.js 向导。 |
| `src/components/content/PoiMap.vue` | 封装地图初始化、绘制模式、热力/点图层切换、右键起终点菜单、路线规划以及沿线城市 & POI 的筛选。 |
| `src/stores/poiStore.js` | 统一加载/缓存 CSV POI 数据、记录绘制结果、城市顺序、字体配色参数、标签云 Loading 等信息，实现多组件共享。 |
| `src/components/layout/LayoutPanel.vue` 等 | 将 7 种 TreeMap 算法与视觉参数封装为卡片式选择器，实时写入 `poiStore`。 |
| `src/components/tagcloud/TagCloudCanvas.vue` | 调用 d3 + treemap 算法生成 SVG，并提供导出、画布遮罩、字体权重映射、图形着色和路线叠加等高级功能。 |

---

## 📊 数据与地图资源

- `public/data/chinapoi.csv`：POI 数据源（含地名、经纬度、城市、全国/城市排名）。
- `public/data/shi.js`：城市级 GeoJSON，用于 `PoiMap` 识别折线经过的行政区。
- `public/img/*.png`：TreeMap 示例缩略图、起止点图标、品牌标识。
- **地图 Key**：默认使用演示 Key，请根据部署环境在 `PoiMap.vue` 中替换。

---

## 🖼 效果展示

- **首页** 
  ![首页](./public/img/首页.png)

- **生成标签云**
  ![生成标签云](./public/img/生成标签云.png)

- **字体修改**：
  ![字体修改](./public/img/字体修改.png)

- **切换为英文**：
  ![切换为英文](./public/img/切换为英文.png)

- **配色修改**：
  ![配色修改](./public/img/配色修改.png)


- **线条修改**： 
  ![线条修改](./public/img/线条修改.png)

---

## 🧭 系统工作流

1. **绘制或规划路径**：在地图上通过手绘折线、起止点导航或导入路线完成路径定义，并视 zoom 级别自动切换热力/点图层。
2. **提取 POI 数据**：系统对路径进行抽稀、按城市边界匹配，筛选对应城市的 POI 并计算权重、字号和排序。
3. **配置视觉参数**：在侧边面板依次调整内容展示、字体、配色、TreeMap 布局、路径线型，与标签云画布实时联动。
4. **生成与导出**：点击“运行生成标签云”触发 d3 渲染，可在遮罩消失后预览结果，并选择导出格式及分辨率。

---

## 🧪 调试与测试建议

- 使用浏览器 DevTools 观察 `Pinia` Store 中的 `compiledData`、`cityOrder`，确认路线筛选结果。
- 建议在真实业务数据上线前，替换新的 CSV / GeoJSON，并在 `poiStore` 中增加字段映射。

---

## 👥 团队介绍

我们是 **湖北大学制图组**，由资环学院的 **成晓强导师** 领导。团队研究方向涵盖两个核心领域：

1. **专业热点方向：时空大数据可视化**

   - 利用大数据技术与可视化方法，将地理信息、兴趣点数据与空间分析结果以直观方式呈现。
   - 通过交互式可视化工具（如地名标签云）辅助科研分析、教学演示和数据探索。

2. **专业新兴方向：泛地图学理论与方法**

   - 探索新型地图可视化方法，包括**隐喻地图**和**创新可视化技术**。
   - 致力于将传统地理制图与现代计算可视化结合，推动地图学理论与方法的创新发展。

团队成员来自 **地理学、资源与环境、计算机科学与技术** 等相关专业，我们欢迎本科生、研究生及相关科研人员加入，参与前沿研究、项目开发和学术交流。

实验室官网详细介绍请参阅：
🔗 [湖北大学制图组官网](https://www.hubutagcloud.cn/hubuCartographicGroup)

---

## 💬 用户参与与建议

我们非常欢迎广大用户参与 **fabricTagCloud** 的优化与发展，您的建议与反馈对我们至关重要。

您可以通过以下渠道与我们交流：

- **网站反馈模块**：在网站内填写反馈表单，提交功能或体验建议。
- **电子邮件联系**：向团队邮箱 1937983507@qq.com 发送意见或改进建议。
- **GitHub 提问**：在本项目 GitHub 仓库提交 issue，与团队直接交流和讨论。

我们期待您的宝贵意见，并将持续改进，让 fabricTagCloud 更加高效、直观、易用。

---
## 📜 许可

本项目仅供学习与课题组内部使用，禁止未经授权的商用。
