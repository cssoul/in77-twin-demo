import * as THREE from 'three';
import { makeRandom } from './rng';
import type { SkySpec } from './daylight';
import { SCREEN_ASPECT } from './layout';
import { ADVERT_SRC, SIGN_SRC, applyAdvert } from './advert';

/**
 * 表面清单。**新增一种材质 = 新增一个 draw call**，所以这份表刻意收窄：
 * 同一种石材既做广场又做台阶，靠 `shade` 顶点色区分层次，不新开材质。
 */
export type SurfaceName =
  | 'concrete' // 清水混凝土：结构柱、桥墩、核心筒
  | 'concreteDeep' // 背光混凝土：楼板底、室内
  | 'white' // 白色幕墙板、女儿墙、雨篷
  | 'stone' // 花岗岩铺装
  | 'plaza' // 广场大板铺装（1 个纹理 tile = 6 m，自带板缝网格）
  | 'paving' // 人行道铺装
  | 'roof' // 屋面砾石
  | 'planting' // 树池种植土 / 花坛
  | 'asphalt' // 车行道
  | 'lane' // 车道标线 / 斑马线
  | 'kerb' // 路缘石、台阶
  | 'metal' // 铝型材：竖梃、栏杆、桥架
  | 'steel' // 深色钢：灯柱、旗杆、雕塑
  | 'wood' // 木平台、座椅、门头
  | 'bark' // 树干
  | 'leaf' // 树冠（实例色驱动）
  | 'grass' // 草坪
  | 'hedge' // 绿篱、灌木
  | 'glass' // 塔楼镜面幕墙（镀膜，不透明）
  | 'glassMall' // 商场橱窗玻璃
  | 'glassClear' // 通透大堂玻璃
  | 'glassBridge' // 连廊蓝玻璃
  | 'glow' // 室内暖光、灯头
  | 'glowCool' // 冷白灯带
  | 'screen' // LED 广告屏
  | 'sign' // 品牌门头
  | 'water' // 水面
  | 'flow' // 人流动线（贴图滚动 = 方向）
  | 'context'; // 背景低模城市（实例色驱动）

export const NO_CAST: SurfaceName[] = [
  'glass', 'glassMall', 'glassClear', 'glassBridge', 'water', 'glow', 'glowCool', 'screen', 'sign', 'grass', 'flow', 'context',
];
export const NO_RECEIVE: SurfaceName[] = [
  'glass', 'glassMall', 'glassClear', 'glassBridge', 'water', 'glow', 'glowCool', 'screen', 'sign', 'flow',
];
/** 分缝必须对齐的表面，不做 UV 抖动。 */
export const NO_UV_JITTER: SurfaceName[] = [
  'glass', 'glassMall', 'glassClear', 'glassBridge', 'glow', 'glowCool', 'screen', 'sign', 'water', 'white', 'lane', 'plaza',
  'flow',
];

type Feature = 'boardform' | 'paneljoint' | 'brushed' | 'slats' | 'foliage' | 'gravel' | 'speckle' | 'asphalt' | 'bark' | 'slab';

/** 1 个纹理 tile 覆盖多少世界单位。默认 1（1 tile = 1 m）。 */
const TILE_METRES: Partial<Record<SurfaceName, number>> = {
  plaza: 6,
  asphalt: 2,
};

const PALETTE: Record<SurfaceName, string> = {
  concrete: '#cbc8c0',
  concreteDeep: '#93918b',
  white: '#eceae4',
  stone: '#c6c0b4',
  plaza: '#bdb6a8',
  paving: '#b9b4aa',
  roof: '#ada89f',
  planting: '#5a4a38',
  asphalt: '#4f5357',
  lane: '#f4f4ee',
  kerb: '#dcd8ce',
  metal: '#b8bdc2',
  steel: '#6e7276',
  wood: '#c69c6c',
  bark: '#7d6653',
  leaf: '#ffffff',
  grass: '#a6c67a',
  hedge: '#6d9147',
  glass: '#8fb6cf',
  glassMall: '#a9c9d9',
  glassClear: '#c2d3dd',
  glassBridge: '#7fb2d2',
  glow: '#4a4034',
  glowCool: '#3b4148',
  screen: '#20242a',
  sign: '#e8e6e0',
  water: '#20414f',
  flow: '#e2714f',
  context: '#ffffff',
};

