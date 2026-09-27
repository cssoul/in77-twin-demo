import type { StructureBuilder } from './builder';
import { at, FOUNTAIN, PARK, PHASE, PLAZA } from './layout';
import { ribbon } from './ribbon';
import { variation } from './rng';

/**
 * 广场、圆形水景与西南绿地。
 *
 * 整片广场是**一块** 6 m 花岗岩大板 —— 板缝网格画在纹理里，不靠几百块小板拼。
 * 参考图里广场的层次感来自"大板 + 几处深色镶边 + 圆形水景"，不是一个棋盘；
 * 早期版本用两种材质交替做方格，结果整片广场渲染成黑白棋盘，微缩感全毁。
 */
export function buildPlaza(b: StructureBuilder) {
  const span = PHASE.plaza;
  const w = PLAZA.x1 - PLAZA.x0;
  const d = PLAZA.z1 - PLAZA.z0;
  const cx = (PLAZA.x0 + PLAZA.x1) / 2;
  const cz = (PLAZA.z0 + PLAZA.z1) / 2;

  b.box([w, 0.3, d], [cx, 0.15, cz], 'plaza', at(span, 0.1), {
    duration: 0.06,
    lift: 1.1,
    shade: 1.0,
  });

  // 商场与塔楼门前的过渡浅色石材：让两栋楼的入口在铺装上"落地"。
  const aprons: [number, number, number, number][] = [
    [-34, 20, 22, 82], // 商场圆角前
    [34, 78, -34, 24], // 塔楼裙房前
  ];
  aprons.forEach(([x0, x1, z0, z1], i) => {
    b.box([x1 - x0, 0.06, z1 - z0], [(x0 + x1) / 2, 0.33, (z0 + z1) / 2], 'stone', at(span, 0.42 + i * 0.06), {
      duration: 0.03,
      lift: 0.4,
      shade: 1.08,
    });
  });

  buildFountain(b);
  buildPark(b);
}

/* ---------------------------------------------------------------- 水景 */

function buildFountain(b: StructureBuilder) {
  const span = PHASE.fountain;
  const { cx, cz, outer, rings, basin } = FOUNTAIN;

  // 圆形铺装底盘
  b.disk(outer, [cx, 0.315, cz], 'stone', at(span, 0.14), { duration: 0.05, lift: 0.6, shade: 1.06 }, 64);

  // 同心深色镶边：一圈圈窄环，是这张图里最容易被认出来的那个图形。
  rings.forEach((r, i) => {
    b.ring(r - 0.5, r + 0.5, 0.07, [cx, 0.3, cz], 'stone', at(span, 0.34 + i * 0.08), {
      duration: 0.03,
      lift: 0.3,
      shade: 0.78,
    }, 64);
  });
  b.ring(outer - 1.4, outer, 0.1, [cx, 0.3, cz], 'stone', at(span, 0.24), { duration: 0.03, lift: 0.35, shade: 0.72 }, 64);

  // 中央水盘：池壁 + 水面 + 雕塑
  b.ring(basin, basin + 1.6, 0.95, [cx, 0.3, cz], 'stone', at(span, 0.66), { duration: 0.035, lift: 0.5, shade: 0.94 }, 48);
  b.ring(basin, basin + 1.6, 0.14, [cx, 1.25, cz], 'white', at(span, 0.78), { duration: 0.02, lift: 0.25 }, 48);
  b.disk(basin, [cx, 1.02, cz], 'water', at(PHASE.park, 0.3), { duration: 0.06, lift: 0.2, shade: 1 }, 48);

  b.cylinder(0.62, 2.4, [cx, 2.0, cz], 'steel', at(span, 0.86), { duration: 0.03, lift: 1.6 });
  b.disk(1.5, [cx, 3.2, cz], 'metal', at(span, 0.92), { duration: 0.03, lift: 1.2, shade: 0.94 }, 24);
  b.cylinder(0.1, 1.6, [cx, 4.4, cz], 'steel', at(span, 0.95), { duration: 0.02, lift: 1.4 });
  b.cylinder(0.34, 0.34, [cx, 5.3, cz], 'glow', at(PHASE.lighting, 0.5), {
    duration: 0.02,
    lift: 0.05,
    drift: [0, 0, 0],
  });

  // 环列灯柱
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = outer - 3.2;
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    b.cylinder(0.16, 3.2, [x, 1.9, z], 'steel', at(PHASE.props, 0.2 + i * 0.03), { duration: 0.02, lift: 0.9 });
    b.cylinder(0.36, 0.5, [x, 3.75, z], 'glow', at(PHASE.lighting, 0.3 + i * 0.03), {
      duration: 0.018,
      lift: 0.05,
      drift: [0, 0, 0],
    });
  }
}

/* ------------------------------------------------------------------ 绿地 */

function buildPark(b: StructureBuilder) {
  const span = PHASE.park;
  const { cx, cz, w, d } = PARK;

  b.box([w, 0.36, d], [cx, 0.18, cz], 'grass', at(span, 0.1), {
    duration: 0.05,
    lift: 0.7,
    shade: 1.0,
  });

  // 草坪边缘一圈窄石带，把绿地"收"进铺装里
  b.box([w + 1.6, 0.24, 1.0], [cx, 0.32, cz - d / 2 - 0.5], 'stone', at(span, 0.2), { duration: 0.025, lift: 0.4, shade: 0.9 });
  b.box([w + 1.6, 0.24, 1.0], [cx, 0.32, cz + d / 2 + 0.5], 'stone', at(span, 0.2), { duration: 0.025, lift: 0.4, shade: 0.9 });
  b.box([1.0, 0.24, d + 2.0], [cx - w / 2 - 0.5, 0.32, cz], 'stone', at(span, 0.22), { duration: 0.025, lift: 0.4, shade: 0.9 });
  b.box([1.0, 0.24, d + 2.0], [cx + w / 2 + 0.5, 0.32, cz], 'stone', at(span, 0.22), { duration: 0.025, lift: 0.4, shade: 0.9 });

  // 贯穿绿地的一条散步道。刻意做成 S 形 —— 直线会让整块绿地变成操场。
  ribbon(
    b,
    [
      [cx + w / 2 - 2, cz - d / 2 + 4],
      [cx + 12, cz - d / 2 + 22],
      [cx - 6, cz + 2],
      [cx - 26, cz + 16],
      [cx - w / 2 + 4, cz + d / 2 - 6],
    ],
    5.2,
    'paving',
    at(span, 0.34),
    0.38,
    { shade: 1.05, lift: 0.4 },
  );

  // 两处小树池 / 花坛
  for (let i = 0; i < 3; i++) {
    const px = cx + 22 - i * 26;
    const pz = cz + 24 + variation(i * 5.1) * 10;
    b.ring(3.0, 3.7, 0.5, [px, 0.36, pz], 'stone', at(span, 0.5 + i * 0.06), { duration: 0.025, lift: 0.4, shade: 0.92 }, 28);
    b.disk(3.0, [px, 0.5, pz], 'planting', at(span, 0.6 + i * 0.05), { duration: 0.03, lift: 0.5, shade: 0.95 }, 28);
  }
}
