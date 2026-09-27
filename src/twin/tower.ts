import type { StructureBuilder } from './builder';
import { at, PHASE, TOWER } from './layout';
import { variation } from './rng';

/**
 * 东侧塔楼：白色石材裙房 + 双体玻璃塔。
 *
 * 每一层固定三段式 —— **楼板带 → 竖梃 → 玻璃扇**。楼层起点按层号线性推进，
 * 后两段各加一点偏移；玻璃扇的起点再加上它绕塔轴的**方位角分数**，
 * 于是玻璃绕着楼旋转着合上。这是全片最抓眼的一动作。
 *
 * 玻璃是**不透明**镜面材质：建筑尺度上真实的镀膜玻璃本来就接近镜面，
 * 而且不透明是唯一能避开几百块玻璃扇透明排序、同时拿到干净天空反射的做法。
 * 施工叙事交给"幕墙没上之前你看到的是裸混凝土楼板 + 角柱"来承担。
 */

const BASE = 18.6; // 裙房屋面 = 塔楼首层楼面
const PODIUM_BASE = 0.9;
const FLOOR_H = TOWER.floorH;
const BAY = 3.4;
const SLAB_H = 0.62;
const GLASS_IN = 0.5;
const SLAB_OVER = 0.42;

type Volume = { cx: number; cz: number; w: number; d: number; floors: number };

const MAIN: Volume = { ...TOWER.main, floors: TOWER.mainFloors };
const WING: Volume = { ...TOWER.wing, floors: TOWER.wingFloors };

export function buildTower(b: StructureBuilder) {
  buildPodium(b);
  buildVolume(b, MAIN, PHASE.tower, PHASE.curtain, true);
  buildVolume(b, WING, PHASE.tower, PHASE.curtain, false);
}

/* ------------------------------------------------------------------ 裙房 */

function buildPodium(b: StructureBuilder) {
  const p = TOWER.podium;
  const shell = PHASE.tower;
  const facade = PHASE.mallFacade;
  const [x0, x1] = [p.cx - p.w / 2, p.cx + p.w / 2];
  const [z0, z1] = [p.cz - p.d / 2, p.cz + p.d / 2];
  const top = BASE;

  b.box([p.w + 3.0, 0.6, p.d + 3.0], [p.cx, 0.6, p.cz], 'stone', at(shell, 0.0), { duration: 0.04, lift: 0.5, shade: 0.92 });
  b.box([p.w, top - 7.5, p.d], [p.cx, (7.5 + top) / 2, p.cz], 'white', at(shell, 0.56), {
    duration: 0.03,
    lift: 0.9,
    edge: true,
  });
  b.box([p.w, 6.6 - PODIUM_BASE, p.d], [p.cx, (PODIUM_BASE + 6.6) / 2, p.cz], 'white', at(shell, 0.34), {
    duration: 0.03,
    lift: 0.9,
    edge: true,
  });

  // 首层通高玻璃（内退 1.0）：LV 门头与橱窗就在这一层
  b.box([p.w - 2.0, 6.6 - PODIUM_BASE, p.d - 2.0], [p.cx, (PODIUM_BASE + 6.6) / 2, p.cz], 'concreteDeep', at(shell, 0.72), {
    duration: 0.03,
    lift: 0.4,
    shade: 0.44,
  });
  b.box([p.w - 1.4, 6.6 - PODIUM_BASE - 0.2, p.d - 1.4], [p.cx, (PODIUM_BASE + 6.6) / 2, p.cz], 'glassMall', at(facade, 0.08), {
    duration: 0.03,
    lift: 0.5,
    drift: [0.4, 0.6, 0.4],
  });

  // 裙房腰部的一条玻璃带 + 楼板带
  b.box([p.w + 0.3, 2.8, p.d + 0.3], [p.cx, 13.4, p.cz], 'glassMall', at(facade, 0.44), {
    duration: 0.03,
    lift: 0.6,
    drift: [0.3, 1, 0.3],
  });
  b.box([p.w + 0.7, 0.9, p.d + 0.7], [p.cx, 7.05, p.cz], 'white', at(facade, 0.24), { duration: 0.022, lift: 0.6 });
  b.box([p.w + 0.7, 0.9, p.d + 0.7], [p.cx, 15.25, p.cz], 'white', at(facade, 0.5), { duration: 0.022, lift: 0.6 });

  // 女儿墙与屋面
  b.box([p.w + 0.9, 1.4, p.d + 0.9], [p.cx, top + 0.7, p.cz], 'white', at(shell, 0.9), {
    duration: 0.028,
    lift: 0.7,
    edge: true,
  });
  b.plate(p.w - 1.2, p.d - 1.2, [p.cx, top + 0.04, p.cz], 'roof', at(shell, 0.88), { duration: 0.035, lift: 0.3 });

  // 竖梃
  for (const face of faces(x0, x1, z0, z1)) {
    const n = Math.max(1, Math.round(face.len / 3.6));
    for (let i = 0; i <= n; i++) {
      pin(b, face, i / n, PODIUM_BASE, 6.6, 0.22, at(facade, 0.06 + (i % 6) * 0.014));
    }
    const m = Math.max(1, Math.round(face.len / 4.2));
    for (let i = 0; i <= m; i++) {
      pin(b, face, i / m, 12.0, 14.8, 0.18, at(facade, 0.46 + (i % 5) * 0.014));
    }
  }

  buildStorefront(b, p);
}