const FEATURE: Partial<Record<SurfaceName, Feature>> = {
  concrete: 'boardform',
  concreteDeep: 'boardform',
  white: 'paneljoint',
  metal: 'brushed',
  steel: 'brushed',
  wood: 'slats',
  grass: 'foliage',
  hedge: 'foliage',
  stone: 'speckle',
  plaza: 'slab',
  roof: 'gravel',
  planting: 'speckle',
  paving: 'speckle',
  kerb: 'speckle',
  asphalt: 'asphalt',
  bark: 'bark',
};

/** 自发光底色。刻意压在 1.0–1.35：ACES 会把更高的值压成纯白，窗就不再像窗。 */
const EMISSIVE: Partial<Record<SurfaceName, { color: string; intensity: number }>> = {
  glow: { color: '#ffd2a0', intensity: 1.25 },
  glowCool: { color: '#cfe2ff', intensity: 1.15 },
  screen: { color: '#ffffff', intensity: 1.0 },
  sign: { color: '#ffffff', intensity: 0.95 },
};

const FEATURE_SIZE: Partial<Record<SurfaceName, number>> = {
  concrete: 1024,
  concreteDeep: 1024,
  white: 1024,
  stone: 1024,
};

export type MaterialKit = ReturnType<typeof createTwinMaterials>;

/**
 * 全部表面由 canvas 现画，没有图片文件、没有网络请求，同一种子永远得到同一面墙。
 *
 * **纹理尺度契约**：builder 的挤出盒输出了世界单位 UV，所以 1 个 tile 正好
 * 覆盖 1 个世界单位（≈ 1 米），1024 px 的画布上每 256 px 一条板缝 = 每 25 cm
 * 一道缝。宽构件与窄构件上的缝距因此一致。
 */
