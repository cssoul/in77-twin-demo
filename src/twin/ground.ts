import type { StructureBuilder } from './builder';
import { at, GROUND, PHASE } from './layout';

/**
 * 地坪。整个微缩沙盘坐在一块有厚度的基座上 —— 抬起来的那一层边缘是这个
 * 场景"是模型而不是真实城市"的主要线索，所以基座必须看得见、有厚度、
 * 并且在轴测机位下能露出一个完整的侧边。
 */
export function buildGround(b: StructureBuilder) {
  const span = PHASE.ground;

  // 基座：8 m 厚，顶面就是 ±0 标高。落位行程给足，让它像一块被吊装就位的板。
  b.box([GROUND.half * 2, 8, GROUND.half * 2], [0, -4, 0], 'concreteDeep', at(span, 0), {
    duration: 0.06,
    lift: 3.2,
    shade: 0.72,
  });

  // 基座四周的收边带：一圈略亮的压顶，把厚板变成"托盘"。
  const edge = 6;
  const h = GROUND.half;
  for (const [sx, sz] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as [number, number][]) {
    const w = sx === 0 ? h * 2 : edge;
    const d = sz === 0 ? h * 2 : edge;
    b.box([w, 0.7, d], [sx * (h - edge / 2), 0.35, sz * (h - edge / 2)], 'kerb', at(span, 0.6), {
      duration: 0.03,
      lift: 0.6,
      shade: 0.94,
    });
  }

  // 城市底面：街区之外的大地，比广场略深一档，让街区读起来是"嵌进去的"。
  b.plate(h * 2, h * 2, [0, 0.02, 0], 'paving', at(span, 0.45), {
    duration: 0.04,
    lift: 0.8,
    shade: 0.9,
  });
}