/** 塔楼裙房的南立面：木框门头 + 品牌招牌 + 通高橱窗。 */
function buildStorefront(b: StructureBuilder, p: typeof TOWER.podium) {
  const z = p.cz + p.d / 2; // 南立面
  const signY = 4.6;

  // 木饰面门套
  b.box([13.0, 6.2, 0.9], [p.cx - 0.5, 0.9 + 3.1, z + 0.55], 'wood', at(PHASE.mallFacade, 0.72), {
    duration: 0.03,
    lift: 0.6,
  });
  b.box([10.6, 5.2, 0.5], [p.cx - 0.5, 0.9 + 2.6, z + 1.05], 'glassClear', at(PHASE.mallFacade, 0.82), {
    duration: 0.03,
    lift: 0.4,
  });
  b.box([9.4, 4.0, 0.3], [p.cx - 0.5, 0.9 + 2.1, z + 0.9], 'glow', at(PHASE.lighting, 0.16), {
    duration: 0.03,
    lift: 0.05,
    drift: [0, 0, 0],
    shade: 0.95,
  });

  // 品牌招牌：一块白板 + 程序化文字贴图
  b.box([9.6, 3.4, 0.5], [p.cx + 12.5, signY + 3.4, z + 0.42], 'sign', at(PHASE.lighting, 0.3), {
    duration: 0.04,
    lift: 0.3,
    drift: [0, 0.2, 0.6],
  });
  b.box([10.4, 0.35, 1.1], [p.cx + 12.5, signY + 0.85, z + 0.5], 'white', at(PHASE.mallFacade, 0.9), {
    duration: 0.02,
    lift: 0.5,
  });

  // 侧向一排小橱窗
  for (let i = 0; i < 3; i++) {
    b.box([6.0, 5.0, 0.4], [p.cx - 22 + i * 7.2, 0.9 + 2.5, z + 0.45], 'glassClear', at(PHASE.mallFacade, 0.86 + i * 0.02), {
      duration: 0.025,
      lift: 0.4,
    });
    b.box([5.2, 4.2, 0.25], [p.cx - 22 + i * 7.2, 0.9 + 2.1, z + 0.3], 'glow', at(PHASE.lighting, 0.2 + i * 0.05), {
      duration: 0.025,
      lift: 0.05,
      drift: [0, 0, 0],
      shade: 0.8 + i * 0.06,
    });
  }
}

/* ---------------------------------------------------------------- 塔身体量 */

