import type { StructureBuilder, Point } from './builder';
import { at, BLOCK, MALL, PHASE, TOWER } from './layout';
import { variation } from './rng';

/**
 * 街道家具。
 *
 * 参考图里真正把"微缩"坐实的是这些小东西：灯柱、长椅、遮阳伞、垃圾桶、
 * 指引牌、公交候车亭。它们的数量不多，但每一个都在替场景交代尺度 ——
 * 灯柱 4.6 m 刚好盖住人行道上 28 m 一根的间距，伞下坐得下四个人。
 * 全部合批，整套餐具不到 10 个 draw call。
 */
export function buildProps(b: StructureBuilder) {
  const span = PHASE.props;
  let tick = 0;
  /** 沿 PHASE.props 窗口错开每一件小家具的到位时间，避免"啪"地一下全出现。 */
  const step = () => at(span, 0.02 + ((tick++ * 0.0037) % 0.94));

  /** 把一个家具的局部坐标（绕 Y 轴转 r）换算到世界坐标。 */
  const place = (x: number, z: number, r: number, lx: number, lz: number): [number, number] => [
    x + lx * Math.cos(r) + lz * Math.sin(r),
    z - lx * Math.sin(r) + lz * Math.cos(r),
  ];

  /* ------------------------------------------------------------- 路灯 */
  const lamps: [number, number][] = [];
  for (let x = BLOCK.x0 + 12; x <= BLOCK.x1 - 12; x += 28) {
    lamps.push([x, -108.5]);
    lamps.push([x + 14, 112.5]);
  }
  for (let z = BLOCK.z0 + 12; z <= BLOCK.z1 - 12; z += 28) {
    lamps.push([-126.5, z]);
    lamps.push([136.5, z + 14]);
  }
  for (let i = 0; i < 5; i++) lamps.push([-16 + i * 12, 92]);
  for (let i = 0; i < 4; i++) lamps.push([18, -8 + i * 14]);

  lamps.forEach(([x, z], i) => {
    b.cylinder(0.15, 4.6, [x, 2.64, z], 'steel', step(), { duration: 0.018, lift: 1.1 });
    b.box([1.5, 0.16, 0.2], [x, 4.96, z], 'metal', step(), { duration: 0.014, lift: 0.5, shade: 0.88 });
    b.box([0.95, 0.24, 0.54], [x, 4.86, z], 'glow', at(PHASE.lighting, 0.06 + (i % 22) * 0.032), {
      duration: 0.016,
      lift: 0.05,
      drift: [0, 0, 0],
    });
  });

  /* ------------------------------------------------------------- 长椅 */
  const benches: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) benches.push([-10 + i * 11, 96, 0]);
  for (let i = 0; i < 4; i++) benches.push([-40 + i * 12, 30, Math.PI]);
  for (let i = 0; i < 3; i++) benches.push([112, -10 + i * 18, Math.PI / 2]);
  benches.forEach(([x, z, r]) => {
    const rot: Point = [0, r, 0];
    b.box([2.4, 0.14, 0.62], [x, 0.76, z], 'wood', step(), { r: rot, duration: 0.014, lift: 0.4 });
    const [bx, bz] = place(x, z, r, 0, -0.3);
    b.box([2.4, 0.42, 0.1], [bx, 0.98, bz], 'wood', step(), { r: rot, duration: 0.014, lift: 0.4 });
    for (const s of [-1, 1]) {
      const [lx, lz] = place(x, z, r, s * 0.95, 0);
      b.box([0.1, 0.42, 0.56], [lx, 0.5, lz], 'steel', step(), { r: rot, duration: 0.012, lift: 0.3, shade: 0.9 });
    }
  });

  /* ----------------------------------------------- 咖啡外摆（伞 + 桌椅） */
  // 商场圆弧门厅西南侧的露天座：白色方伞 + 原木桌椅，参考图里就在这个位置。
  const tables: [number, number][] = [
    [-46, 40],
    [-34, 46],
    [-52, 52],
    [-38, 58],
    [-58, 66],
  ];
  tables.forEach(([x, z], i) => {
    b.cylinder(0.07, 2.7, [x, 1.65, z], 'steel', step(), { duration: 0.016, lift: 0.9 });
    b.box([4.2, 0.16, 4.2], [x, 3.02, z], 'white', step(), {
      r: [0, Math.PI / 4, 0],
      duration: 0.02,
      lift: 0.5,
      edge: true,
    });
    b.cylinder(0.62, 0.06, [x, 1.04, z], 'wood', step(), { duration: 0.012, lift: 0.3 });
    b.cylinder(0.08, 0.72, [x, 0.66, z], 'steel', step(), { duration: 0.012, lift: 0.3 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      b.box([0.46, 0.5, 0.46], [x + Math.cos(a) * 1.25, 0.55, z + Math.sin(a) * 1.25], 'wood', step(), {
        r: [0, -a, 0],
        duration: 0.01,
        lift: 0.25,
        shade: 0.94,
      });
    }
  });

  /* ------------------------------------------------- 系柱 / 垃圾桶 / 指引牌 */
  const bollards: [number, number][] = [];
  for (let i = 0; i < 14; i++) bollards.push([-20 + i * 4.4, 26]);
  for (let i = 0; i < 10; i++) bollards.push([22, -30 + i * 4.4]);
  bollards.forEach(([x, z]) => {
    b.cylinder(0.16, 0.95, [x, 0.78, z], 'steel', step(), { duration: 0.012, lift: 0.4 });
    b.cylinder(0.16, 0.1, [x, 1.3, z], 'metal', step(), { duration: 0.01, lift: 0.2 });
  });

  for (const [x, z] of [
    [-18, 44],
    [12, 74],
    [52, 20],
    [-62, 44],
    [100, -14],
    [30, -34],
  ] as [number, number][]) {
    b.box([0.86, 1.1, 0.86], [x, 0.86, z], 'metal', step(), { duration: 0.014, lift: 0.5, shade: 0.82 });
    b.box([0.94, 0.12, 0.94], [x, 1.46, z], 'steel', step(), { duration: 0.012, lift: 0.3 });
  }

  const totems: [number, number, number][] = [
    [-14, 34, 0.4],
    [26, -16, -0.5],
    [86, 6, 1.1],
    [-96, 30, 0.2],
  ];
  totems.forEach(([x, z, r], i) => {
    b.box([1.25, 3.6, 0.34], [x, 2.1, z], 'metal', step(), { r: [0, r, 0], duration: 0.02, lift: 0.9, edge: true });
    const [gx, gz] = place(x, z, r, 0, 0.2);
    b.box([1.05, 2.5, 0.06], [gx, 2.5, gz], 'glowCool', at(PHASE.lighting, 0.4 + i * 0.06), {
      r: [0, r, 0],
      duration: 0.02,
      lift: 0.05,
      drift: [0, 0, 0],
    });
  });

  /* --------------------------------------------------------- 公交候车亭 */
  for (const [x, z, r] of [
    [-8, -108.5, 0],
    [58, 112.5, Math.PI],
  ] as [number, number, number][]) {
    const rot: Point = [0, r, 0];
    b.box([9.5, 0.3, 2.8], [x, 4.0, z], 'white', step(), { r: rot, duration: 0.025, lift: 0.9, edge: true });
    for (const s of [-1, 1]) {
      const [px, pz] = place(x, z, r, s * 4.2, 0);
      b.cylinder(0.14, 3.85, [px, 1.93, pz], 'steel', step(), { duration: 0.018, lift: 0.8 });
    }
    const [bx, bz] = place(x, z, r, 0, -1.2);
    b.box([9.2, 2.6, 0.12], [bx, 1.6, bz], 'glassClear', step(), { r: rot, duration: 0.02, lift: 0.5 });
    const [sx, sz] = place(x, z, r, 0, -1.05);
    b.box([7.4, 0.5, 0.5], [sx, 2.5, sz], 'glowCool', at(PHASE.lighting, 0.62), {
      r: rot,
      duration: 0.02,
      lift: 0.05,
      drift: [0, 0, 0],
    });
    const [wx, wz] = place(x, z, r, 0, -0.9);
    b.box([9.0, 0.16, 1.0], [wx, 0.5, wz], 'wood', step(), { r: rot, duration: 0.014, lift: 0.3 });
  }

  /* --------------------------------------------------------------- 旗杆 */
  for (let i = 0; i < 5; i++) {
    const x = TOWER.podium.cx - 16 + i * 8;
    const z = TOWER.podium.cz + TOWER.podium.d / 2 + 9;
    b.cylinder(0.1, 11.0, [x, 5.8, z], 'metal', step(), { duration: 0.025, lift: 2.0 });
    b.box([0.06, 2.6, 1.7], [x, 9.6, z + 0.86], 'glowCool', at(PHASE.lighting, 0.7 + i * 0.03), {
      duration: 0.02,
      lift: 0.2,
      drift: [0, 0, 0],
      shade: 0.5 + i * 0.08,
    });
  }

  /* ------------------------------------------------------------ 公园雕塑 */
  (
    [
      [-40, 66],
      [-12, 88],
      [-76, 46],
    ] as [number, number][]
  ).forEach(([x, z], i) => {
    const h = 3.4 + variation(i * 6.3) * 2.4;
    b.cylinder(0.42, h, [x, 0.36 + h / 2, z], 'metal', step(), { duration: 0.03, lift: 1.5 });
    b.box([2.8, 0.22, 2.8], [x, 0.36 + h + 0.11, z], 'steel', step(), {
      r: [0, variation(i * 2.1) * Math.PI, 0],
      duration: 0.025,
      lift: 0.6,
    });
  });

  /* ------------------------------------------------------- 屋顶字标 */
  b.box(
    [14, 2.2, 0.6],
    [MALL.main.cx + 6, 26.6, MALL.main.cz + MALL.main.d / 2 - 1],
    'glowCool',
    at(PHASE.lighting, 0.88),
    { duration: 0.03, lift: 0.1, drift: [0, 0, 0], shade: 0.7 },
  );
}
