import * as THREE from 'three';
import { makeRandom } from './rng';
import { BLOCK, PARK, PHASE } from './layout';

/** 全场景植被共用一个时钟。每帧写一次。 */
export const WIND_TIME = { value: 0 };

type Kind = 'street' | 'columnar' | 'park';

type Tree = {
  x: number;
  z: number;
  y: number;
  rot: number;
  start: number;
  trunkH: number;
  trunkR: number;
  crownR: number;
  kind: Kind;
  colour: THREE.Color;
};

/* ------------------------------------------------------------ 树位分布 */

function collectTrees(): Tree[] {
  const rand = makeRandom(90210);
  const span = PHASE.park;
  const spots: { x: number; z: number; y: number; kind: Kind }[] = [];
  const push = (x: number, z: number, y: number, kind: Kind) => spots.push({ x, z, y, kind });

  // 行道树：街区一侧。间距 14 m，比现实略疏 —— 缩微尺度下密排会糊成一条绿带。
  for (let x = BLOCK.x0 + 5; x <= BLOCK.x1 - 5; x += 14) {
    push(x, -111, 0.34, 'street');
    push(x + 7, 115, 0.34, 'street');
  }
  for (let z = BLOCK.z0 + 5; z <= BLOCK.z1 - 5; z += 14) {
    push(-129, z, 0.34, 'street');
    push(139, z + 7, 0.34, 'street');
  }

  // 外侧人行道：隔一棵放一棵，只作为画面外圈的绿色节奏。
  for (let x = -130; x <= 140; x += 28) {
    push(x, -153, 0.34, 'columnar');
    push(x + 14, 157, 0.34, 'columnar');
  }
  for (let z = -140; z <= 145; z += 28) {
    push(-171, z, 0.34, 'columnar');
    push(181, z + 14, 0.34, 'columnar');
  }

  // 公园里成组的树：三五个一丛。均匀铺开就不像公园，像草地贴图。
  const clusters: [number, number, number][] = [
    [-72, 38, 4],
    [-46, 52, 5],
    [-18, 42, 4],
    [-64, 84, 5],
    [-34, 92, 4],
    [-4, 96, 3],
    [-84, 62, 3],
    [2, 62, 3],
  ];
  for (const [cx, cz, n] of clusters) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * 15;
      push(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.36, 'park');
    }
  }

  // 广场树阵：给硬质铺装一点垂直节奏。
  for (let i = 0; i < 6; i++) push(-6 + i * 13, 102, 0.3, 'street');
  for (let i = 0; i < 4; i++) push(-46 + i * 15, 22, 0.3, 'street');
  for (let i = 0; i < 3; i++) push(6, -66 + i * 15, 0.3, 'street');
  for (let i = 0; i < 3; i++) push(112, -20 + i * 16, 0.3, 'street');

  const inPark = (x: number, z: number) =>
    x > PARK.cx - PARK.w / 2 && x < PARK.cx + PARK.w / 2 && z > PARK.cz - PARK.d / 2 && z < PARK.cz + PARK.d / 2;

  return spots
    // 落进建筑或绿地之外的行道树要剔掉，否则会出现"树从楼里长出来"。
    .filter((s) => !(inPark(s.x, s.z) && s.kind !== 'park'))
    .map((spot, index) => {
      const kind = spot.kind;
      const scale = kind === 'park' ? 0.95 + rand() * 0.5 : 0.82 + rand() * 0.42;
      const colour = new THREE.Color();
      // 参考图的树是**亮黄绿**，不是深绿：轴测分析图里深绿会立刻把图面压沉。
      colour.setHSL(0.222 + rand() * 0.042, 0.33 + rand() * 0.15, 0.46 + rand() * 0.14);
      return {
        x: spot.x,
        z: spot.z,
        y: spot.y,
        rot: rand() * Math.PI * 2,
        start: span[0] + (span[1] - span[0]) * (0.04 + ((index % 19) / 19) * 0.68),
        // 尺度参照：1 个世界单位 = 1 m，层高 3.9，所以一棵行道树是 9 m 上下。
        // 这个数错了整栋楼就会读成玩具 —— 建筑微缩最刺眼的一类 bug。
        trunkH: (kind === 'columnar' ? 5.0 : kind === 'park' ? 3.4 : 4.2) * scale,
        trunkR: (kind === 'columnar' ? 0.2 : 0.32) * scale,
        crownR: (kind === 'columnar' ? 1.9 : kind === 'park' ? 4.2 : 3.0) * scale,
        kind,
        colour,
      };
    });
}

