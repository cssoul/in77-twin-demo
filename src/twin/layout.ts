/**
 * 总平面 —— 全场景唯一的坐标真相。
 *
 * 世界单位 = 米。X 向东，Z 向南，Y 向上。原点在街区几何中心。
 * 后续任何模块（道路 / 商场 / 塔楼 / 连廊 / 广场 / 绿化 / 道具）都只从
 * 这里取数，不允许各自硬编码坐标 —— 改一个常量，全场景跟着走。
 */

export const GROUND = { half: 250 };

/** 道路断面。 */
export const ROAD = { width: 30, walk: 12, kerb: 0.3 };

/** 道路中心线。 */
export const ROADS = {
  north: -132,
  south: 136,
  west: -150,
  east: 160,
};

/** 街区内部（人行道内侧）的可建设用地范围。 */
export const BLOCK = {
  x0: ROADS.west + ROAD.width / 2 + ROAD.walk,
  x1: ROADS.east - ROAD.width / 2 - ROAD.walk,
  z0: ROADS.north + ROAD.width / 2 + ROAD.walk,
  z1: ROADS.south - ROAD.width / 2 - ROAD.walk,
};

/**
 * 西侧商业裙房（白色体量 + 东南圆角）。
 *
 * 平面刻意做成"接近方形、体量厚" —— 第一版做成 70×56 的扁盒子，轴测视角下
 * 屋面占掉一半画面，整栋楼读成仓库。百货公司的屋顶面积不该是立面的两倍。
 */
export const MALL = {
  main: { cx: -58, cz: -10, w: 56, d: 46, h: 28 },
  west: { cx: -100, cz: -52, w: 34, d: 44, h: 15 },
  arc: { cx: -30, cz: 13, r: 20, h: 28 },
  floorH: 5.4,
  parapet: 1.6,
};

/**
 * 弧面上的广告屏。它是一段**开口圆柱**，只有展开后才是平面。
 *
 * 展开尺寸 = 弧度 × 半径 ≈ 17.0 m 宽，屏高 9.6 m —— 比例固定 **16:9**。
 *
 * 画布比例必须等于这个数，否则贴上去还是拉伸的：早先屏体是 66° / 7.4 m
 * （3.26:1），配的却是 4:3 的画布，画面被横向拉宽了 2.4 倍，人脸是扁的。
 * 现在把比例固化成常量，画布尺寸、素材裁剪全部由它派生。
 */
export const SCREEN = {
  radius: MALL.arc.r + 0.94,
  sweep: (46.5 * Math.PI) / 180,
  height: 9.6,
} as const;
/** 屏体展开后的宽高比（≈1.77）。贴图按它画 / 裁。 */
export const SCREEN_ASPECT = (SCREEN.sweep * SCREEN.radius) / SCREEN.height;

/** 东侧塔楼：裙房 + 主塔 + 侧翼。 */
export const TOWER = {
  podium: { cx: 64, cz: -58, w: 62, d: 48, h: 19 },
  main: { cx: 58, cz: -56, w: 34, d: 30, h: 44 },
  wing: { cx: 85, cz: -68, w: 20, d: 22, h: 34 },
  mainFloors: 14,
  wingFloors: 10,
  floorH: 3.9,
  slabBand: 0.62,
  glassIn: 0.26,
  mullion: 0.16,
};

/**
 * 空中连廊：商场东北角 → 塔楼裙房西北侧。
 *
 * 端点是**反解出来的**，不是随手拖的坐标。约束有三条：
 *  1. 商场端要穿过商场主体的东立面（`x = MALL.main.cx + MALL.main.w/2 = -30`）
 *     并深入 ≥11 m，否则桥"停在墙外"，轴测下会看到一条缝；
 *  2. 塔楼端要穿进裙房西立面（`x = TOWER.podium.cx - TOWER.podium.w/2 = 33`）≥5 m；
 *  3. **桥的方位角必须比 28° 更陡**。桥宽 7 m，半宽 3.5 m，穿墙时桥身在
 *     竖直方向的展开量是 ±3.5·cos(方位角)。方位角再平一点（原来的 -23°），
 *     桥身下缘就会从商场北立面（`z = -33`）外侧掠过去 —— 看起来是
 *     "贴着角走过去"，而不是"插进建筑里"。
 *
 * 移动端点之后，桥墩（按跨长比例定位）和立面套口（按立面求交）都会自动跟着走。
 */
export const BRIDGE = {
  from: [-40, -21] as [number, number],
  to: [38, -62.5] as [number, number],
  deck: 14,
  width: 7,
  height: 3.8,
  pierRadius: 1.5,
};

/** 圆形下沉广场与喷泉。 */
export const FOUNTAIN = {
  cx: 34,
  cz: 44,
  outer: 28,
  rings: [22.5, 17.5, 12.5, 8.5, 5.0],
  basin: 3.4,
  sculpture: 0,
};

/** 西南侧公园绿地。四边各留出 6 m 以上，人行流线才有地方贴边绕过去。 */
export const PARK = { cx: -40, cz: 62, w: 92, d: 74 };

