import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NO_CAST, NO_RECEIVE, NO_UV_JITTER, type SurfaceName } from './materials';
import { variation } from './rng';

export type Point = [number, number, number];

type Transform = {
  p?: Point;
  r?: Point;
  s?: Point;
  /** 折进顶点色的亮度系数。用它压暗檐底、凹槽或室内面，不必新开材质。 */
  shade?: number;
  /** 逐通道颜色系数，用于一次性色偏。 */
  tint?: Point;
  /** 到位耗时，单位是 progress（整条时间轴的 0..1），不是秒。 */
  duration?: number;
  /** 落位行程，世界单位。 */
  lift?: number;
  /** 落位方向，默认 [0,1,0] = 从上方落下。 */
  drift?: Point;
  /** 是否同时生成一条分析图式的黑色描边。 */
  edge?: boolean;
  /**
   * UV 重映射。挤出盒已经输出世界单位 UV，但平面 / 圆盘 / 圆柱的 UV 是 0..1，
   * 直接贴图会被拉伸成"大字报"。传 [世界宽, 世界高] 把它们拉回 1 tile = 1 m。
   */
  uvScale?: [number, number];
};

/**
 * 按材质合批，并把建造时序烘进每一个顶点。
 *
 * 一座街区是几千块构件；不合批就是几千个 draw call。按材质归桶、
 * `mergeGeometries` 合并后，**每种材质只剩 1 个 Mesh**，而运动住在顶点着色器里，
 * 于是整个场景由一个 `progress` 标量驱动。
 *
 * 构件**永远不透明、永远实体**：它们位移、落位、停稳，从不淡入。
 * 这才是"施工"，不是"溶解"。
 */
export class StructureBuilder {
  private batches = new Map<SurfaceName, THREE.BufferGeometry[]>();
  private edges: THREE.BufferGeometry[] = [];
  private cache = new Map<string, THREE.BufferGeometry>();
  private transform = new THREE.Object3D();
  /** 所有注入过的材质共用。每帧写一次。 */
  readonly progress = { value: 0 };
  readonly meshes: THREE.Mesh[] = [];
  private depths: THREE.MeshDepthMaterial[] = [];
  private injected: THREE.Material[] = [];
  pieces = 0;
  edgePieces = 0;

  /**
   * 自发光输出随**每一块构件**落地而爬升的表面（而不是跟着材质一起开）。
   *
   * 在 `finish()` 之前登记，然后把这些构件排进"点灯"窗口而不是"施工"窗口：
   * 每个窗口各自亮起，错开的排程让灯光沿立面往上爬。比一个全局 emissive
   * uniform 可控得多，也比室内点光源便宜得多（点光源会被楼板天花整块吃掉）。
   */
  readonly rampedEmissive = new Set<SurfaceName>();

  constructor(readonly surfaces: Record<SurfaceName, THREE.Material>) {}

  add(geometry: THREE.BufferGeometry, material: SurfaceName, start: number, options: Transform = {}) {
    const baked = this.bake(geometry, material, options, start);
    let bucket = this.batches.get(material);
    if (!bucket) {
      bucket = [];
      this.batches.set(material, bucket);
    }
    bucket.push(baked);
    this.pieces++;
  }

  /** 烘到世界空间，写入 aBuild / aOffset / color 三个顶点属性。 */
  private bake(geometry: THREE.BufferGeometry, material: SurfaceName, options: Transform, start: number) {
    this.transform.position.set(...(options.p ?? [0, 0, 0]));
    this.transform.rotation.set(...(options.r ?? [0, 0, 0]));
    this.transform.scale.set(...(options.s ?? [1, 1, 1]));
    this.transform.updateMatrix();

    // 合批后 Mesh 保持单位矩阵，所以几何必须在提交时就已经在世界空间。
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(this.transform.matrix);

    const count = g.getAttribute('position').count;
    const schedule = new Float32Array(count * 3);
    const offset = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const shade = options.shade ?? 1;
    const tint = options.tint ?? [1, 1, 1];
    const drift = options.drift ?? [0, 1, 0];
    const lift = options.lift ?? 0.45;
    const duration = options.duration ?? 0.013;

    // 逐块平移 UV 图集，避免重复的铺装与混凝土板出现一模一样的纹理。
    const uv = g.getAttribute('uv');
    if (uv) {
      if (options.uvScale) {
        const [su, sv] = options.uvScale;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
      }
      if (!NO_UV_JITTER.includes(material)) {
        const shift = variation(this.pieces);
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + shift, uv.getY(i) + shift * 0.731);
      }
    }

