import * as THREE from 'three';
import type { StructureBuilder } from './builder';
import { at, MALL, PHASE, SCREEN } from './layout';
import { variation } from './rng';

/** 竖向标高表。改层高 / 层数只动这里，其余全部派生。 */
const BASE = 0.9; // 台基顶面 = 裙房首层楼面
const L1 = 6.4; // 首层通高
const SLAB = 0.9; // 楼板带
const RIBBON = 3.4; // 玻璃带
const UPPER = 11.0; // 顶部实墙
const PARAPET = 1.6;

const Y = {
  plinth0: 0.3,
  plinth1: BASE,
  gf0: BASE,
  gf1: BASE + L1,
  band0: BASE + L1,
  band1: BASE + L1 + SLAB,
  ribA0: BASE + L1 + SLAB,
  ribA1: BASE + L1 + SLAB + RIBBON,
  band2: BASE + L1 + SLAB + RIBBON,
  band3: BASE + L1 + 2 * SLAB + RIBBON,
  ribB0: BASE + L1 + 2 * SLAB + RIBBON,
  ribB1: BASE + L1 + 2 * SLAB + 2 * RIBBON,
  band4: BASE + L1 + 2 * SLAB + 2 * RIBBON,
  band5: BASE + L1 + 3 * SLAB + 2 * RIBBON,
  roof: BASE + L1 + 3 * SLAB + 2 * RIBBON + UPPER,
  parapetTop: BASE + L1 + 3 * SLAB + 2 * RIBBON + UPPER + PARAPET,
};

const mid = (a: number, b: number) => (a + b) / 2;

/**
 * 西侧商业裙房。参考图里它是这样一个东西：一个方正的白色体量，在面向广场的
 * 东南角被削成一个圆弧，圆弧上挂着一整面广告屏；立面是"首层通高玻璃 + 两条
 * 横向玻璃带 + 一大片空白白墙"的三段式，顶上压一圈女儿墙，屋面是设备平台。
 *
 * 全部构件都走 builder，于是整栋楼只占几个 draw call，而且和塔楼共用一条
 * 建造时序 —— 它是"逐块码上去"的，不是整体缩放出来的。
 */
export function buildMall(b: StructureBuilder) {
  const shell = PHASE.mall;
  const facade = PHASE.mallFacade;
  const m = MALL.main;
  const a = MALL.arc;

  band(b, m, shell, facade);
  arcVolume(b, a, shell, facade);
  westAnnex(b, MALL.west, shell, facade);
  entrance(b, facade);
}

/* ------------------------------------------------------------------ 主体 */