function buildVolume(
  b: StructureBuilder,
  v: Volume,
  span: readonly [number, number],
  curtain: readonly [number, number],
  withWave: boolean,
) {
  const [x0, x1] = [v.cx - v.w / 2, v.cx + v.w / 2];
  const [z0, z1] = [v.cz - v.d / 2, v.cz + v.d / 2];
  const top = BASE + v.floors * FLOOR_H;

  // 核心筒 / 室内体量：幕墙没上之前，你看到的就是它 + 楼板 + 角柱。
  b.box([v.w - GLASS_IN * 2, v.floors * FLOOR_H, v.d - GLASS_IN * 2], [v.cx, BASE + (v.floors * FLOOR_H) / 2, v.cz], 'concreteDeep', at(span, 0.06), {
    duration: 0.05,
    lift: 1.6,
    shade: 0.5,
  });

  const sweep = (x: number, z: number) => (Math.atan2(x - v.cx, z - v.cz) + Math.PI) / (Math.PI * 2);

  for (let f = 0; f < v.floors; f++) {
    const y0 = BASE + f * FLOOR_H;
    const u = (f + 1) / v.floors;
    // 0.84 留出 16% 给最后一块玻璃收尾，否则最后一层还没装完时间轴就结束了。
    const slabStart = at(span, u * 0.84);
    const frameStart = slabStart + 0.011;
    // 幕墙排在**单独的** curtain 窗口里，所以完整叙事是"结构先长满、玻璃再
    // 绕着楼合拢"，而不是每层各自把玻璃糊上去。两个窗口重叠是刻意的。
    const glassStart = Math.max(slabStart + 0.02, at(curtain, u * 0.8));

    // 1) 楼板带：同时是下一层的天花，未装幕墙的楼层才"有顶有底"，不会浮空。
    b.box([v.w + SLAB_OVER * 2, SLAB_H, v.d + SLAB_OVER * 2], [v.cx, y0 + SLAB_H / 2, v.cz], 'white', slabStart, {
      duration: 0.016,
      lift: 1.5,
      edge: f === 0,
    });

    // 2) 角柱 + 竖梃
    for (const [sx, sz] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as [number, number][]) {
      b.box([0.9, FLOOR_H - SLAB_H, 0.9], [v.cx + sx * (v.w / 2 - 0.45), y0 + SLAB_H + (FLOOR_H - SLAB_H) / 2, v.cz + sz * (v.d / 2 - 0.45)], 'metal', frameStart, {
        duration: 0.014,
        lift: 0.9,
      });
    }

    // 3) 幕墙：逐开间切分，每扇的起点加上它绕塔轴的方位角分数 → 玻璃绕着楼合拢。
    const gh = FLOOR_H - SLAB_H;
    const gy = y0 + SLAB_H + gh / 2;
    for (const face of faces(x0, x1, z0, z1)) {
      const bays = Math.max(3, Math.round(face.len / BAY) | 1);
      const pitch = face.len / bays;
      for (let i = 0; i < bays; i++) {
        const t0 = (i / bays) * face.len + face.from;
        const centre = t0 + pitch / 2;
        // 奇数的开间数保证每个面正中有一扇落在轴线上 —— 那一扇是灯槽。
        const onAxis = withWave && i === (bays - 1) / 2;
        const wave = withWave ? sweep(face.axis === 'z' ? centre : face.plane, face.axis === 'z' ? face.plane : centre) * 0.006 : 0;
        const start = glassStart + wave;
        const glassOut = GLASS_IN - 0.16;
        const size: [number, number, number] =
          face.axis === 'z'
            ? [pitch - 0.16, gh, 0.16]
            : [0.16, gh, pitch - 0.16];
        const pos: [number, number, number] =
          face.axis === 'z'
            ? [centre, gy, face.plane - face.dir * glassOut]
            : [face.plane - face.dir * glassOut, gy, centre];

        b.box(size, pos, onAxis ? 'glassClear' : 'glass', start, {
          duration: 0.013,
          lift: 1.1,
          // 玻璃从外侧斜向上滑入：这个外向分量就是"玻璃扇凑到楼前"的手感来源。
          drift: face.axis === 'z' ? [0.2, 1, 0.7 * face.dir] : [0.7 * face.dir, 1, 0.2],
        });

        if (onAxis) {
          // 灯槽：中缝那扇通透玻璃后面放一块比它窄的发光片，并按层号错开，
          // 于是灯光从裙房一层层爬到塔冠。
          const glowPos: [number, number, number] =
            face.axis === 'z'
              ? [centre, gy, face.plane - face.dir * (glassOut + 0.55)]
              : [face.plane - face.dir * (glassOut + 0.55), gy, centre];
          const glowSize: [number, number, number] =
            face.axis === 'z' ? [pitch * 0.62, gh * 0.72, 0.28] : [0.28, gh * 0.72, pitch * 0.62];
          b.box(glowSize, glowPos, 'glowCool', at(PHASE.lighting, 0.1 + u * 0.75), {
            duration: 0.02,
            lift: 0.05,
            drift: [0, 0, 0],
          });
        }

        // 竖梃：每开间两根，贴在玻璃外皮上。
        for (const k of [0, 1]) {
          const px = t0 + (k === 0 ? 0.08 : pitch - 0.08);
          const mPos: [number, number, number] =
            face.axis === 'z'
              ? [px, gy, face.plane - face.dir * (glassOut - 0.1)]
              : [face.plane - face.dir * (glassOut - 0.1), gy, px];
          const mSize: [number, number, number] = face.axis === 'z' ? [0.14, gh, 0.22] : [0.22, gh, 0.14];
          b.box(mSize, mPos, 'metal', frameStart + wave, {
            duration: 0.012,
            lift: 0.9,
            drift: face.axis === 'z' ? [0.2, 1, 0.7 * face.dir] : [0.7 * face.dir, 1, 0.2],
          });
        }
      }
    }
  }

  // 屋面：砾石 + 女儿墙 + 机房 + 桅杆
  b.plate(v.w - 1.2, v.d - 1.2, [v.cx, top + 0.05, v.cz], 'roof', at(span, 0.94), { duration: 0.04, lift: 0.4 });
  b.box([v.w + 0.8, 1.5, v.d + 0.8], [v.cx, top + 0.75, v.cz], 'white', at(span, 0.9), {
    duration: 0.03,
    lift: 0.8,
    edge: true,
  });
  const plantH = 3.6 + variation(v.cx) * 1.4;
  b.box([v.w * 0.56, plantH, v.d * 0.5], [v.cx - v.w * 0.08, top + plantH / 2 + 0.1, v.cz], 'white', at(span, 0.96), {
    duration: 0.03,
    lift: 1.6,
    edge: true,
  });
  b.box([v.w * 0.3, 2.0, v.d * 0.24], [v.cx + v.w * 0.28, top + 1.1, v.cz + v.d * 0.2], 'metal', at(span, 0.98), {
    duration: 0.025,
    lift: 1.4,
    shade: 0.86,
  });
  b.cylinder(0.16, 7.5, [v.cx + v.w * 0.34, top + 4.6, v.cz - v.d * 0.3], 'steel', at(PHASE.lighting, 0.6), {
    duration: 0.03,
    lift: 2.5,
  });
  b.cylinder(0.36, 0.36, [v.cx + v.w * 0.34, top + 8.5, v.cz - v.d * 0.3], 'glow', at(PHASE.lighting, 0.72), {
    duration: 0.02,
    lift: 0.05,
    drift: [0, 0, 0],
  });
}

/* -------------------------------------------------------------- 工具函数 */

type Face = { axis: 'x' | 'z'; plane: number; from: number; len: number; dir: number };

function faces(x0: number, x1: number, z0: number, z1: number): Face[] {
  return [
    { axis: 'z', plane: z0, from: x0, len: x1 - x0, dir: -1 },
    { axis: 'z', plane: z1, from: x0, len: x1 - x0, dir: 1 },
    { axis: 'x', plane: x0, from: z0, len: z1 - z0, dir: -1 },
    { axis: 'x', plane: x1, from: z0, len: z1 - z0, dir: 1 },
  ];
}

function pin(b: StructureBuilder, face: Face, t: number, y0: number, y1: number, size: number, start: number) {
  const p = face.from + face.len * t;
  const off = 0.32 * face.dir;
  const pos: [number, number, number] = face.axis === 'z' ? [p, (y0 + y1) / 2, face.plane + off] : [face.plane + off, (y0 + y1) / 2, p];
  const size3: [number, number, number] = face.axis === 'z' ? [size, y1 - y0, 0.5] : [0.5, y1 - y0, size];
  b.box(size3, pos, 'metal', start, { duration: 0.014, lift: 0.5 });
}