/** 广场精细铺装的覆盖范围：整个街区内部，1 块 6 m 花岗岩大板。 */
export const PLAZA = { x0: BLOCK.x0, x1: BLOCK.x1, z0: BLOCK.z0, z1: BLOCK.z1, tile: 6 };

/** 单体占位判定：铺装板与绿化在此范围内让位。 */
const FOOTPRINTS: { x0: number; x1: number; z0: number; z1: number }[] = [
  box2d(MALL.main),
  box2d(MALL.west),
  { x0: MALL.arc.cx - MALL.arc.r, x1: MALL.arc.cx + MALL.arc.r, z0: MALL.arc.cz - MALL.arc.r, z1: MALL.arc.cz + MALL.arc.r },
  box2d(TOWER.podium),
];

function box2d(b: { cx: number; cz: number; w: number; d: number }) {
  return { x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2 };
}

export function insideBuilding(x: number, z: number, pad = 0.6) {
  for (const f of FOOTPRINTS) {
    if (x >= f.x0 - pad && x <= f.x1 + pad && z >= f.z0 - pad && z <= f.z1 + pad) return true;
  }
  return false;
}

export function insideFountain(x: number, z: number, pad = 0.4) {
  return Math.hypot(x - FOUNTAIN.cx, z - FOUNTAIN.cz) <= FOUNTAIN.outer + pad;
}

export function insidePark(x: number, z: number, pad = -0.5) {
  return (
    x >= PARK.cx - PARK.w / 2 + pad &&
    x <= PARK.cx + PARK.w / 2 - pad &&
    z >= PARK.cz - PARK.d / 2 + pad &&
    z <= PARK.cz + PARK.d / 2 - pad
  );
}

/* ------------------------------------------------------------------ 流线 */

export type FlowPath = {
  id: string;
  label: string;
  width: number;
  closed?: boolean;
  points: [number, number][];
};

/** 生成一圈点，供闭合流线使用。 */
function ringPoints(cx: number, cz: number, r: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/**
 * 人流动线。参考图里那些橙红色宽带就是它们 —— 是这个场景里唯一"解释功能"
 * 的图面语言，也是数字孪生所谓"运行"的部分：带宽代表流量，纹理流动代表方向。
 *
 * 每一条都贴着真实的界面走：商场弧面门厅外周、两栋楼之间的主通道、塔楼裙房
 * 沿街面、以及街区南北两条人行带。**不要**凭空画弧线，那会读成装饰。
 */
export const FLOW_PATHS: FlowPath[] = [
  {
    id: 'mall-front',
    label: '商场前区',
    width: 6.6,
    // 从西侧人行道沿商场南立面绕到弧面门厅外，再汇入广场。
    points: [
      [-116, 24],
      [-88, 28],
      [-60, 33],
      [-40, 41],
      [-18, 52],
      [4, 66],
      [22, 82],
    ],
  },
  {
    id: 'spine',
    label: '中央主轴',
    width: 7.6,
    // 商场弧面门厅 → 塔楼裙房南门，是全场唯一一条两个主力店之间的直接联系。
    points: [
      [-10, 34],
      [6, 24],
      [26, 10],
      [44, -6],
      [58, -22],
      [66, -33],
    ],
  },
  {
    id: 'tower-front',
    label: '塔楼前区',
    width: 6.2,
    points: [
      [18, -34],
      [40, -30],
      [64, -29],
      [88, -32],
      [104, -22],
      [110, 2],
      [104, 26],
      [86, 40],
    ],
  },
  {
    id: 'north-band',
    label: '北侧人流带',
    width: 5.4,
    points: [
      [-116, -99],
      [-56, -98],
      [4, -97],
      [58, -97],
      [112, -98],
      [128, -97],
    ],
  },
  {
    id: 'south-band',
    label: '南侧人流带',
    width: 5.4,
    points: [
      [-116, 105],
      [-56, 104],
      [4, 103],
      [58, 101],
      [110, 99],
      [128, 95],
    ],
  },
  {
    id: 'fountain-ring',
    label: '水景环廊',
    width: 5.0,
    closed: true,
    points: ringPoints(34, 44, 33, 16),
  },
];

/* ------------------------------------------------------------ 时序总谱 */

/**
 * 建造时序总谱，区间是 progress 的 [start, end]。**允许重叠** —— 真实工地
 * 边浇核心筒边收裙房，不重叠会像幻灯片。两条硬约束：
 *   1. 承重先于被承重（楼板早于玻璃）；
 *   2. 上层楼板落在下层结构上，未装幕墙的楼层永远"有顶有底"。
 */
export const PHASE = {
  ground: [0.0, 0.045],
  skyline: [0.02, 0.16],
  roads: [0.05, 0.16],
  mall: [0.13, 0.36],
  mallFacade: [0.3, 0.52],
  tower: [0.22, 0.5],
  curtain: [0.42, 0.72],
  plaza: [0.1, 0.24],
  fountain: [0.16, 0.3],
  bridge: [0.58, 0.72],
  park: [0.66, 0.8],
  props: [0.74, 0.9],
  lighting: [0.84, 0.995],
} as const;

export type PhaseName = keyof typeof PHASE;
export const at = (span: readonly [number, number], u: number) =>
  span[0] + (span[1] - span[0]) * u;
