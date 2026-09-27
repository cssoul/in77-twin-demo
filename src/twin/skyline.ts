import type { StructureBuilder } from './builder';
import { at, BLOCK, GROUND, PHASE, ROAD, ROADS } from './layout';
import { variation } from './rng';

/**
 * 背景低模城市。
 *
 * 参考图里街区的四周压着一片没有细节的白色体量 —— 它们不是"城市"，它们是
 * **图面底噪**：把主体街区托出来，同时给出尺度感。所以它们全部是同一种材质、
 * 只有高度和一点点明度差，而且刻意不投阴影（阴影相机只覆盖街区）。
 */
export function buildSkyline(b: StructureBuilder) {
  const span = PHASE.skyline;
  const cell = 44;
  const limit = 226;
  const count = Math.floor((limit * 2) / cell);
  const corridors = [
    { axis: 'x' as const, at: ROADS.west },
    { axis: 'x' as const, at: ROADS.east },
    { axis: 'z' as const, at: ROADS.north },
    { axis: 'z' as const, at: ROADS.south },
  ];
  const clear = ROAD.width / 2 + ROAD.walk + 1.5;

  let index = 0;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      index++;
      const bx = -limit + (i + 0.5) * cell + (variation(index * 1.7) - 0.5) * 9;
      const bz = -limit + (j + 0.5) * cell + (variation(index * 2.9) - 0.5) * 9;

      // 街区内部与道路走廊里不放大体量。留白只要够让路缘读出来就行 ——
      // 留多了，街区四周会出现一圈不知道怎么用的空地。
      if (bx > BLOCK.x0 - 4 && bx < BLOCK.x1 + 4 && bz > BLOCK.z0 - 4 && bz < BLOCK.z1 + 4) continue;
      if (corridors.some((c) => (c.axis === 'x' ? Math.abs(bx - c.at) : Math.abs(bz - c.at)) < clear)) continue;
      if (Math.hypot(bx, bz) > GROUND.half - 14) continue;

      // 背景体量必须**明显矮于**主体塔楼。它们一旦长到和塔楼一样高，
      // 主体就再也跳不出来了 —— 这是底噪抢戏最典型的一种。
      const roll = variation(index * 5.3);
      const tall = roll > 0.9;
      const h = tall ? 26 + variation(index * 7.1) * 30 : 8 + variation(index * 7.1) * 17;
      const w = tall ? 20 + variation(index * 3.3) * 14 : 18 + variation(index * 3.3) * 18;
      const d = tall ? 18 + variation(index * 4.7) * 12 : 17 + variation(index * 4.7) * 16;

      const start = at(span, ((index % 23) / 23) * 0.72);
      // 底噪城市几乎全白：它们只提供"尺度感"和"哪里是街区外"，不该有明暗戏。
      const tint = 0.94 + variation(index * 9.4) * 0.06;
      b.box([w, h, d], [bx, 0.02 + h / 2, bz], 'context', start, {
        duration: 0.03,
        lift: 1.8,
        shade: tint,
      });

      // 偶尔叠一个裙房，把体量从"盒子"变成"建筑"。
      if (variation(index * 11.7) > 0.62) {
        const ph = 4 + variation(index * 13.3) * 6;
        b.box(
          [w + 8, ph, d + 7],
          [bx + (variation(index * 17.1) - 0.5) * 9, 0.02 + ph / 2, bz + (variation(index * 19.3) - 0.5) * 9],
          'context',
          start + 0.008,
          { duration: 0.025, lift: 1.2, shade: tint * 0.97 },
        );
      }
    }
  }
}
