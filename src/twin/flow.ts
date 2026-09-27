import * as THREE from 'three';
import type { StructureBuilder } from './builder';
import { at, FLOW_PATHS, PHASE, ROADS } from './layout';
import { ribbon } from './ribbon';
import { makeRandom } from './rng';

/**
 * 人流动线、行人与车流 —— 数字孪生"正在运行"的那一半。
 *
 * 参考图里那些橙红色宽带是这个场景唯一在解释**功能**的图面语言：带宽代表流量，
 * 纹理流动代表方向。所以它们必须真的会动。整条流线合并成一个 Mesh，靠改写
 * 贴图的 `offset.y` 让箭头往前跑 —— 1 个 draw call 就够。
 *
 * 行人与车辆走 InstancedMesh：每帧只更新实例矩阵，几何与材质一次都不动。
 */

/* ------------------------------------------------------------ 路径采样 */

type Sampler = {
  at: (t: number) => { x: number; z: number; dx: number; dz: number };
  length: number;
};

/** 预采样成等距点表，运行时只做线性插值 —— 比每帧调用曲线求值便宜一个量级。 */
function makeSampler(points: [number, number][], closed = false, resolution = 320): Sampler {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    'catmullrom',
    0.4,
  );
  const pts = curve.getSpacedPoints(resolution);
  const n = pts.length;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  let length = 0;
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i].x;
    zs[i] = pts[i].z;
    if (i > 0) length += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  }
  return {
    length,
    at(t: number) {
      const u = ((t % 1) + 1) % 1;
      const f = u * (n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      const k = f - i;
      const x = xs[i] + (xs[i + 1] - xs[i]) * k;
      const z = zs[i] + (zs[i + 1] - zs[i]) * k;
      const dx = xs[i + 1] - xs[i];
      const dz = zs[i + 1] - zs[i];
      const len = Math.hypot(dx, dz) || 1;
      return { x, z, dx: dx / len, dz: dz / len };
    },
  };
}

/* -------------------------------------------------------------- 流线带 */

export function buildFlowRibbons(b: StructureBuilder) {
  const span = PHASE.props;
  FLOW_PATHS.forEach((path, i) => {
    ribbon(b, path.points, path.width, 'flow', at(span, 0.06 + (i % 7) * 0.05), 0.4, {
      shade: 1,
      lift: 0.25,
      tension: 0.45,
      duration: 0.04,
      closed: path.closed,
    });
  });
}

/* ---------------------------------------------------------- 行人 / 车辆 */

const PERSON = { walk: 1.35, run: 2.1 };

type Walker = {
  sampler: Sampler;
  t: number;
  speed: number;
  lateral: number;
  bob: number;
  scale: number;
  colour: THREE.Color;
};

type Car = {
  axis: 'x' | 'z';
  across: number;
  t: number;
  speed: number;
  dir: number;
  colour: THREE.Color;
  truck: boolean;
};

export type Traffic = {
  group: THREE.Group;
  update: (dt: number) => void;
  setVisible: (visible: boolean) => void;
  counts: { people: number; cars: number };
  dispose: () => void;
};

