/**
 * 一天四时。
 *
 * 一个时辰**不是**套在同一个渲染结果上的滤镜，而是四套必须彼此自洽的装置：
 *   1. equirect 天空 —— 它同时是背景、又是幕墙唯一要去反射的东西；
 *   2. 方向光组 —— 太阳在哪、多暖、多强；
 *   3. **室内灯光系数** `interior` —— 真正卖时辰的是它：中午这栋楼是封闭体量，
 *      夜里它是一盏灯。
 *
 * ## 渐变 stop 放在哪，由相机决定，不能凭眼睛调
 *
 * equirect 的 `v = 0.5 − 仰角/180`。本工程默认轴测机位俯角约 33°、竖直 fov 26°，
 * 画面上边缘大约在仰角 +1°、下边缘约 −46°，也就是说**可见天空只有
 * v ∈ [0.47, 0.50] 这一条极窄的带**，沙盘机位拉远后才会扩到 v ≈ 0.44。
 * 所以每一档里所有起区分作用的 stop 都压在 0.44–0.62 之间，这个区间之外
 * 的 stop 只为了球面接缝不露馅。
 *
 * 暖色带一律压在 v ≈ 0.494 附近：再往上就是玻璃最可能在反射的位置，
 * 暖色反射读成"日落明信片"，蓝色调就没了。
 *
 * ## 天空贴图只做一件事：喂 PMREM
 *
 * 这张 equirect 的用途是**环境反射**（幕墙在反射什么），不是背景。盘外那一圈
 * 由 `surround` 纯色负责，理由见该字段的注释 —— 贴图背景在正交相机下既看不见
 * （背景 cube 网格是 1 个单位、正交下只有几个像素），又会把清屏色搞坏。
 */

export type TimeId = 'morning' | 'noon' | 'dusk' | 'night';

/** `[v, cssColor]` 对，用于竖直 equirect 渐变。 */
export type SkyStops = readonly (readonly [number, string])[];

export type SkySpec = {
  stops: SkyStops;
  /** 城市光晕：`[xPx, 半径Px, alpha]`，会被压扁 Y 轴绘制。 */
  glows: readonly (readonly [number, number, number])[];
  /** 云带 alpha 倍率。夜里几乎没有。 */
  cloud: number;
  /** 云的颜色，`r,g,b`。 */
  cloudTint: string;
};

export type LightRig = {
  hemi: { sky: string; ground: string; intensity: number };
  key: { color: string; intensity: number; position: [number, number, number] };
  fill: { color: string; intensity: number };
  rim: { color: string; intensity: number };
  bounce: { color: string; intensity: number };
};

export type DayPreset = {
  id: TimeId;
  label: string;
  caption: string;
  sky: SkySpec;
  rig: LightRig;
  exposure: number;
  /**
   * 盘外那一圈的颜色（"沙盘下的那张纸"），**不是**天空贴图。
   *
   * 这里必须是一个显式的纯色，原因见 `scene.ts` 的 `applyTime`：three 的
   * `WebGLShadowMap` 与 equirect→cubemap 转换都会改写 GL 清屏色且不还原，而
   * 贴图背景自己从不写清屏色 —— 把背景交给贴图，盘外那圈就成了"谁最后动过
   * 清屏色就是谁的颜色"，实测会永久塌成纯黑。
   *
   * 正交投影下所有视线彼此平行，无穷远天空本来就只对应**一个**方向，所以纯色
   * 与 equirect 天空在这一圈上的结果完全等价，不是降级。
   */
  surround: string;
  environmentIntensity: number;
  /** 乘在每一种自发光材质的 `emissiveIntensity` 上。 */
  interior: number;
};