/* ------------------------------------------------------------ 实例化植被 */

/**
 * 植被不能合批（每棵的位置与比例都不同），走 InstancedMesh：
 * 一整条林荫道 = 3 个 draw call，逐棵生长与顶点风摆都骑在同一个 `progress` 上。
 */
export function buildVegetation(progress: { value: number }) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const trees = collectTrees();

  /** 共享的生长 + 风摆补丁。`key` 必须按材质区分，否则两个变体会共用 program。 */
  const attach = (material: THREE.Material, strength: number, key: string) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = progress;
      shader.uniforms.uTime = WIND_TIME;
      shader.uniforms.uStrength = { value: strength };
      shader.vertexShader =
        'attribute float aStart;\nattribute float aAnchor;\nuniform float uProgress;\nuniform float uTime;\nuniform float uStrength;\nvarying float vGrow;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        float grow = clamp((uProgress - aStart) / 0.045, 0.0, 1.0);
        vGrow = grow;
        // 在各自的原点缩放：树干从地里顶出来，树冠从中心张开。
        transformed *= mix(0.001, 1.0, grow);
        // 相位取自世界坐标，**不能**用 instanceId —— 后者会让整排树同频抖动，
        // 看起来像贴图坏了。
        vec3 wpos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float phase = wpos.x * 0.32 + wpos.z * 0.24;
        float h = aAnchor;
        float sway = sin(uTime * 1.35 + phase) * 0.5 + sin(uTime * 2.6 + phase * 1.7) * 0.25;
        transformed.x += sway * uStrength * h * h * 0.34 * grow;
        transformed.z += sway * uStrength * h * h * 0.22 * grow;`,
        );
      shader.fragmentShader =
        'varying float vGrow;\n' +
        shader.fragmentShader.replace('void main() {', 'void main() { if (vGrow <= 0.0005) discard;');
    };
    material.customProgramCacheKey = () => key;
    material.needsUpdate = true;
    materials.push(material);
    return material;
  };

  // 阴影通道需要同一段位移，否则没长出来的树已经在投影。
  const depth = attach(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 1.0, 'twin-veg-depth-v1');

  const trunkGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 7);
  trunkGeometry.translate(0, 0.5, 0);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  addAnchor(trunkGeometry, (y) => y);
  addAnchor(crownGeometry, (y) => THREE.MathUtils.clamp((y + 1) * 0.5, 0, 1));

  const trunkStarts = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
  const crownStarts = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 2), 1);
  trunkGeometry.setAttribute('aStart', trunkStarts);
  crownGeometry.setAttribute('aStart', crownStarts);

  const trunkMaterial = attach(
    new THREE.MeshStandardMaterial({ color: 0x8a6f57, roughness: 0.94, metalness: 0, envMapIntensity: 0.25 }),
    0.5,
    'twin-veg-trunk-v1',
  );
  const crownMaterial = attach(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0, flatShading: true, envMapIntensity: 0.34 }),
    1.0,
    'twin-veg-crown-v1',
  );

  const trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  // 两团树冠读起来才是"一顶树冠"，一团就是个棒棒糖。
  const crown = new THREE.InstancedMesh(crownGeometry, crownMaterial, trees.length * 2);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  let crownIndex = 0;

  trees.forEach((tree, index) => {
    quaternion.setFromAxisAngle(axis, tree.rot);
    position.set(tree.x, tree.y, tree.z);
    scale.set(tree.trunkR, tree.trunkH, tree.trunkR);
    trunk.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    trunk.setColorAt(index, tree.colour.clone().multiplyScalar(0.55));
    trunkStarts.setX(index, tree.start);

    const columnar = tree.kind === 'columnar';
    const blobs: [number, number, number, number, number][] = columnar
      ? [
          [0, tree.trunkH + tree.crownR * 0.95, 0, 1, 0],
          [0, tree.trunkH + tree.crownR * 1.75, 0, 0.66, 0.012],
        ]
      : [
          [0, tree.trunkH + tree.crownR * 0.66, 0, 1, 0],
          [tree.crownR * 0.48, tree.trunkH + tree.crownR * 1.02, -tree.crownR * 0.3, 0.66, 0.01],
        ];
    for (const [ox, oy, oz, r, delay] of blobs) {
      position.set(tree.x + ox, tree.y + oy, tree.z + oz);
      scale.set(
        tree.crownR * r,
        tree.crownR * r * (columnar ? 1.4 : tree.kind === 'park' ? 0.92 : 1),
        tree.crownR * r,
      );
      crown.setMatrixAt(crownIndex, matrix.compose(position, quaternion, scale));
      crown.setColorAt(crownIndex, tree.colour);
      crownStarts.setX(crownIndex, tree.start + delay);
      crownIndex++;
    }
  });

  for (const mesh of [trunk, crown]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = depth;
    group.add(mesh);
  }
  trunkStarts.needsUpdate = true;
  crownStarts.needsUpdate = true;
  geometries.push(trunkGeometry, crownGeometry);

  /* --- 接触阴影 --- */
  // 树的实时阴影要求阴影贴图每帧更新（树叶一直在摆），代价太大。改成在地面贴一块
  // 柔和暗斑 —— 缩微尺度下几乎看不出区别，却把阴影贴图彻底解放出来，只在建造
  // 进度变化时才需要重画。这是能稳住 60 FPS 的关键取舍之一。
  const blotGeometry = new THREE.CircleGeometry(1, 20);
  blotGeometry.rotateX(-Math.PI / 2);
  addAnchor(blotGeometry, () => 0);
  const blotStarts = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
  blotGeometry.setAttribute('aStart', blotStarts);
  const blobMaterial = attach(
    new THREE.MeshBasicMaterial({
      map: makeBlobTexture(),
      transparent: true,
      depthWrite: false,
      color: 0x2b3138,
      opacity: 0.32,
    }),
    0,
    'twin-veg-blot-v1',
  );
  const blots = new THREE.InstancedMesh(blotGeometry, blobMaterial, trees.length);
  trees.forEach((tree, index) => {
    quaternion.setFromAxisAngle(axis, 0);
    position.set(tree.x, tree.y + 0.014, tree.z);
    const r = tree.crownR * 1.05;
    scale.set(r, 1, r);
    blots.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    blotStarts.setX(index, tree.start);
  });
  blots.instanceMatrix.needsUpdate = true;
  blotStarts.needsUpdate = true;
  blots.frustumCulled = false;
  blots.renderOrder = 1;
  group.add(blots);
  geometries.push(blotGeometry);

  return {
    group,
    count: trees.length,
    dispose() {
      group.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      (blobMaterial as THREE.MeshBasicMaterial).map?.dispose();
      depth.dispose();
    },
  };
}

/** 把摆动权重烘进顶点：根部 0、梢部 1。着色器因此不需要知道自己在画哪一棵。 */
function addAnchor(geometry: THREE.BufferGeometry, weight: (y: number) => number) {
  const position = geometry.getAttribute('position');
  const anchor = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) anchor[i] = weight(position.getY(i));
  geometry.setAttribute('aAnchor', new THREE.BufferAttribute(anchor, 1));
}

function makeBlobTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