export function buildTraffic(progress: { value: number }): Traffic {
  const rand = makeRandom(20260927);
  const group = new THREE.Group();
  group.name = 'traffic';
  const disposables: { dispose: () => void }[] = [];

  /* ---------------------------------------------------------- 行人 */
  const samplers = FLOW_PATHS.map((p) => ({ sampler: makeSampler(p.points), width: p.width }));
  // 三条街区内部的环线：让人不只出现在主轴上，否则街角会空得像废弃。
  const loops: [number, number][][] = [
    [
      [-118, -100],
      [60, -98],
      [128, -100],
      [130, 40],
      [128, 102],
      [-10, 104],
      [-120, 102],
      [-121, 20],
    ],
    [
      [-22, 30],
      [10, 24],
      [46, 26],
      [56, 62],
      [40, 96],
      [4, 100],
      [-24, 74],
    ],
    [
      [100, -96],
      [128, -60],
      [130, 10],
      [108, 30],
      [72, 24],
      [40, -20],
      [64, -70],
    ],
  ];
  loops.forEach((pts) => samplers.push({ sampler: makeSampler(pts, true), width: 7 }));

  const totalWeight = samplers.reduce((sum, s) => sum + s.width, 0);
  const walkers: Walker[] = [];
  const PEOPLE = 190;
  for (let i = 0; i < PEOPLE; i++) {
    let pick = rand() * totalWeight;
    let chosen = samplers[0];
    for (const s of samplers) {
      pick -= s.width;
      if (pick <= 0) {
        chosen = s;
        break;
      }
    }
    const colour = new THREE.Color();
    const roll = rand();
    if (roll < 0.42) colour.setHSL(0.6, 0.05, 0.14 + rand() * 0.1);
    else if (roll < 0.72) colour.setHSL(0.08, 0.14, 0.42 + rand() * 0.2);
    else if (roll < 0.9) colour.setHSL(0.58, 0.2, 0.34 + rand() * 0.22);
    else colour.setHSL(0.01, 0.42, 0.5 + rand() * 0.16);
    walkers.push({
      sampler: chosen.sampler,
      t: rand(),
      speed: (PERSON.walk + rand() * 0.9) * (rand() < 0.12 ? 0.35 : 1),
      lateral: (rand() - 0.5) * 0.72,
      bob: rand() * Math.PI * 2,
      scale: 0.9 + rand() * 0.22,
      colour,
    });
  }

  /* ---------------------------------------------------------- 车辆 */
  const cars: Car[] = [];
  const LANES = [1.875, 5.625, 9.375];
  for (const cz of [ROADS.north, ROADS.south]) {
    for (const lane of LANES) {
      for (const dir of [1, -1] as number[]) {
        const count = 2;
        for (let i = 0; i < count; i++) {
          const colour = new THREE.Color();
          colour.setHSL(rand() * 0.09 + 0.55 * (rand() < 0.55 ? 1 : 0), 0.04 + rand() * 0.5, 0.24 + rand() * 0.62);
          cars.push({
            axis: 'x',
            across: cz + dir * lane,
            t: rand(),
            speed: 8 + rand() * 8,
            dir,
            colour,
            truck: rand() < 0.2,
          });
        }
      }
    }
  }
  for (const cx of [ROADS.west, ROADS.east]) {
    for (const lane of LANES) {
      for (const dir of [1, -1] as number[]) {
        for (let i = 0; i < 2; i++) {
          const colour = new THREE.Color();
          colour.setHSL(rand() * 0.09 + 0.55 * (rand() < 0.55 ? 1 : 0), 0.04 + rand() * 0.5, 0.24 + rand() * 0.62);
          cars.push({
            axis: 'z',
            across: cx + dir * lane,
            t: rand(),
            speed: 8 + rand() * 8,
            dir,
            colour,
            truck: rand() < 0.2,
          });
        }
      }
    }
  }

  /* ------------------------------------------------------ 行人几何 */
  // 一个人 = 一件大衣 + 一个头。刻意做成低多边形剪影，和参考图里那些
  // 深色小人是同一种画法；真实比例的人在 250 m 的沙盘里只有十几个像素。
  const body = new THREE.CylinderGeometry(0.21, 0.29, 1.32, 7);
  body.translate(0, 0.9, 0);
  const head = new THREE.IcosahedronGeometry(0.19, 0);
  head.translate(0, 1.68, 0);
  const personGeometry = mergeSimple([body, head]);
  body.dispose();
  head.dispose();

  const personMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.25,
  });
  const personMesh = new THREE.InstancedMesh(personGeometry, personMaterial, walkers.length);
  personMesh.castShadow = false;
  personMesh.receiveShadow = false;
  personMesh.frustumCulled = false;
  personMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(personMesh);
  disposables.push(personGeometry, personMaterial);

  /* ------------------------------------------------------ 车辆几何 */
  const carBody = new THREE.BoxGeometry(2.0, 0.86, 4.6);
  carBody.translate(0, 0.62, 0);
  colourise(carBody, 1);
  const carCabin = new THREE.BoxGeometry(1.72, 0.72, 2.3);
  carCabin.translate(0, 1.4, -0.15);
  colourise(carCabin, 0.52);
  const carGeometry = mergeSimple([carBody, carCabin]);
  carBody.dispose();
  carCabin.dispose();

  const carMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.34,
    envMapIntensity: 1.1,
    vertexColors: true,
  });
  const carMesh = new THREE.InstancedMesh(carGeometry, carMaterial, cars.length);
  carMesh.castShadow = false;
  carMesh.receiveShadow = false;
  carMesh.frustumCulled = false;
  carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(carMesh);
  disposables.push(carGeometry, carMaterial);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const groundY = 0.4;

  const update = (dt: number) => {
    const grow = Math.min(1, Math.max(0, (progress.value - PHASE.props[0]) / 0.08));

    walkers.forEach((w, i) => {
      w.t += (w.speed * dt) / Math.max(1, w.sampler.length);
      const p = w.sampler.at(w.t);
      // 侧向偏移：一队人走在一条线上像仪仗队，撒开才像人流。
      const nx = -p.dz;
      const nz = p.dx;
      const off = w.lateral * 1.6;
      w.bob += dt * (5.5 + w.speed);
      position.set(p.x + nx * off, groundY + Math.abs(Math.sin(w.bob)) * 0.055, p.z + nz * off);
      quaternion.setFromAxisAngle(axis, Math.atan2(p.dx, p.dz));
      scaleV.setScalar(w.scale);
      personMesh.setMatrixAt(i, matrix.compose(position, quaternion, scaleV));
      personMesh.setColorAt(i, w.colour);
    });
    personMesh.instanceMatrix.needsUpdate = true;
    if (personMesh.instanceColor) personMesh.instanceColor.needsUpdate = true;

    const span = 264;
    cars.forEach((c, i) => {
      c.t += (c.speed * dt) / (span * 2);
      const u = ((c.t % 1) + 1) % 1;
      const along = -span + u * span * 2;
      if (c.axis === 'x') {
        position.set(c.dir * along, groundY, c.across);
        quaternion.setFromAxisAngle(axis, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else {
        position.set(c.across, groundY, c.dir * along);
        quaternion.setFromAxisAngle(axis, c.dir > 0 ? 0 : Math.PI);
      }
      scaleV.set(1, c.truck ? 1.35 : 1, c.truck ? 1.28 : 1);
      carMesh.setMatrixAt(i, matrix.compose(position, quaternion, scaleV));
      carMesh.setColorAt(i, c.colour);
    });
    carMesh.instanceMatrix.needsUpdate = true;
    if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;

    const visible = grow > 0.02;
    personMesh.visible = visible;
    carMesh.visible = visible;
    personMaterial.opacity = grow;
    personMaterial.transparent = grow < 0.999;
  };

  update(0);

  return {
    group,
    update,
    setVisible(visible: boolean) {
      group.visible = visible;
    },
    counts: { people: walkers.length, cars: cars.length },
    dispose() {
      group.removeFromParent();
      disposables.forEach((d) => d.dispose());
    },
  };
}

/* -------------------------------------------------------------- 工具 */

function mergeSimple(geometries: THREE.BufferGeometry[]) {
  const merged = geometries.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  const total = merged.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  let offset = 0;
  merged.forEach((g, gi) => {
    const count = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    const src = g.getAttribute('color');
    if (src) color.set(src.array as Float32Array, offset * 3);
    else color.fill(1, offset * 3, (offset + count) * 3);
    offset += count;
    if (gi >= 0) g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return out;
}

function colourise(geometry: THREE.BufferGeometry, value: number) {
  const count = geometry.getAttribute('position').count;
  const color = new Float32Array(count * 3).fill(value);
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
}
