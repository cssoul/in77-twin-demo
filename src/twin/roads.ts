import type { StructureBuilder } from './builder';
import { at, BLOCK, GROUND, PHASE, ROAD, ROADS } from './layout';

const ROAD_Y = 0.04;
const MARK_Y = 0.075;
const WALK_H = 0.34;
const KERB_H = 0.46;

/** 标线只画到视觉相关范围内，再往外就被雾化的远景吞掉了。 */
const MARK_LIMIT = 208;
/** 交叉口范围内不画标线。 */
const CROSS_GAP = 17;

type Axis = 'x' | 'z';

/** 沿某条轴线铺一块水平构件（`along` 是走廊方向）。 */
function band(
  b: StructureBuilder,
  along: Axis,
  from: number,
  to: number,
  across: number,
  width: number,
  y: number,
  material: 'asphalt' | 'lane',
  start: number,
  lift = 0.25,
) {
  const length = to - from;
  const centre = (from + to) / 2;
  if (length <= 0.01) return;
  const pos: [number, number, number] = along === 'x' ? [centre, y, across] : [across, y, centre];
  b.plate(along === 'x' ? length : width, along === 'x' ? width : length, pos, material, start, {
    duration: 0.03,
    lift,
    drift: [0, 1, 0],
    shade: material === 'lane' ? 1 : 1,
  });
}

