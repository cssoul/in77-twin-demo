import * as THREE from 'three';
import type { StructureBuilder } from './builder';

/**
 * 沿一条折线铺一条等宽带子。
 *
 * 带子是这个项目里"路径"的通用表达：公园里的散步道、以及参考图里那些
 * 橙红色人流动线。每条带子是一个三角形条带 —— 沿线的长度写进 v、横向写进 u，
 * 于是只要一张能滚动的贴图，整条带子就有方向感，而代价只有 1 个 draw call。
 */
export function ribbon(
  b: StructureBuilder,
  points: [number, number][],
  width: number,
  material: 'flow' | 'paving' | 'stone' | 'grass',
  start: number,
  y: number,
  options: { samples?: number; tension?: number; shade?: number; lift?: number; duration?: number; closed?: boolean } = {},
) {
  if (points.length < 2) return;
  const closed = options.closed ?? false;
  const samples = options.samples ?? Math.max(18, Math.min(140, Math.round(points.length * 10)));
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    'catmullrom',
    options.tension ?? 0.4,
  );

  const samplesPts = curve.getSpacedPoints(samples);
  const pos: number[] = [];
  const uv: number[] = [];
  const half = width / 2;
  // 流线材质自带两侧渐隐，u 必须是 0..1；其它材质按米铺，u 用米。
  const uScale = material === 'flow' ? 1 : width;
  let run = 0;

  for (let i = 0; i < samplesPts.length; i++) {
    const p = samplesPts[i];
    // 闭合带子的首尾要接上，否则环廊会留一道口子。
    const nxt = closed && i === samplesPts.length - 1 ? samplesPts[1] : samplesPts[Math.min(i + 1, samplesPts.length - 1)];
    const prev = samplesPts[Math.max(i - 1, 0)];
    const dx = nxt.x - prev.x;
    const dz = nxt.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // XZ 平面内的左手垂线。
    const nx = -dz / len;
    const nz = dx / len;
    if (i > 0) run += Math.hypot(p.x - prev.x, p.z - prev.z);
    pos.push(p.x + nx * half, y, p.z + nz * half);
    pos.push(p.x - nx * half, y, p.z - nz * half);
    uv.push(0, run, uScale, run);
  }

  const indices: number[] = [];
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    // 绕序刻意写成这样：法线才会朝上。
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  // 闭合曲线自己会返回一个与起点重合的末点，上面这一圈已经首尾相接，
  // 不需要再补一块封口三角形。

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  // 带子永远水平，法线直接写常量比 computeVertexNormals 更稳（拐角处不会翻面）。
  bakeFlatNormals(flat);

  b.add(flat, material, start, {
    duration: options.duration ?? 0.03,
    lift: options.lift ?? 0.35,
    drift: [0, 1, 0],
    shade: options.shade ?? 1,
  });
  flat.dispose();
}

function bakeFlatNormals(g: THREE.BufferGeometry) {
  const count = g.getAttribute('position').count;
  const n = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) n[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
}