export const TIMES: readonly DayPreset[] = [
  {
    id: 'morning',
    label: '早晨',
    caption: '东面初照，玻璃先醒，石材还留着一层青。',
    sky: {
      // 低角度暖阳在一侧，头顶仍是冷蓝。七点钟是**雾**在做功，不是饱和度。
      //
      // 地平线**以下**一律是亮灰，不是黑：沙盘是有边的，盘外那圈直接暴露
      // 下半天球。它同时还是镜面玻璃的下半反射 —— 下半黑掉，玻璃就整片发黑。
      stops: [
        [0.0, '#2f6096'],
        [0.2, '#4a7cab'],
        [0.35, '#82a9c6'],
        [0.43, '#a9c4d4'],
        [0.468, '#d6ddd9'],
        [0.494, '#e6c79c'],
        [0.506, '#eae4da'],
        [0.52, '#d9dbdf'],
        [0.58, '#c8ccd1'],
        [0.74, '#b5bac0'],
        [1.0, '#a4aab0'],
      ],
      glows: [
        [300, 200, 0.2],
        [820, 150, 0.11],
      ],
      cloud: 0.85,
      cloudTint: '230,218,208',
    },
    rig: {
      hemi: { sky: '#93b3d2', ground: '#6d5d4b', intensity: 0.6 },
      key: { color: '#ffdcb2', intensity: 1.05, position: [-190, 96, 150] },
      fill: { color: '#a8c4dc', intensity: 0.36 },
      rim: { color: '#ffd0a0', intensity: 0.42 },
      bounce: { color: '#ffbe86', intensity: 0.18 },
    },
    exposure: 0.98,
    // 清晨的空气是白的，纸就比正午略冷一档。
    surround: '#e9eef2',
    environmentIntensity: 0.8,
    interior: 0.3,
  },
  {
    id: 'noon',
    label: '中午',
    caption: '顶光之下，体量只剩阴影在说话 —— 这是那张轴测图的光。',
    sky: {
      // 完全没有暖带：正午的雾是白的，不是金的。这一档的地平线特征是**去饱和**。
      // 但蓝必须一直压到 0.47，否则整片可见天空被漂白，读起来像阴天而不是正午。
      //
      // 地平线以下同样是亮灰：参考图里盘外就是一张白纸，沙盘才有"模型"的读法。
      stops: [
        [0.0, '#1a4a86'],
        [0.2, '#2b66a6'],
        [0.33, '#4688bf'],
        [0.42, '#74a9d3'],
        [0.458, '#9cbfdf'],
        [0.482, '#c8dbea'],
        [0.496, '#e8eff3'],
        [0.506, '#f0f3f4'],
        [0.522, '#e0e4e7'],
        [0.58, '#cdd2d7'],
        [0.74, '#bac0c6'],
        [1.0, '#a9afb6'],
      ],
      glows: [],
      cloud: 0.7,
      cloudTint: '255,255,255',
    },
    rig: {
      // 补光偏冷一点即可，别太蓝：整片白色石材的基调由半球光和补光一起定，
      // 补光一旦发蓝，白模型就会读成"阴天"。
      hemi: { sky: '#cdd9e2', ground: '#9a9184', intensity: 0.88 },
      key: { color: '#fff7ea', intensity: 1.46, position: [-140, 300, 160] },
      fill: { color: '#b8c6d2', intensity: 0.44 },
      rim: { color: '#f6faff', intensity: 0.24 },
      bounce: { color: '#dcd8cc', intensity: 0.12 },
    },
    exposure: 1.0,
    // 纯白。参考图里盘外就是一张白纸，沙盘才有"模型"的读法 —— 这一档不许改。
    surround: '#ffffff',
    environmentIntensity: 0.95,
    // 窗全关：楼是一个封闭的石材与玻璃物体。
    interior: 0.0,
  },
  {
    id: 'dusk',
    label: '黄昏',
    caption: '白天是石头的体量，入夜是光的容器。',
    sky: {
      stops: [
        [0.0, '#0a1530'],
        [0.19, '#10264d'],
        [0.32, '#1e4070'],
        [0.41, '#2e5a86'],
        [0.455, '#44709a'],
        [0.478, '#6d8ca6'],
        [0.492, '#9ba1a4'],
        [0.503, '#c99c74'],
        [0.514, '#8c7258'],
        [0.536, '#615a51'],
        [0.62, '#514f4a'],
        [0.78, '#434342'],
        [1.0, '#353637'],
      ],
      glows: [
        [300, 220, 0.28],
        [820, 160, 0.17],
      ],
      cloud: 0.45,
      cloudTint: '206,150,140',
    },
    rig: {
      hemi: { sky: '#3a547c', ground: '#3d3429', intensity: 0.4 },
      key: { color: '#b8cce0', intensity: 0.7, position: [-200, 240, 180] },
      fill: { color: '#7189ab', intensity: 0.36 },
      // 暖轮廓光要明显低于冷主光，否则白色石材整体偏米黄，
      // "冷调外立面 vs 暖调内透"的张力就没了。
      rim: { color: '#ffc48c', intensity: 0.44 },
      bounce: { color: '#ffab68', intensity: 0.26 },
    },
    exposure: 1.1,
    // 暮色纸：跟着天顶往下压，但比夜浅一档，白天的模型残影还留得住。
    surround: '#39414d',
    environmentIntensity: 0.85,
    interior: 1.0,
  },
  {
    id: 'night',
    label: '夜晚',
    caption: '幕墙沉入夜色，只剩内透在排布整条街。',
    sky: {
      // 深靛蓝，而且是唯一一档**强**城市光晕：没有太阳以后，地平线上的
      // 光污染就是全部的天际线线索。
      //
      // 注意地平线那几个 stop。更早一版用了偏紫的 #57485a，石材回来是
      // rgb(61,43,48) —— 绿同时低于红和蓝，也就是品红。夜里石材的亮度大头
      // 来自环境，一条紫地平线会把整圈立面重刷一遍。
      // 城市光晕是橙的，所以这条带必须带绿通道。
      stops: [
        [0.0, '#050b1c'],
        [0.2, '#081530'],
        [0.32, '#0d1e42'],
        [0.42, '#12274e'],
        [0.462, '#17305c'],
        [0.486, '#263c64'],
        [0.498, '#414a5c'],
        [0.509, '#624d3f'],
        [0.522, '#3d332b'],
        [0.556, '#2e2d2d'],
        [0.68, '#26272a'],
        [0.82, '#1f2024'],
        [1.0, '#181a1e'],
      ],
      glows: [
        [300, 240, 0.38],
        [820, 170, 0.25],
      ],
      cloud: 0.1,
      cloudTint: '150,170,196',
    },
    rig: {
      // 夜晚是**重新配平成冷调**，不只是变暗。只有方向光时没办法把商铺光晕
      // 局部聚起来，所以暖色主导的灯组会把整个立面染成品红、石材读起来像 LED。
      // 让冷的一半赢，立面才是蓝灰的，暖色交给窗户自己发。
      hemi: { sky: '#243a62', ground: '#201c16', intensity: 0.28 },
      key: { color: '#8098c0', intensity: 0.3, position: [-200, 240, 180] },
      fill: { color: '#486490', intensity: 0.22 },
      rim: { color: '#ffc48c', intensity: 0.22 },
      bounce: { color: '#ffb070', intensity: 0.24 },
    },
    exposure: 1.26,
    // 夜纸：深靛蓝而非纯黑。夜里模型自己就是光源，纸必须沉下去才衬得出内透；
    // 但**不能是纯黑** —— 纯黑是"什么都没画"的读法，会把整幅画读成崩掉。
    surround: '#171a22',
    // 夜空本身是暗立面的主要环境光，而那条环境光是压在地平线上的一抹色调。
    // 刻意压低。
    environmentIntensity: 0.46,
    interior: 1.12,
  },
];

export const DEFAULT_TIME: TimeId = 'noon';

export function presetOf(id: TimeId): DayPreset {
  return TIMES.find((t) => t.id === id) ?? TIMES[1];
}