function band(b: StructureBuilder, m: typeof MALL.main, shell: readonly [number, number], facade: readonly [number, number]) {
  const [x0, x1] = [m.cx - m.w / 2, m.cx + m.w / 2];
  const [z0, z1] = [m.cz - m.d / 2, m.cz + m.d / 2];

  // 台基
  b.box([m.w + 3.2, Y.plinth1 - Y.plinth0, m.d + 3.2], [m.cx, mid(Y.plinth0, Y.plinth1), m.cz], 'stone', at(shell, 0.02), {
    duration: 0.04,
    lift: 0.5,
    shade: 0.92,
  });

  // 上部实体白墙：一片空白，正是参考图里最抢眼的那块"没有窗的墙"。
  b.box([m.w, Y.roof - Y.ribB1, m.d], [m.cx, mid(Y.ribB1, Y.roof), m.cz], 'white', at(shell, 0.74), {
    duration: 0.03,
    lift: 0.9,
    edge: true,
  });

  // 两条横向玻璃带（微微挑出墙面 0.15，才有"带子"的厚度）
  for (const [y0, y1, u] of [
    [Y.ribA0, Y.ribA1, 0.56],
    [Y.ribB0, Y.ribB1, 0.66],
  ] as [number, number, number][]) {
    b.box([m.w + 0.3, y1 - y0, m.d + 0.3], [m.cx, mid(y0, y1), m.cz], 'glassMall', at(facade, u), {
      duration: 0.03,
      lift: 0.7,
      drift: [0.3, 1, 0.3],
    });
  }

  // 楼板带：挑出 0.35，玻璃带才有上下的"压边"
  for (const [y0, y1, u] of [
    [Y.band0, Y.band1, 0.06],
    [Y.band2, Y.band3, 0.4],
    [Y.band4, Y.band5, 0.5],
  ] as [number, number, number][]) {
    b.box([m.w + 0.7, y1 - y0, m.d + 0.7], [m.cx, mid(y0, y1), m.cz], 'white', at(facade, u), {
      duration: 0.022,
      lift: 0.6,
    });
  }

  // 首层：内退 0.6 的通高玻璃 + 身后一片暗内胆（夜里靠灯带透出来）
  b.box([m.w - 1.2, Y.gf1 - Y.gf0, m.d - 1.2], [m.cx, mid(Y.gf0, Y.gf1), m.cz], 'concreteDeep', at(shell, 0.86), {
    duration: 0.03,
    lift: 0.4,
    shade: 0.46,
  });
  b.box([m.w - 0.9, Y.gf1 - Y.gf0, m.d - 0.9], [m.cx, mid(Y.gf0, Y.gf1), m.cz], 'glassMall', at(facade, 0.14), {
    duration: 0.03,
    lift: 0.5,
    drift: [0.4, 0.6, 0.4],
  });

  // 竖梃。沿四条边按 4 m 一根排，间距由 face 长度派生，不手工数。
  for (const face of faces(x0, x1, z0, z1)) {
    for (let t = 0.0; t <= 1.0001; t += 1 / Math.max(1, Math.round(face.len / 4))) {
      vertical(b, face, t, Y.ribA0, Y.ribA1, 0.16, 'metal', facade, 0.18);
      vertical(b, face, t, Y.ribB0, Y.ribB1, 0.16, 'metal', facade, 0.3);
    }
    for (let t = 0.0; t <= 1.0001; t += 1 / Math.max(1, Math.round(face.len / 3.2))) {
      vertical(b, face, t, Y.gf0, Y.gf1, 0.2, 'metal', facade, 0.04);
    }
  }

  // 女儿墙：略微出挑，压住整栋楼
  b.box([m.w + 0.9, PARAPET, m.d + 0.9], [m.cx, mid(Y.roof, Y.parapetTop), m.cz], 'white', at(shell, 0.9), {
    duration: 0.03,
    lift: 0.8,
    edge: true,
  });
  b.box([m.w - 0.4, 0.12, m.d - 0.4], [m.cx, Y.parapetTop + 0.06, m.cz], 'white', at(shell, 0.94), {
    duration: 0.02,
    lift: 0.3,
    shade: 0.88,
  });

  // 屋面：砾石平台 + 设备房 + 风冷机组
  b.plate(m.w - 1.4, m.d - 1.4, [m.cx, Y.roof + 0.04, m.cz], 'roof', at(shell, 0.86), { duration: 0.04, lift: 0.3 });
  const units: [number, number, number, number][] = [
    [-18, -12, 9, 5],
    [-6, -13, 7, 4.4],
    [8, -11, 6, 4.4],
    [-14, 8, 7, 3.6],
    [4, 9, 5.4, 3.6],
  ];
  units.forEach(([dx, dz, w, d], i) => {
    const h = 2.0 + variation(i * 3.7) * 1.4;
    b.box([w, h, d], [m.cx + dx, Y.roof + h / 2 + 0.1, m.cz + dz], 'white', at(shell, 0.9 + i * 0.008), {
      duration: 0.02,
      lift: 1.4,
      edge: true,
    });
    b.box([w - 1.2, 0.2, d - 1.2], [m.cx + dx, Y.roof + h + 0.2, m.cz + dz], 'metal', at(shell, 0.93), {
      duration: 0.015,
      lift: 0.3,
      shade: 0.9,
    });
  });
  // 楼梯出屋面
  b.box([6.4, 4.2, 5.2], [m.cx + 20, Y.roof + 2.1 + 0.1, m.cz + 12], 'white', at(shell, 0.92), {
    duration: 0.025,
    lift: 1.6,
    edge: true,
  });
}