export function createTwinMaterials(renderer: THREE.WebGLRenderer, onTextureReady?: () => void) {
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];
  const output = {} as Record<SurfaceName, THREE.Material>;

  const track = (texture: THREE.Texture, repeat = true) => {
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = maxAnisotropy;
    textures.push(texture);
    return texture;
  };

  for (const name of Object.keys(PALETTE) as SurfaceName[]) {
    const base = PALETTE[name];

    /* ---------------------------------------------------- 反射玻璃 */
    // 塔楼幕墙是**不透明**镜面玻璃：建筑尺度上真实的镀膜玻璃本来就接近镜面，
    // 而且不透明是唯一能绕开几百块玻璃扇透明排序、同时拿到干净天空反射的做法。
    if (name === 'glass' || name === 'glassBridge') {
      const bridge = name === 'glassBridge';
      output[name] = new THREE.MeshPhysicalMaterial({
        color: base,
        metalness: bridge ? 0.7 : 0.88,
        roughness: bridge ? 0.08 : 0.05,
        envMapIntensity: bridge ? 1.2 : 1.55,
        clearcoat: 1,
        clearcoatRoughness: 0.035,
        vertexColors: true,
      });
      continue;
    }
    // 橱窗玻璃：略透，让室内暖光读得出来。面积小，排序压力可忽略。
    if (name === 'glassMall' || name === 'glassClear') {
      output[name] = new THREE.MeshPhysicalMaterial({
        color: base,
        metalness: 0.08,
        roughness: 0.035,
        transparent: true,
        opacity: name === 'glassMall' ? 0.5 : 0.38,
        envMapIntensity: 1.35,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        vertexColors: true,
      });
      continue;
    }

    /* ---------------------------------------------------- 水面 */
    if (name === 'water') {
      const ripple = document.createElement('canvas');
      ripple.width = ripple.height = 256;
      const rc = ripple.getContext('2d')!;
      const rr = makeRandom(7331);
      rc.fillStyle = '#808080';
      rc.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        const y = rr() * 256;
        const v = 108 + rr() * 40;
        rc.strokeStyle = `rgba(${v},${v},${v},.5)`;
        rc.lineWidth = 0.6 + rr() * 1.6;
        rc.beginPath();
        rc.moveTo(-10, y);
        rc.bezierCurveTo(80, y + (rr() - 0.5) * 14, 170, y + (rr() - 0.5) * 14, 266, y);
        rc.stroke();
      }
      const bump = track(new THREE.CanvasTexture(ripple));
      output[name] = new THREE.MeshPhysicalMaterial({
        color: base,
        roughness: 0.08,
        metalness: 0.1,
        envMapIntensity: 0.6,
        bumpMap: bump,
        bumpScale: 0.03,
        vertexColors: true,
      });
      continue;
    }

    /* ---------------------------------------------------- 人流动线 */
    // 参考图里那些橙红色宽带。它们在 3D 里必须**能滚动** —— 带宽代表流量、
    // 纹理流动代表方向，这才是"数字孪生正在运行"的那一半。贴图在运行时改写
    // `offset.y`，所以整条流线只需要 1 个 draw call。
    if (name === 'flow') {
      const canvas = paintFlow();
      const map = track(new THREE.CanvasTexture(canvas));
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = THREE.ClampToEdgeWrapping;
      // 沿路径方向每 9 m 一个箭头周期。
      map.repeat.set(1, 1 / 9);
      output[name] = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map,
        transparent: true,
        depthWrite: false,
        roughness: 0.62,
        metalness: 0,
        envMapIntensity: 0.2,
        vertexColors: true,
      });
      continue;
    }

    /* ---------------------------------------------------- 无贴图的纯色表面 */
    // 这些表面要么尺寸远小于一个纹理 tile（车道标线），要么由实例色驱动
    // 形状各异的几何（树冠、背景楼），套一张 0..1 的贴图只会被拉伸。给它们
    // 纯色 + 顶点色 / 实例色，既干净又省一张纹理。
    if (name === 'lane' || name === 'leaf' || name === 'context') {
      output[name] = new THREE.MeshStandardMaterial({
        color: base,
        roughness: name === 'leaf' ? 0.85 : name === 'lane' ? 0.72 : 0.9,
        metalness: 0,
        flatShading: name === 'leaf',
        envMapIntensity: name === 'lane' ? 0.35 : 0.3,
        vertexColors: true,
      });
      continue;
    }

    /* ---------------------------------------------------- LED 屏 / 门头 */
    if (name === 'screen') {
      const canvas = paintScreen();
      const map = track(new THREE.CanvasTexture(canvas), false);
      map.colorSpace = THREE.SRGBColorSpace;
      // 有 public/advert.jpg 就把画面换成它（等比铺满 + 居中 + 裁边），
      // 没有就保持程序化广告 —— 换素材不需要改代码。
      applyAdvert(canvas, ADVERT_SRC, () => {
        map.needsUpdate = true;
        onTextureReady?.();
      });
      output[name] = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map,
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: map,
        emissiveIntensity: EMISSIVE.screen!.intensity,
        roughness: 0.42,
        metalness: 0,
        vertexColors: true,
      });
      continue;
    }
    if (name === 'sign') {
      const canvas = paintSign();
      const map = track(new THREE.CanvasTexture(canvas), false);
      map.colorSpace = THREE.SRGBColorSpace;
      // 门头灯箱同理：public/sign.jpg 存在就顶上，否则保留程序化字标。
      applyAdvert(canvas, SIGN_SRC, () => {
        map.needsUpdate = true;
        onTextureReady?.();
      });
      output[name] = new THREE.MeshStandardMaterial({
        color: '#f2f0ea',
        map,
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: map,
        emissiveIntensity: EMISSIVE.sign!.intensity,
        roughness: 0.6,
        metalness: 0,
        vertexColors: true,
      });
      continue;
    }

    /* ---------------------------------------------------- 自发光 */
    if (EMISSIVE[name]) {
      const spec = EMISSIVE[name]!;
      output[name] = new THREE.MeshStandardMaterial({
        color: base,
        emissive: new THREE.Color(spec.color),
        emissiveIntensity: spec.intensity,
        roughness: 0.55,
        metalness: 0,
        vertexColors: true,
      });
      continue;
    }

    /* ---------------------------------------------------- 颜料型表面 */
    const feature = FEATURE[name];
    const size = FEATURE_SIZE[name] ?? 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const rand = makeRandom(83 + name.length * 101 + name.charCodeAt(0));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    if (feature === 'boardform') {
      // 木模板板缝 + 拉杆孔：这两笔才让混凝土读作"浇出来的"而不是"刷上去的"。
      const board = size / 4;
      for (let y = 0; y < size; y += board) {
        ctx.fillStyle = 'rgba(58,55,50,.18)';
        ctx.fillRect(0, y, size, 2);
        ctx.fillStyle = 'rgba(255,252,244,.12)';
        ctx.fillRect(0, y + 2, size, 1.5);
      }
      for (let y = board / 2; y < size; y += board) {
        for (let x = board / 2; x < size; x += board) {
          const r = size * 0.006;
          ctx.fillStyle = 'rgba(48,45,40,.34)';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,250,240,.18)';
          ctx.beginPath();
          ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 板缝以下的竖向雨痕。**不要**画成圆形污渍 —— 那是最像"贴图"的一处败笔。
      for (let i = 0; i < 34; i++) {
        const x = rand() * size;
        const w = size * (0.004 + rand() * 0.02);
        const h = size * (0.1 + rand() * 0.5);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(74,78,70,.11)');
        g.addColorStop(1, 'rgba(74,78,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, rand() * size * 0.4, w, h);
      }
    }

    if (feature === 'paneljoint') {
      ctx.fillStyle = 'rgba(122,120,114,.26)';
      ctx.fillRect(0, 0, 2.5, size);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(2.5, 0, 1.5, size);
      ctx.fillStyle = 'rgba(122,120,114,.12)';
      ctx.fillRect(0, size * 0.5, size, 2);
    }

    if (feature === 'brushed') {
      for (let i = 0; i < 1400; i++) {
        const x = rand() * size;
        ctx.strokeStyle =
          rand() > 0.5 ? `rgba(255,255,255,${0.02 + rand() * 0.09})` : `rgba(40,44,48,${0.02 + rand() * 0.08})`;
        ctx.lineWidth = 0.5 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (rand() - 0.5) * 6, size);
        ctx.stroke();
      }
    }

    if (feature === 'bark') {
      for (let i = 0; i < 420; i++) {
        const x = rand() * size;
        ctx.strokeStyle = rand() > 0.5 ? `rgba(46,34,24,${0.06 + rand() * 0.2})` : `rgba(216,196,168,${0.05 + rand() * 0.14})`;
        ctx.lineWidth = 1 + rand() * 3.5;
        ctx.beginPath();
        ctx.moveTo(x, -10);
        for (let y = 0; y <= size + 10; y += 24) ctx.lineTo(x + Math.sin(y * 0.021 + x * 0.11) * 5, y);
        ctx.stroke();
      }
    }

    if (feature === 'slats') {
      const slat = size / 8;
      for (let x = 0; x < size; x += slat) {
        ctx.fillStyle = 'rgba(60,38,18,.3)';
        ctx.fillRect(x, 0, 3, size);
        for (let i = 0; i < 14; i++) {
          ctx.strokeStyle = i % 3 ? 'rgba(92,58,26,.10)' : 'rgba(255,226,180,.12)';
          ctx.lineWidth = 0.4 + rand() * 1.2;
          const gx = x + 4 + rand() * (slat - 8);
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          for (let y = 0; y <= size; y += 16) ctx.lineTo(gx + Math.sin(y * 0.03 + gx) * 1.6, y);
          ctx.stroke();
        }
      }
    }

    if (feature === 'asphalt') {
      for (let i = 0; i < 2600; i++) {
        const v = 0.45 + rand() * 0.75;
        ctx.fillStyle = `rgba(${(96 * v) | 0},${(98 * v) | 0},${(101 * v) | 0},${0.1 + rand() * 0.3})`;
        const s = 0.6 + rand() * 2.6;
        ctx.fillRect(rand() * size, rand() * size, s, s);
      }
      // 沥青本身只画骨料。**不要**在纹理里画轮迹抛光带 —— 纹理是按世界单位平铺的，
      // 一条纵向亮带会变成每隔几米重复一次的条纹，比没有它难看得多。
    }

    if (feature === 'slab') {
      // 广场大板：一个纹理 tile 就是一块 6 m 花岗岩板，板缝落在 tile 边界上。
      // 这样整片广场只要 1 个构件、1 个 draw call，却有干净的板缝网格。
      ctx.fillStyle = 'rgba(120,114,104,.30)';
      ctx.fillRect(0, 0, size, 3.2);
      ctx.fillRect(0, 0, 3.2, size);
      ctx.fillStyle = 'rgba(255,252,246,.34)';
      ctx.fillRect(3.2, 0, 1.6, size);
      ctx.fillRect(0, 3.2, size, 1.6);
      for (let i = 0; i < 1100; i++) {
        const v = 0.55 + rand() * 0.6;
        ctx.fillStyle = `rgba(${(178 * v) | 0},${(172 * v) | 0},${(160 * v) | 0},${0.1 + rand() * 0.2})`;
        const s = size * (0.004 + rand() * 0.014);
        ctx.beginPath();
        ctx.arc(rand() * size, rand() * size, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (feature === 'foliage' || feature === 'gravel' || feature === 'speckle') {
      const blobs = feature === 'foliage' ? 340 : feature === 'gravel' ? 1500 : 900;
      for (let i = 0; i < blobs; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = feature === 'foliage' ? size * (0.02 + rand() * 0.09) : size * (0.004 + rand() * 0.014);
        const v = 0.5 + rand() * 0.5;
        ctx.fillStyle =
          feature === 'foliage'
            ? i % 3
              ? `rgba(30,52,22,${0.05 + rand() * 0.14})`
              : `rgba(190,214,138,${0.05 + rand() * 0.12})`
            : `rgba(${(160 * v) | 0},${(156 * v) | 0},${(148 * v) | 0},${0.16 + rand() * 0.22})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 矿物晕染：颜料是成片老化的，不是逐个 texel。
    for (let i = 0; i < 170; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = size * (0.02 + rand() * 0.13);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, i % 3 ? 'rgba(44,42,36,.04)' : 'rgba(252,250,240,.05)');
      gradient.addColorStop(1, 'rgba(120,116,104,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const grain = size === 1024 ? 24000 : 8000;
    for (let i = 0; i < grain; i++) {
      ctx.fillStyle =
        rand() > 0.45 ? `rgba(255,252,244,${0.03 + rand() * 0.11})` : `rgba(34,32,28,${0.025 + rand() * 0.08})`;
      const s = 0.5 + rand() * 1.6;
      ctx.fillRect(rand() * size, rand() * size, s, s);
    }

    const texture = track(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    const detail = document.createElement('canvas');
    detail.width = detail.height = 256;
    const dc = detail.getContext('2d')!;
    const pixels = dc.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const v = 128 + (rand() - 0.5) * (name === 'stone' || name === 'kerb' ? 60 : 24);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
        pixels.data[i + 3] = 255;
      }
    }
    dc.putImageData(pixels, 0, 0);
    const bump = track(new THREE.CanvasTexture(detail));

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = roughCanvas.height = 256;
    const roughCtx = roughCanvas.getContext('2d')!;
    roughCtx.fillStyle = name === 'stone' ? '#9c9c9c' : name === 'wood' ? '#d6d6d6' : '#eeeeee';
    roughCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      roughCtx.fillStyle = `rgba(58,58,58,${0.02 + rand() * 0.05})`;
      roughCtx.fillRect(rand() * 256, rand() * 256, 8 + rand() * 36, 8 + rand() * 36);
    }
    const roughness = track(new THREE.CanvasTexture(roughCanvas));

    // UV 已是世界单位（1 UV = 1 m），所以 repeat = 1 / tile 米数 就等于
    // "一个纹理 tile 覆盖 N 米"。三张图（色/凹凸/粗糙）必须同一个 repeat。
    const tile = TILE_METRES[name];
    if (tile) {
      for (const t of [texture, bump, roughness]) t.repeat.set(1 / tile, 1 / tile);
    }

    const bumpScale =
      name === 'concrete' ? 0.01
      : name === 'concreteDeep' ? 0.008
      : name === 'white' ? 0.004
      : name === 'wood' ? 0.016
      : name === 'stone' ? 0.02
      : name === 'paving' ? 0.022
      : name === 'kerb' ? 0.016
      : name === 'bark' ? 0.03
      : name === 'asphalt' ? 0.012
      : 0.006;

    const rigid = name === 'asphalt';
    output[name] = new THREE.MeshStandardMaterial({
      map: texture,
      bumpMap: bump,
      roughnessMap: roughness,
      bumpScale,
      roughness:
        name === 'metal' ? 0.3
        : name === 'steel' ? 0.54
        : name === 'stone' ? 0.6
        : name === 'asphalt' ? 0.86
        : 0.94,
      metalness: name === 'metal' ? 0.9 : name === 'steel' ? 0.76 : rigid ? 0.04 : 0,
      // 对程序化天空的反射强度。混凝土几乎不反光，金属件才是"尺度"的来源。
      envMapIntensity: name === 'metal' ? 1.0 : name === 'steel' ? 0.72 : name === 'white' ? 0.4 : rigid ? 0.25 : 0.28,
      vertexColors: true,
    });
  }

  return {
    materials: output as Record<SurfaceName, THREE.MeshStandardMaterial>,
    /**
     * 一次性缩放全部室内灯光材质 —— "这栋楼里有没有人"的逐时辰那一半。
     * 纯材质写入，不触发 shader 重编译；逐构件 emissive 爬升再乘在它上面。
     */
    setInterior(factor: number) {
      for (const name of Object.keys(EMISSIVE) as SurfaceName[]) {
        const material = output[name] as THREE.MeshStandardMaterial | undefined;
        if (material) material.emissiveIntensity = EMISSIVE[name]!.intensity * factor;
      }
    },
    dispose() {
      textures.forEach((t) => t.dispose());
      Object.values(output).forEach((m) => m.dispose());
    },
  };
}

/* -------------------------------------------------------------- 人流动线 */
/**
 * 一块"流动的带子"的贴图。
 *
 * - u（横向）= 带子的宽度：两侧 alpha 渐隐，让带子边缘化进铺装里，而不是一条硬边。
 * - v（纵向）= 沿路径的方向：一个**带陡前沿的柔光脉冲**，运行时靠 `offset.y` 滚动。
 *
 * 第一版画的是人字形箭头，结果每个周期一个大 V，整条带子读成锯齿花边。
 * 改成"光脉冲"之后，方向感一样清楚，却安静得多 —— 参考图里那些带子本来
 * 就是安静的色块，方向靠的是整体走向，不是花纹。
 */
function paintFlow() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = makeRandom(51966);

  // 底：珊瑚红，横向中段略亮。
  const base = ctx.createLinearGradient(0, 0, 256, 0);
  base.addColorStop(0, 'rgba(226,116,86,.34)');
  base.addColorStop(0.18, 'rgba(223,104,72,.74)');
  base.addColorStop(0.5, 'rgba(234,128,98,.8)');
  base.addColorStop(0.82, 'rgba(223,104,72,.74)');
  base.addColorStop(1, 'rgba(226,116,86,.34)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // 颗粒：铺装透出来一点，带子才不像一块亚克力板。
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,236,226,.05)' : 'rgba(150,60,40,.05)';
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }

  // 缓慢的明暗推移：v 增大 = 沿路径前进 = 画布上方。
  // **不要**做成陡前沿 —— 第一版是一道 1.4 m 内从 0 升到 0.5 的亮线，结果每个
  // 周期一个亮点，加上带子拐弯处 UV 被压缩，整条流线读成一串箭头花边。
  // 铺满整块、峰值只到 0.16，静止时几乎看不见，动起来才是一条流动的光。
  const pulse = ctx.createLinearGradient(0, 256, 0, 0);
  pulse.addColorStop(0, 'rgba(255,242,234,0)');
  pulse.addColorStop(0.35, 'rgba(255,242,234,.06)');
  pulse.addColorStop(0.72, 'rgba(255,244,236,.16)');
  pulse.addColorStop(0.95, 'rgba(255,246,238,.09)');
  pulse.addColorStop(1, 'rgba(255,246,238,0)');
  ctx.fillStyle = pulse;
  ctx.fillRect(0, 0, 256, 256);

  // 两侧渐隐 —— 硬边会让带子读成"贴上去的色块"。
  const fade = ctx.createLinearGradient(0, 0, 256, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.14, 'rgba(0,0,0,0)');
  fade.addColorStop(0.86, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = 'source-over';

  return canvas;
}

/* ------------------------------------------------------------ LED 广告屏 */
/**
 * 没有 `public/advert.jpg` 时用的兜底画面。
 *
 * 参考图里商场弧面上是一整面人像广告屏。这里不还原任何真实素材，只画一张
 * "时尚广告"的抽象构图：暖调背景 + 深色人物剪影 + 品牌条 + 高饱和色块。
 * 程序化生成，零外部图片。
 *
 * **画布尺寸由 SCREEN_ASPECT 派生**（16:9），不再是随手写的 4:3 —— 比例对不上
 * 的话，画面贴到弧面上会被横向拉伸。
 */
function paintScreen() {
  const W = 1024;
  const H = Math.round(W / SCREEN_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = makeRandom(20240927);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#e9c9b4');
  bg.addColorStop(0.55, '#d9a48c');
  bg.addColorStop(1, '#8c5c4e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 版式骨架：顶部品牌条 / 底部说明条
  ctx.fillStyle = 'rgba(196,32,58,.85)';
  ctx.fillRect(0, 0, W, Math.round(H * 0.14));
  ctx.fillStyle = 'rgba(24,26,30,.24)';
  ctx.fillRect(0, Math.round(H * 0.86), W, Math.round(H * 0.14));

  // 人物：肩线 + 头 + 发型 + 面部亮部。落在左侧三分点，右侧留给版式。
  const cx = W * 0.33;
  const head = H * 0.19;
  ctx.fillStyle = '#2a2226';
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.15, H);
  ctx.bezierCurveTo(cx - W * 0.115, H - H * 0.5, cx - W * 0.058, H - H * 0.7, cx, H - H * 0.7);
  ctx.bezierCurveTo(cx + W * 0.058, H - H * 0.7, cx + W * 0.115, H - H * 0.5, cx + W * 0.15, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e8bfa4';
  ctx.beginPath();
  ctx.ellipse(cx, H - H * 0.795, head * 0.62, head, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#241a1c';
  ctx.beginPath();
  ctx.ellipse(cx, H - H * 0.855, head * 0.72, head * 0.62, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - head * 0.7, H - H * 0.795, head * 0.2, head * 0.72, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + head * 0.7, H - H * 0.795, head * 0.2, head * 0.72, -0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath();
  ctx.ellipse(cx - head * 0.24, H - H * 0.835, head * 0.22, head * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // 右侧版式：抽象字标（不是任何真实 logo）+ 一条压线
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = `600 ${Math.round(H * 0.135)}px Georgia, serif`;
  ctx.fillText('S A S A K I', W * 0.545, H * 0.52);
  ctx.fillStyle = 'rgba(255,255,255,.64)';
  ctx.font = `400 ${Math.round(H * 0.055)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('IN77 / URBAN FLOW', W * 0.55, H * 0.63);
  ctx.fillStyle = 'rgba(24,26,30,.5)';
  ctx.fillRect(W * 0.55, H * 0.69, W * 0.29, H * 0.012);

  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = `600 ${Math.round(H * 0.055)}px Georgia, serif`;
  ctx.fillText('URBAN FLOW', W * 0.028, H * 0.095);
  ctx.fillStyle = 'rgba(255,255,255,.68)';
  ctx.font = `400 ${Math.round(H * 0.04)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('SS26 CAMPAIGN   ·   PROCEDURAL', W * 0.028, H * 0.952);

  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.045)';
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
  }
  // 屏体本身的像素栅格
  ctx.fillStyle = 'rgba(0,0,0,.13)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  return canvas;
}

/* -------------------------------------------------------------- 品牌门头 */
/**
 * 塔楼裙房南立面的奢侈品门头。字体是系统衬线体，牌照式排版，
 * 与参考图同一位置、同一比例，但不使用任何真实商标图形。
 */
function paintSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f0eee8';
  ctx.fillRect(0, 0, 640, 256);

  // 顶部一条极细的分缝，让招牌和石材墙面之间有一道阴影线
  ctx.fillStyle = 'rgba(120,116,108,.35)';
  ctx.fillRect(0, 0, 640, 3);

  ctx.fillStyle = '#1c1f22';
  ctx.font = '400 84px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('L V', 320, 112);

  ctx.fillStyle = '#26292c';
  ctx.font = '400 30px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('LOUIS VUITTON', 320, 172);

  ctx.fillStyle = 'rgba(60,62,66,.55)';
  ctx.font = '400 15px Helvetica, Arial, sans-serif';
  ctx.fillText('MAISON  ·  SINCE 1854', 320, 210);
  return canvas;
}

/**
 * 程序化 equirect 天空，预滤成环境贴图（PMREM）。
 *
 * 这才是让玻璃读作玻璃的原因：纯色环境只给出一片死板的灰面，而**一条硬地平线**
 * 加上它上面的太阳斑与云带，才是幕墙真正在反射的东西。代价是一张 1024×512 的
 * canvas 加一次 PMREM pass。
 *
 * **返回值只有环境贴图，没有"天空贴图"** —— 那张 canvas 贴图在这里就已经丢掉
 * 了。它唯一的用途是当 PMREM 的输入，`_applyPMREM()` 跑完它的数据就全在
 * cubeUV 里了；留着它只会多占一张 1024×512 的显存，并且诱使人把它塞给
 * `scene.background`（那会踩到清屏色的坑，见 `scene.ts` 的 `applyTime`）。
 *
 * 换时辰时重建，调用方负责 dispose 旧的返回的 render target。
 */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer, sky: SkySpec, interior: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  // v = 0.5 是地平线，0 是天顶，1 是天底。
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [v, color] of sky.stops) gradient.addColorStop(v, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  const rand = makeRandom(4242);

  // 地平线上的城市光晕。**必须把 Y 轴压扁**：贴图是 2:1，直接画上去的圆形径向
  // 渐变在仰角方向是方位角的 2 倍 —— 半径 230 px 就成了 81° 仰角，整片天都被点亮。
  for (const [cx, spread, alpha] of sky.glows) {
    const pool = ctx.createRadialGradient(cx, 258, 0, cx, 258, spread);
    pool.addColorStop(0, `rgba(255,198,126,${alpha})`);
    pool.addColorStop(0.45, `rgba(246,158,92,${alpha * 0.45})`);
    pool.addColorStop(1, 'rgba(240,150,80,0)');
    ctx.save();
    ctx.translate(0, 258);
    ctx.scale(1, 0.22);
    ctx.translate(0, -258);
    ctx.fillStyle = pool;
    ctx.fillRect(0, 258 - spread * 0.22 - 4, 1024, spread * 0.44 + 8);
    ctx.restore();
  }

  if (sky.cloud > 0.01) {
    for (let i = 0; i < 34; i++) {
      const x = rand() * 1024;
      const y = 40 + rand() * 190;
      const w = 70 + rand() * 260;
      const h = 6 + rand() * 20;
      const tint = i % 3 === 0 ? '206,150,140' : sky.cloudTint;
      const a = (0.12 + rand() * 0.22) * sky.cloud;
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, w);
      cloud.addColorStop(0, `rgba(${tint},${a})`);
      cloud.addColorStop(1, `rgba(${tint},0)`);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, h / w);
      ctx.translate(-x, -y);
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.arc(x, y, w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 地平线以下：远处城市的点点灯光。它们也随时辰走 —— 中午整座城市关灯，
  // 不该在天空里反着光。
  const windowAlpha = 0.15 + 0.85 * Math.min(1, Math.max(0, interior));
  for (let i = 0; i < 260; i++) {
    const x = rand() * 1024;
    const y = 274 + rand() * 130;
    ctx.fillStyle =
      rand() > 0.3
        ? `rgba(255,206,150,${(0.2 + rand() * 0.55) * windowAlpha})`
        : `rgba(190,220,255,${(0.15 + rand() * 0.35) * windowAlpha})`;
    ctx.fillRect(x, y, 1 + rand() * 2.4, 1 + rand() * 2.2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  // 输入贴图的使命到此结束：像素已经烘进 cubeUV，不需要再留在显存里。
  texture.dispose();
  return environment;
}