    const normal = g.getAttribute('normal');
    for (let i = 0; i < count; i++) {
      schedule.set([start, duration, lift], i * 3);
      offset.set(drift, i * 3);
      // 朝下的面读起来更暗：几何相接处最廉价的 AO。
      const occlusion = normal
        ? THREE.MathUtils.lerp(0.74, 1, THREE.MathUtils.smoothstep(normal.getY(i), -0.85, 0.15))
        : 1;
      color.set(
        [tint[0] * shade * occlusion, tint[1] * shade * occlusion, tint[2] * shade * occlusion],
        i * 3,
      );
    }

    g.setAttribute('aBuild', new THREE.BufferAttribute(schedule, 3));
    g.setAttribute('aOffset', new THREE.BufferAttribute(offset, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const key of Object.keys(g.attributes)) {
      // 顶点属性只能有这六个，多一个都会让 mergeGeometries 因属性集不一致而失败。
      if (!['position', 'normal', 'uv', 'aBuild', 'aOffset', 'color'].includes(key)) g.deleteAttribute(key);
    }
    return g;
  }

  geo(key: string, fn: () => THREE.BufferGeometry) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key)!;
  }

  /**
   * 圆角微倒角盒。大于 ~0.18 单位时走挤出路径：多花几个三角形，换两件对
   * 玻璃与混凝土建筑真正要紧的事 —— 每条楼板边缘都有一道能挂高光的倒角，
   * 以及**世界单位 UV**（1 个纹理 tile = 1 个世界单位），于是 0.5 m 的横梁
   * 和 20 m 的楼板带上，板缝的实际间距是一致的。
   */
  box(size: Point, p: Point, material: SurfaceName, start: number, options: Transform = {}) {
    const geometry = this.geo(`box:${size.join(',')}`, () => {
      if (Math.min(...size) < 0.18) return new THREE.BoxGeometry(...size);
      const [w, h, d] = size;
      const r = Math.min(...size) * 0.055;
      const outline = new THREE.Shape();
      outline.moveTo(-w / 2 + r, -h / 2 + r);
      outline.lineTo(w / 2 - r, -h / 2 + r);
      outline.lineTo(w / 2 - r, h / 2 - r);
      outline.lineTo(-w / 2 + r, h / 2 - r);
      outline.closePath();
      const g = new THREE.ExtrudeGeometry(outline, {
        depth: d - 2 * r,
        bevelEnabled: true,
        bevelThickness: r,
        bevelSize: r,
        bevelSegments: 1,
        steps: 1,
      });
      g.translate(0, 0, -d / 2 + r);
      return g;
    });
    this.add(geometry, material, start, { ...options, p });
    if (options.edge) this.addEdge(size, p, start, options);
  }

  /** 水平薄片（车道标线、覆土、水盘）。2 个三角形，场景里最便宜的一类构件。 */
  plate(w: number, d: number, p: Point, material: SurfaceName, start: number, options: Transform = {}) {
    const geometry = this.geo('plate', () => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    this.add(geometry, material, start, { ...options, p, s: [w, 1, d], uvScale: [w, d] });
  }

  /** 竖直圆柱（桥墩、旗杆、树干、雕塑）。 */
  cylinder(r: number, h: number, p: Point, material: SurfaceName, start: number, options: Transform = {}, seg = 16) {
    const geometry = this.geo(`cyl:${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg));
    this.add(geometry, material, start, {
      ...options,
      p,
      s: [r, h, r],
      uvScale: options.uvScale ?? [Math.PI * 2 * r, h],
    });
  }

  /** 圆盘（广场同心环底面、树池、雨篷）。 */
  disk(r: number, p: Point, material: SurfaceName, start: number, options: Transform = {}, seg = 48) {
    const geometry = this.geo(`disk:${seg}`, () => {
      const g = new THREE.CircleGeometry(1, seg);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    this.add(geometry, material, start, { ...options, p, s: [r, 1, r], uvScale: [r * 2, r * 2] });
  }

  /** 圆环壁（喷泉池壁、树池边）。 */
  ring(rInner: number, rOuter: number, h: number, p: Point, material: SurfaceName, start: number, options: Transform = {}, seg = 48) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * rOuter;
      const y = Math.sin(a) * rOuter;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const hole = new THREE.Path();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * rInner;
      const y = Math.sin(a) * rInner;
      if (i === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 });
    // rotateX(-90°) 之后，挤出方向正好是 +Y，所以原点就是底标高。
    g.rotateX(-Math.PI / 2);
    this.add(g, material, start, { ...options, p });
    g.dispose();
  }

  /**
   * 分析图式的描边轮廓线。全部收集起来合成一个 LineSegments —— 这是参考图
   * 最强的图面语言（体量轮廓压黑边），代价只有 1 个 draw call。
   */
  private addEdge(size: Point, p: Point, start: number, options: Transform) {
    const box = new THREE.BoxGeometry(...size);
    const edges = new THREE.EdgesGeometry(box, 25);
    box.dispose();
    this.transform.position.set(...p);
    this.transform.rotation.set(...(options.r ?? [0, 0, 0]));
    this.transform.scale.set(...(options.s ?? [1, 1, 1]));
    this.transform.updateMatrix();
    edges.applyMatrix4(this.transform.matrix);
    const count = edges.getAttribute('position').count;
    const schedule = new Float32Array(count * 3);
    const offset = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const drift = options.drift ?? [0, 1, 0];
    const lift = (options.lift ?? 0.45) + 0.02;
    const duration = options.duration ?? 0.013;
    for (let i = 0; i < count; i++) {
      schedule.set([start, duration, lift], i * 3);
      offset.set(drift, i * 3);
      color.set([1, 1, 1], i * 3);
    }
    edges.setAttribute('aBuild', new THREE.BufferAttribute(schedule, 3));
    edges.setAttribute('aOffset', new THREE.BufferAttribute(offset, 3));
    edges.setAttribute('color', new THREE.BufferAttribute(color, 3));
    this.edges.push(edges as THREE.BufferGeometry);
    this.edgePieces++;
  }

  /** 合并所有桶、注入生长顶点动画、挂到场景上。所有几何提交完之后调用一次。 */
  finish(scene: THREE.Scene) {
    const inject = (m: THREE.Material, surface: SurfaceName | null) => {
      const ramped = surface !== null && this.rampedEmissive.has(surface);
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uBuildProgress = this.progress;
        shader.vertexShader =
          'attribute vec3 aBuild;\nattribute vec3 aOffset;\nuniform float uBuildProgress;\nvarying float vConstruction;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
        float buildT = clamp((uBuildProgress - aBuild.x) / max(.0001, aBuild.y), 0.0, 1.0);
        vConstruction = buildT;
        // 三次缓出：构件落得很快，最后几厘米是蹭过去的。
        float arrive = pow(1.0 - buildT, 3.0);
        // 一次阻尼回弹，让沉重的楼板"咚"一下，而不是滑进去。
        float thud = sin(buildT * 6.2831853) * pow(1.0 - buildT, 2.0) * 0.035;
        transformed += aOffset * aBuild.z * (arrive - thud);`,
          );
        let fragment =
          'varying float vConstruction;\n' +
          shader.fragmentShader.replace('void main() {', 'void main() { if (vConstruction <= 0.0) discard;');
        if (ramped) {
          fragment = fragment.replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= smoothstep(0.35, 1.0, vConstruction);',
          );
        }
        shader.fragmentShader = fragment;
      };
      // 只要 shader 源码不同，cacheKey 就必须不同，否则两个变体会共用同一个
      // program，表现成"灯光完全不亮"。
      m.customProgramCacheKey = () => (ramped ? 'twin-assembly-ramp-v1' : 'twin-assembly-v1');
      this.injected.push(m);
    };

    for (const [name, geometries] of this.batches) {
      const combined = mergeGeometries(geometries, false);
      if (!combined) continue;
      combined.computeBoundingSphere();
      combined.computeBoundingBox();
      geometries.forEach((g) => g.dispose());
      const material = this.surfaces[name];
      inject(material, name);
      const mesh = new THREE.Mesh(combined, material);
      mesh.name = `surface-${name}`;
      mesh.castShadow = !NO_CAST.includes(name);
      mesh.receiveShadow = !NO_RECEIVE.includes(name);
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      inject(depth, null);
      mesh.customDepthMaterial = depth;
      this.depths.push(depth);
      this.meshes.push(mesh);
      scene.add(mesh);
    }

    if (this.edges.length) {
      const combined = mergeGeometries(this.edges, false);
      if (combined) {
        this.edges.forEach((g) => g.dispose());
        const material = new THREE.LineBasicMaterial({
          color: 0x1e2226,
          transparent: true,
          opacity: 0.46,
          vertexColors: true,
          depthWrite: false,
        });
        inject(material, null);
        const lines = new THREE.LineSegments(combined, material);
        lines.name = 'outline';
        lines.renderOrder = 3;
        lines.frustumCulled = false;
        scene.add(lines);
      }
    }

    this.cache.forEach((g) => g.dispose());
    this.cache.clear();
    this.batches.clear();
    this.edges.length = 0;
  }

  dispose() {
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      m.removeFromParent();
    });
    this.depths.forEach((m) => m.dispose());
    this.injected.forEach((m) => m.dispose());
    this.meshes.length = 0;
  }
}