/* ------------------------------------------------------------ 东南圆弧 */

function arcVolume(
  b: StructureBuilder,
  a: typeof MALL.arc,
  shell: readonly [number, number],
  facade: readonly [number, number],
) {
  const c: [number, number, number] = [a.cx, 0, a.cz];
  const shellCyl = (y0: number, y1: number, r: number, material: Parameters<StructureBuilder['add']>[1], start: number, open = true, shade = 1) => {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, 48, 1, open);
    b.add(g, material, start, { p: [c[0], mid(y0, y1), c[2]], shade });
    g.dispose();
  };

  // 上部实体圆柱：一片白，和方形体量在角上咬合成一个圆角
  shellCyl(Y.band1, Y.roof, a.r + 0.1, 'white', at(shell, 0.76));

  // 两条玻璃带 + 三道楼板带，半径逐层外扩，形成横向分层的读法
  shellCyl(Y.ribA0, Y.ribA1, a.r + 0.22, 'glassMall', at(facade, 0.58));
  shellCyl(Y.ribB0, Y.ribB1, a.r + 0.22, 'glassMall', at(facade, 0.7));
  for (const [y0, y1, u] of [
    [Y.band0, Y.band1, 0.08],
    [Y.band2, Y.band3, 0.42],
    [Y.band4, Y.band5, 0.52],
  ] as [number, number, number][]) {
    shellCyl(y0, y1, a.r + 0.5, 'white', at(facade, u));
  }

  // 首层：玻璃圆筒 + 暗内胆
  shellCyl(Y.gf0, Y.gf1, a.r - 0.4, 'concreteDeep', at(shell, 0.88), false, 0.46);
  shellCyl(Y.gf0, Y.gf1, a.r + 0.02, 'glassMall', at(facade, 0.16));

  // 圆弧上的竖梃
  const mullionCount = 26;
  for (let i = 0; i < mullionCount; i++) {
    const t = (i / mullionCount) * Math.PI * 2;
    const x = c[0] + Math.sin(t) * (a.r + 0.24);
    const z = c[2] + Math.cos(t) * (a.r + 0.24);
    for (const [y0, y1] of [
      [Y.ribA0, Y.ribA1],
      [Y.ribB0, Y.ribB1],
    ]) {
      b.box([0.16, y1 - y0, 0.5], [x, mid(y0, y1), z], 'metal', at(facade, 0.2 + (i % 7) * 0.03), {
        r: [0, t, 0],
        duration: 0.016,
        lift: 0.5,
      });
    }
    b.box([0.2, Y.gf1 - Y.gf0, 0.6], [c[0] + Math.sin(t) * (a.r + 0.04), mid(Y.gf0, Y.gf1), c[2] + Math.cos(t) * (a.r + 0.04)], 'metal', at(facade, 0.05 + (i % 5) * 0.02), {
      r: [0, t, 0],
      duration: 0.016,
      lift: 0.5,
    });
  }

  // 女儿墙 + 屋面
  shellCyl(Y.roof, Y.parapetTop, a.r + 0.42, 'white', at(shell, 0.92));
  const cap = new THREE.CylinderGeometry(a.r - 0.3, a.r - 0.3, 0.14, 48);
  b.add(cap, 'white', at(shell, 0.95), { p: [c[0], Y.parapetTop + 0.07, c[2]], shade: 0.9 });
  cap.dispose();
  const deck = new THREE.CylinderGeometry(a.r - 0.6, a.r - 0.6, 0.1, 48);
  b.add(deck, 'roof', at(shell, 0.88), { p: [c[0], Y.roof + 0.05, c[2]] });
  deck.dispose();

  /* ------------------------------------------------------- 广告屏 */
  // 圆弧上的屏幕：用一段开口圆柱做，而不是贴一块平板 —— 19 m 半径上，
  // 10 m 宽的平板会离弧面 0.6 m，轴测角度下看得出来。
  // 弧度与屏高取自 SCREEN：它们决定了贴图的长宽比，不能在这里随手写。
  const thetaStart = THREE.MathUtils.degToRad(12);
  const thetaLength = SCREEN.sweep;
  const screenY0 = Y.band3 + 0.2;
  const screenY1 = screenY0 + SCREEN.height;

  const frame = new THREE.CylinderGeometry(a.r + 0.86, a.r + 0.86, screenY1 - screenY0 + 0.9, 32, 1, true, thetaStart - 0.04, thetaLength + 0.08);
  b.add(frame, 'metal', at(facade, 0.72), { p: [c[0], mid(screenY0, screenY1) + 0.2, c[2]], shade: 0.72 });
  frame.dispose();

  const screen = new THREE.CylinderGeometry(a.r + 0.94, a.r + 0.94, screenY1 - screenY0, 32, 1, true, thetaStart, thetaLength);
  b.add(screen, 'screen', at(PHASE.lighting, 0.34), {
    p: [c[0], mid(screenY0, screenY1), c[2]],
    duration: 0.05,
    lift: 0.06,
    drift: [0, 0, 0],
  });
  screen.dispose();

  // 底部灯箱基座
  b.box([4.2, 1.1, 1.0], [c[0] + Math.sin(THREE.MathUtils.degToRad(45)) * (a.r + 1.1), Y.band3 + 0.5, c[2] + Math.cos(THREE.MathUtils.degToRad(45)) * (a.r + 1.1)], 'metal', at(facade, 0.9), {
    r: [0, THREE.MathUtils.degToRad(45), 0],
    duration: 0.02,
    lift: 0.4,
    shade: 0.8,
  });
}