export function buildRoads(b: StructureBuilder) {
  const span = PHASE.roads;
  const half = GROUND.half;
  const rw = ROAD.width;

  /* ------------------------------------------------------------ 车行道 */
  // 东西向两条整长铺，南北向两条在交叉口处断开 —— 否则同高的共面薄片
  // 会在路口互相 z-fighting。
  const ew = [ROADS.north, ROADS.south];
  const ns = [ROADS.west, ROADS.east];

  ew.forEach((cz, i) => {
    band(b, 'x', -half, half, cz, rw, ROAD_Y, 'asphalt', at(span, 0.06 + i * 0.03), 0.3);
  });
  ns.forEach((cx, i) => {
    const segments: [number, number][] = [
      [-half, ROADS.north - rw / 2],
      [ROADS.north + rw / 2, ROADS.south - rw / 2],
      [ROADS.south + rw / 2, half],
    ];
    segments.forEach(([a, c], j) => {
      band(b, 'z', a, c, cx, rw, ROAD_Y, 'asphalt', at(span, 0.09 + i * 0.03 + j * 0.012), 0.3);
    });
  });

  /* ------------------------------------------------------------ 人行道 */
  // 街区一侧的人行道围成一个无重叠的方框；外侧另围一圈。框与框只在
  // 边线上相接，不会出现同高共面。
  const inner: [number, number, number, number][] = [
    [BLOCK.x0, BLOCK.x1, ROADS.north + rw / 2, BLOCK.z0],
    [BLOCK.x0, BLOCK.x1, BLOCK.z1, ROADS.south - rw / 2],
    [ROADS.west + rw / 2, BLOCK.x0, BLOCK.z0, BLOCK.z1],
    [BLOCK.x1, ROADS.east - rw / 2, BLOCK.z0, BLOCK.z1],
  ];
  const outer = ROAD.walk;
  const outerRects: [number, number, number, number][] = [
    [-BLOCK.x1, BLOCK.x1, ROADS.north - rw / 2 - outer, ROADS.north - rw / 2],
    [-BLOCK.x1, BLOCK.x1, ROADS.south + rw / 2, ROADS.south + rw / 2 + outer],
    [-BLOCK.x0 - outer, -BLOCK.x0, ROADS.north - rw / 2, ROADS.south + rw / 2],
    [BLOCK.x0, BLOCK.x0 + outer, ROADS.north - rw / 2, ROADS.south + rw / 2],
  ];

  const walkRects = [...inner, ...outerRects];
  walkRects.forEach(([x0, x1, z0, z1], i) => {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w <= 0.01 || d <= 0.01) return;
    b.box([w, WALK_H, d], [(x0 + x1) / 2, WALK_H / 2, (z0 + z1) / 2], 'paving', at(span, 0.3 + (i % 5) * 0.028), {
      duration: 0.035,
      lift: 0.5,
      shade: 0.97,
    });
  });

  /* -------------------------------------------------------------- 路缘石 */
  // 只做街区一侧 —— 外侧的路缘在这个尺度上根本读不出来。
  const kerbs: [number, number, number, number][] = [
    [BLOCK.x0, BLOCK.x1, ROADS.north + rw / 2 - 0.55, ROADS.north + rw / 2],
    [BLOCK.x0, BLOCK.x1, ROADS.south - rw / 2, ROADS.south - rw / 2 + 0.55],
    [ROADS.west + rw / 2 - 0.55, ROADS.west + rw / 2, BLOCK.z0, BLOCK.z1],
    [ROADS.east - rw / 2, ROADS.east - rw / 2 + 0.55, BLOCK.z0, BLOCK.z1],
  ];
  kerbs.forEach(([x0, x1, z0, z1], i) => {
    b.box(
      [Math.max(0.2, x1 - x0), KERB_H, Math.max(0.2, z1 - z0)],
      [(x0 + x1) / 2, KERB_H / 2, (z0 + z1) / 2],
      'kerb',
      at(span, 0.52 + i * 0.02),
      { duration: 0.025, lift: 0.35 },
    );
  });

  /* ---------------------------------------------------------------- 标线 */
  const mark = at(span, 0.68);
  const intersections = ns.flatMap((cx) => ew.map((cz) => [cx, cz] as [number, number]));
  const inJunction = (x: number, z: number) =>
    intersections.some(([ix, iz]) => Math.abs(x - ix) < CROSS_GAP + rw / 2 && Math.abs(z - iz) < CROSS_GAP + rw / 2);

  ew.forEach((cz) => {
    // 路缘边线 + 外侧车道线
    for (const s of [-1, 1]) {
      band(b, 'x', -MARK_LIMIT, MARK_LIMIT, cz + s * 13.9, 0.3, MARK_Y, 'lane', mark, 0.05);
      band(b, 'x', -MARK_LIMIT, MARK_LIMIT, cz + s * 11.25, 0.28, MARK_Y, 'lane', mark, 0.05);
    }
    // 中央双黄改双白：这是图面语言，不是交通法规。
    for (const s of [-1, 1]) {
      band(b, 'x', -MARK_LIMIT, MARK_LIMIT, cz + s * 0.28, 0.22, MARK_Y, 'lane', mark, 0.05);
    }
    // 车道虚线
    for (const s of [-1, 1]) {
      for (const lane of [3.75, 7.5]) {
        const across = cz + s * lane;
        for (let x = -MARK_LIMIT; x < MARK_LIMIT; x += 15) {
          if (inJunction(x + 2.5, across)) continue;
          band(b, 'x', x, x + 5, across, 0.24, MARK_Y, 'lane', mark, 0.05);
        }
      }
    }
  });

  ns.forEach((cx) => {
    for (const s of [-1, 1]) {
      band(b, 'z', -MARK_LIMIT, MARK_LIMIT, cx + s * 13.9, 0.3, MARK_Y, 'lane', mark, 0.05);
      band(b, 'z', -MARK_LIMIT, MARK_LIMIT, cx + s * 11.25, 0.28, MARK_Y, 'lane', mark, 0.05);
      band(b, 'z', -MARK_LIMIT, MARK_LIMIT, cx + s * 0.28, 0.22, MARK_Y, 'lane', mark, 0.05);
      for (const lane of [3.75, 7.5]) {
        const across = cx + s * lane;
        for (let z = -MARK_LIMIT; z < MARK_LIMIT; z += 15) {
          if (inJunction(across, z + 2.5)) continue;
          band(b, 'z', z, z + 5, across, 0.24, MARK_Y, 'lane', mark, 0.05);
        }
      }
    }
  });

  /* -------------------------------------------------------- 人行横道 */
  // 斑马线 = 平行于车流方向的长条。跨南北向道路时，条带沿 z 拉长、沿 x 排布。
  const zebra = at(span, 0.86);
  intersections.forEach(([ix, iz]) => {
    const stripes = 16;
    const pitch = rw / stripes;
    for (const sz of [-1, 1]) {
      const z = iz + sz * (rw / 2 + 3.2);
      for (let i = 0; i < stripes; i++) {
        if (i % 2) continue;
        const x = ix - rw / 2 + pitch * (i + 0.5);
        band(b, 'x', x - pitch / 2, x + pitch / 2, z, 4.6, MARK_Y + 0.01, 'lane', zebra, 0.03);
      }
    }
    for (const sx of [-1, 1]) {
      const x = ix + sx * (rw / 2 + 3.2);
      for (let i = 0; i < stripes; i++) {
        if (i % 2) continue;
        const z = iz - rw / 2 + pitch * (i + 0.5);
        band(b, 'z', z - pitch / 2, z + pitch / 2, x, 4.6, MARK_Y + 0.01, 'lane', zebra, 0.03);
      }
    }
  });

  // 停止线
  intersections.forEach(([ix, iz]) => {
    for (const sz of [-1, 1]) {
      band(b, 'x', ix - rw / 2 - 8, ix - rw / 2, iz + sz * (rw / 2 + 6.6), 0.5, MARK_Y + 0.01, 'lane', zebra, 0.03);
      band(b, 'x', ix + rw / 2, ix + rw / 2 + 8, iz - sz * (rw / 2 + 6.6), 0.5, MARK_Y + 0.01, 'lane', zebra, 0.03);
    }
  });
}
