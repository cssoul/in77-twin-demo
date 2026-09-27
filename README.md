# in77 街区 · 微缩数字孪生

参考一张 Sasaki 风格的轴测分析图，从零用代码建成的可交互 3D 网页。
**所有几何、材质、天空、广告画面全部程序化生成 —— 仓库里没有任何外部模型或纹理文件。**

- 技术栈：Vue 3 + TypeScript + Three.js 0.185 + Vite 8
- 视口：1920×1080，目标稳定 60 FPS（实测达成，见下方读数）
- 地块 256 × 214 m ｜ 塔楼 73 m / 14 层 ｜ 4084 块构件

## 启动

```sh
npm install
npm run dev          # http://127.0.0.1:5273
npm run build        # 产出 dist/
npx vue-tsc --noEmit # 类型检查（strict + noUnusedLocals，必须干净）
```

打开后：拖动旋转、滚轮缩放、右键平移；左下切换**时辰 / 机位 / 图层**，底部播放条控制建造进度。

## 实测读数（1920×1080，Chrome，dpr 1）

| 指标 | 值 |
| --- | --- |
| 绘制调用 | **33**（六机位区间 30–33） |
| 三角面 | **110,724** |
| 构件数 | 4,084 块 |
| 贴图 | 53 |
| 植被 / 行人 / 车辆 | 155 棵 / 190 人 / 48 辆 |
| FPS / DPR / program | **60** / 1 / 19 |
| 阴影更新 | 静止 0 次/秒，建造期 ≤30 次/秒 |
| 关闭动态图层后 | `renderFps: 0`、`idle: true`（静止即停机） |
| 控制台 | 零 error、零 warning |

读数出口：`.stage` 元素的 `dataset.renderStats`（JSON），外部工具直接读属性即可，不必解析界面文本。

## 换广告屏素材

广告屏**默认是程序化画面**。要换成真实图片，把文件放进 `public/`：

| 文件 | 作用 | 建议比例 |
| --- | --- | --- |
| `public/advert.jpg` | 商场弧面上的大广告屏 | **16:9** |
| `public/sign.jpg` | 塔楼裙房的门头灯箱 | 横向长条 |

版式是 **等比缩放 + 居中 + 溢出裁剪**（等价 CSS `object-fit: cover`）：
素材什么比例都不会被拉变形，只会裁掉多出来的边 —— 所以竖幅照片放进去只会保留中间那一条。
文件不存在 / 404 / 解码失败一律**静默回退**到程序化画面，控制台不会报错。

> 弧面屏的贴图坐标是一条开口圆柱的展开面。它的长宽比由 `layout.ts` 的 `SCREEN` 常量
> （弧度 × 半径 ÷ 屏高）决定，画布尺寸从 `SCREEN_ASPECT` 派生。**改屏体尺寸时不要手写画布宽高**，
> 否则画面会被拉伸。用 `public/` 之外的路径也行，改 `src/twin/advert.ts` 里的 `ADVERT_SRC` 即可。

## 坐标真相与改动指引

| 想改什么 | 改哪里 |
| --- | --- |
| 地块尺寸、道路、建筑体量、水景、公园、人流动线、**建造时序总谱** | `src/twin/layout.ts` —— 全场景唯一的坐标真相 |
| 表面清单、色板、程序化纹理、天空环境贴图、广告画面 | `src/twin/materials.ts`（+ `advert.ts`） |
| 一天四时（天空 stop / 五盏灯 / 曝光 / 室内灯光系数） | `src/twin/daylight.ts` |
| 商场裙房（竖向标高表 `Y` 是它的总开关） | `src/twin/mall.ts` |
| 塔楼（层数 `mainFloors` / `wingFloors` 驱动幕墙波次） | `src/twin/tower.ts`、`layout.ts` 的 `TOWER` |
| 六个机位 | `src/twin/scene.ts` 的 `PRESETS`（正交投影，见下） |
| 界面文案 / 控件 | `src/App.vue`、`src/style.css` |

**子系统**：`ground` 基座 · `roads` 路网标线 · `mall` 商业裙房 · `tower` 塔楼 · `bridge` 空中连廊 ·
`plaza` 广场与水景 · `park`+`landscape` 绿地与植被 · `props` 街道家具 · `flow` 人流动线与车流 ·
`skyline` 背景城市 · `ribbon` 三角带工具 · `builder` 合批引擎。

### 相机是正交投影

参考图是平行投影的轴测图（竖线严格垂直、远近同尺度），所以这里用 `OrthographicCamera`。
机位表仍然只写 `position / target`，视口高度由**等效透视 fov 26°** 反解：

```
frameHeight = 2 × |position − target| × tan(13°)
```

所以换机位不需要重新试参数 —— 改 `position` / `target` 即可，距离自动决定取景范围。
推拉镜头走 `controls.zoom`（正交相机下 `min/maxDistance` 无效，用的是 `min/maxZoom`）。

### 性能结构（为什么能到 33 个 draw call）

1. **按材质合批**：`StructureBuilder` 把同材质的几千块几何 `mergeGeometries` 成 1 个 Mesh —— 每材质 1 个 draw call。
2. **建造时序烘进顶点属性**：`aBuild=(start,duration,lift)` + `aOffset=方向`，位移在顶点着色器里做，
   构件**永远不透明、永远实体**，只做位移（不是 alpha 淡入）。
3. **阴影深度材质同步注入**：`customDepthMaterial` 共用同一套位移，影子不会提前到位。
4. **需求渲染 + 阴影节流**：`shadowMap.autoUpdate = false`，静止即停机。
5. **自适应分辨率**：帧时 >21 ms 降 DPR，<13.5 ms 升回。
6. **不透明镜面玻璃**：避开几百块玻璃扇的透明排序，同时拿到干净天空反射。
7. **接触阴影替代实时叶影**：树的影子是贴地暗斑（InstancedMesh），把阴影贴图解放出来。

## 遗留限制

- **车流不做避让**：车辆沿固定环线匀速行驶，不刹车、不变道、不排队。
- **行人不成群**：190 个实例各自走固定路径，没有相互避让或聚集行为。
- **绿植是单株尺度**：树冠为低模球体，不做季节变化与落叶。
- **阴影贴图只覆盖街区**：背景底噪城市刻意不投影（3072²、半幅 190 m），把精度留给主体。
- **四时是预设不是物理**：`daylight.ts` 是四套手调参数，不做太阳位置驱动的连续插值。
- 唯一的运行时外部输入是 `public/` 下的可选广告素材，其余零外部依赖。

## 视觉验收

`scripts/shoot.sh` 从运行中的 dev server 抓图并回读性能：

```sh
scripts/shoot.sh <进度0-1000> <输出.png> [宽] [高] [时辰] [机位]
scripts/shoot.sh 1000 shots/axo.png 1920 1080 黄昏 轴测
scripts/shoot.sh 320  shots/build.png 1920 1080 "" 轴测
```

脚本会隐藏浮层、暂停播放、seek 到指定进度、切机位与时辰，然后截图 + 打印 `renderStats` + 打印控制台。
`shots/` 里是各机位与时辰的实拍。

> 注意进度条 input 的 `min/max` 是 `0–1`（不是 0–1000），脚本内部会换算 —— 直接把 `520`
> 塞进去会被静默夹到 `1`，截出来的是建成态。