/* -------------------------------------------------------------- 西侧配楼 */

function westAnnex(
  b: StructureBuilder,
  w: typeof MALL.west,
  shell: readonly [number, number],
  facade: readonly [number, number],
) {
  const top = 4.2 + 10.0;
  b.box([w.w + 2.6, 0.6, w.d + 2.6], [w.cx, 0.6, w.cz], 'stone', at(shell, 0.06), { duration: 0.04, lift: 0.5, shade: 0.92 });
  b.box([w.w, top - 0.9, w.d], [w.cx, mid(0.9, top), w.cz], 'white', at(shell, 0.5), {
    duration: 0.03,
    lift: 0.9,
    edge: true,
  });
  // 一条横贯东西的玻璃带
  b.box([w.w + 0.3, 3.0, w.d + 0.3], [w.cx, 4.2 + 1.5, w.cz], 'glassMall', at(facade, 0.36), {
    duration: 0.03,
    lift: 0.6,
    drift: [0.3, 1, 0.3],
  });
  b.box([w.w + 0.6, 0.8, w.d + 0.6], [w.cx, 4.2, w.cz], 'white', at(facade, 0.3), { duration: 0.02, lift: 0.5 });
  b.box([w.w - 1.0, 3.4, w.d - 1.0], [w.cx, 0.9 + 1.7, w.cz], 'glassMall', at(facade, 0.18), {
    duration: 0.03,
    lift: 0.4,
    drift: [0.4, 0.5, 0.4],
  });
  b.box([w.w + 0.7, 1.4, w.d + 0.7], [w.cx, top + 0.7, w.cz], 'white', at(shell, 0.82), {
    duration: 0.025,
    lift: 0.7,
    edge: true,
  });
  b.plate(w.w - 1.2, w.d - 1.2, [w.cx, top + 0.04, w.cz], 'roof', at(shell, 0.8), { duration: 0.03, lift: 0.3 });
  for (let i = 0; i < 3; i++) {
    const h = 1.8 + variation(i + 11) * 1.0;
    b.box([5.5, h, 3.6], [w.cx - 9 + i * 9, top + h / 2 + 0.1, w.cz + (i % 2 ? 6 : -6)], 'white', at(shell, 0.86 + i * 0.01), {
      duration: 0.02,
      lift: 1.2,
      edge: true,
    });
  }
}

/* ------------------------------------------------------------------ 入口 */

function entrance(b: StructureBuilder, facade: readonly [number, number]) {
  const a = MALL.arc;
  const deg45 = THREE.MathUtils.degToRad(45);
  const nx = Math.sin(deg45);
  const nz = Math.cos(deg45);

  // 雨篷：一块悬挑板 + 一根细柱，从圆弧上伸向广场
  const reach = 6.2;
  b.box([13.5, 0.55, reach], [a.cx + nx * (a.r + reach / 2 - 0.6), 7.4, a.cz + nz * (a.r + reach / 2 - 0.6)], 'white', at(facade, 0.86), {
    r: [0, deg45, 0],
    duration: 0.03,
    lift: 0.8,
    edge: true,
  });
  for (const s of [-1, 1]) {
    const px = a.cx + nx * (a.r + reach - 1.4) + nz * s * 5.4;
    const pz = a.cz + nz * (a.r + reach - 1.4) - nx * s * 5.4;
    b.cylinder(0.28, 7.15, [px, 3.9, pz], 'steel', at(facade, 0.9), { duration: 0.025, lift: 0.9 });
  }

  // 门斗：一片通透玻璃盒子，夜里是整栋楼最亮的地方
  b.box([11.5, 5.6, 3.4], [a.cx + nx * (a.r + 1.5), 0.9 + 2.8, a.cz + nz * (a.r + 1.5)], 'glassClear', at(facade, 0.94), {
    r: [0, deg45, 0],
    duration: 0.03,
    lift: 0.5,
  });
  b.box([10.5, 4.4, 2.2], [a.cx + nx * (a.r + 1.2), 0.9 + 2.4, a.cz + nz * (a.r + 1.2)], 'glow', at(PHASE.lighting, 0.1), {
    r: [0, deg45, 0],
    duration: 0.03,
    lift: 0.1,
    drift: [0, 0, 0],
    shade: 0.94,
  });
}

/* -------------------------------------------------------------- 工具函数 */

type Face = { axis: 'x' | 'z'; plane: number; from: number; to: number; len: number; dir: number };

function faces(x0: number, x1: number, z0: number, z1: number): Face[] {
  return [
    { axis: 'z', plane: z0, from: x0, to: x1, len: x1 - x0, dir: -1 },
    { axis: 'z', plane: z1, from: x0, to: x1, len: x1 - x0, dir: 1 },
    { axis: 'x', plane: x0, from: z0, to: z1, len: z1 - z0, dir: -1 },
    { axis: 'x', plane: x1, from: z0, to: z1, len: z1 - z0, dir: 1 },
  ];
}

/** 沿某条立面在参数 t 处放一根竖梃。厚度沿法向、宽度沿切向。 */
function vertical(
  b: StructureBuilder,
  face: Face,
  t: number,
  y0: number,
  y1: number,
  size: number,
  material: 'metal',
  span: readonly [number, number],
  u: number,
) {
  const p = face.from + (face.to - face.from) * t;
  const offset = 0.33 * face.dir;
  const pos: [number, number, number] =
    face.axis === 'z' ? [p, (y0 + y1) / 2, face.plane + offset] : [face.plane + offset, (y0 + y1) / 2, p];
  const size3: [number, number, number] =
    face.axis === 'z' ? [size, y1 - y0, 0.55] : [0.55, y1 - y0, size];
  b.box(size3, pos, material, at(span, u), { duration: 0.014, lift: 0.5 });
}
