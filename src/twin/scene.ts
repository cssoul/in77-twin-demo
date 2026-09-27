import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StructureBuilder } from './builder';
import { createSkyEnvironment, createTwinMaterials } from './materials';
import { DEFAULT_TIME, presetOf, type TimeId } from './daylight';
import { buildGround } from './ground';
import { buildRoads } from './roads';
import { buildMall } from './mall';
import { buildTower } from './tower';
import { buildBridge } from './bridge';
import { buildPlaza } from './plaza';
import { buildSkyline } from './skyline';
import { buildProps } from './props';
import { buildFlowRibbons, buildTraffic, type Traffic } from './flow';
import { buildVegetation, WIND_TIME } from './landscape';

export type ViewId = 'axo' | 'diorama' | 'plan' | 'plaza' | 'tower' | 'street';

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'axo', label: '轴测' },
  { id: 'diorama', label: '沙盘' },
  { id: 'plan', label: '总平' },
  { id: 'plaza', label: '广场' },
  { id: 'tower', label: '塔楼' },
  { id: 'street', label: '街景' },
];

type Preset = { position: THREE.Vector3; target: THREE.Vector3 };

/**
 * 等效透视 fov。六个机位只写"相机在哪、看向哪"（人读得懂），视口高度由
 * 这个参考 fov 反解： h = 2·d·tan(fov/2)。于是换成正交投影之后，每个机位的
 * 取景范围与之前完全一致 —— 变的只是投影方式，不是构图。
 */
const REF_FOV = 26;
/** 竖屏时把镜头打开一档（等效 fov 26°→40°），而不是把相机往后拉。 */
const PORTRAIT_OPEN = Math.tan((40 * Math.PI) / 360) / Math.tan((REF_FOV * Math.PI) / 360);
const frameHeight = (p: Preset) => 2 * p.position.distanceTo(p.target) * Math.tan((REF_FOV * Math.PI) / 360);

/**
 * 六个机位。距离全部按"要让街区占满画面几成"反解，不是随手拖出来的：
 * 画面高度 ≈ 0.462 × 距离，所以 337 对应约 156 m 的竖直覆盖 ——
 * 正好把 256×214 的街区连同四条道路收进 16:9 画幅。
 */
const PRESETS: Record<ViewId, Preset> = {
  // 参考图那个轴测角度：方位 45°、俯角 30°。俯角再大一点，屋面就会开始
  // 压过立面，白盒子会读成一片空地。距离单独调 —— 轴测图里主体必须撑满画面，
  // 四周只留一圈薄薄的底噪城市。
  axo: { position: new THREE.Vector3(204, 180, 212), target: new THREE.Vector3(-2, 10, 6) },
  // 退到能看见整块基座 —— 这时它才读作"一个模型"，而不是一座城市。
  // 正交投影下"远"不再自动变小，所以距离要比透视时代收一档，基座才撑得住画面。
  diorama: { position: new THREE.Vector3(366, 375, 384), target: new THREE.Vector3(0, 0, 0) },
  // 总平：机位略偏南，让画面上方是北 —— 否则场地会歪着放，读不出方位。
  plan: { position: new THREE.Vector3(0, 700, 46), target: new THREE.Vector3(0, 0, 0) },
  plaza: { position: new THREE.Vector3(161, 136, 191), target: new THREE.Vector3(26, 6, 44) },
  tower: { position: new THREE.Vector3(227, 139, 149), target: new THREE.Vector3(58, 40, -54) },
  // 街景 = 低视点轴测，视线压在 15°：正交投影下平视会退化成一张干净立面，
  // 而"街"的信息全在被压缩掉的那段地面上 —— 所以这里必须留一点俯角。
  // 机位落在南侧道路走廊里（走廊内不生成底噪体量），否则前景会被白盒子糊住。
  street: { position: new THREE.Vector3(100, 52, 152), target: new THREE.Vector3(-4, 10, 30) },
};

export type TwinHandle = {
  setProgress: (value: number) => void;
  setView: (view: ViewId) => void;
  setTime: (time: TimeId) => void;
  setOutline: (on: boolean) => void;
  setFlow: (on: boolean) => void;
  setTraffic: (on: boolean) => void;
  resetCamera: () => void;
  dispose: () => void;
};

export type TwinOptions = {
  mount: HTMLElement;
  onStats?: (stats: Record<string, unknown>) => void;
};

/**
 * 组装整个数字孪生：几何 → 合批 → 环境 → 渲染循环。
 *
 * 两个稳定性设计：
 *  1. **需求渲染**：相机没动、进度没变、动态元素关掉时，一帧都不画。
 *  2. **自适应分辨率**：帧时间连续超预算就降 DPR，回到宽裕再升回去 —— 目标是
 *     在 1920×1080 上稳住 60 FPS，而不是"理论上很快"。
 */
export function createTwinScene({ mount, onStats }: TwinOptions): TwinHandle {
  const scene = new THREE.Scene();
  /**
   * 相机是**正交投影**，不是透视。
   *
   * 参考图是标准的 Sasaki 轴测分析图：竖线严格垂直、近处与远处的体量同尺度。
   * 透视相机无论把 fov 压到多小，画面四角的白色体量都会向外倾 —— 那一眼就露馅。
   * 代价是"临场感"换成"图解感"，这恰好是这张图想要的。
   *
   * 正交相机的 left/right/top/bottom 必须自己按视口比算，所以这里没有 fov。
   */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4200);
  camera.position.copy(PRESETS.axo.position);
  let frame = frameHeight(PRESETS.axo);
  let aspect = 1;

  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  let dpr = maxDpr;
  // 需求渲染的总开关。提到这里声明，是因为广告屏素材是**异步**加载的 ——
  // 图到了要能从材质层回调里申请一帧，而这个回调可能比下面那堆 let 更早被调用。
  let needsFrame = true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // three 0.185 起 PCFSoftShadowMap 已废弃并会静默降级；柔和度靠 mapSize 与
  // normalBias 调，这里直接用 PCF。
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 场景里除了建造进度没有任何东西投真阴影（树的接触阴影是贴地暗斑）。
  renderer.shadowMap.autoUpdate = false;
  mount.appendChild(renderer.domElement);

  /* ------------------------------------------------------------ 灯光 */
  const hemi = new THREE.HemisphereLight(0xc2d8ec, 0x8e8979, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff7ea, 1.42);
  key.position.set(-140, 300, 160);
  key.castShadow = true;
  key.shadow.mapSize.set(3072, 3072);
  // 阴影相机要罩住整个街区（约 260×220），半幅 190 时每个 texel ≈ 0.12 m，
  // 在屏幕上仍比一个像素细。
  key.shadow.camera.left = -190;
  key.shadow.camera.right = 190;
  key.shadow.camera.top = 190;
  key.shadow.camera.bottom = -190;
  key.shadow.camera.near = 20;
  key.shadow.camera.far = 900;
  key.shadow.normalBias = 0.09;
  key.shadow.bias = -0.0004;
  key.target.position.set(0, 10, 10);
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xa4c0da, 0.5);
  fill.position.set(220, 120, -60);
  scene.add(fill);
  // 轮廓光专门从背后给镜面玻璃打一道边：没有它，主光打不到的立面是死黑的。
  const rim = new THREE.DirectionalLight(0xf6faff, 0.26);
  rim.position.set(-90, 80, -260);
  scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(PRESETS.axo.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  // 正交相机下推拉镜头改的是 zoom，不是距离。
  controls.minZoom = 0.28;
  controls.maxZoom = 7;
  // 不要让人转到地平线以下 —— 从地下看一个沙盘没有任何信息量。
  controls.maxPolarAngle = Math.PI * 0.487;
  controls.minPolarAngle = 0.04;

  /* ------------------------------------------------------------ 几何 */
  const kit = createTwinMaterials(renderer, () => {
    needsFrame = true;
  });
  const builder = new StructureBuilder(kit.materials);
  // finish() 之前注册：这几类自发光会跟着各自的构件"建成"逐块亮起来。
  builder.rampedEmissive.add('glow');
  builder.rampedEmissive.add('glowCool');
  builder.rampedEmissive.add('screen');
  builder.rampedEmissive.add('sign');

  buildGround(builder);
  buildRoads(builder);
  buildSkyline(builder);
  buildPlaza(builder);
  buildMall(builder);
  buildTower(builder);
  buildBridge(builder);
  buildProps(builder);
  buildFlowRibbons(builder);
  builder.finish(scene);

  const vegetation = buildVegetation(builder.progress);
  scene.add(vegetation.group);
  const traffic: Traffic = buildTraffic(builder.progress);
  scene.add(traffic.group);

  const outline = scene.getObjectByName('outline');
  const flowMaterial = kit.materials.flow;
  const ripple = (kit.materials.water as THREE.MeshPhysicalMaterial).bumpMap ?? null;

  /* -------------------------------------------------------------- 时辰 */
  let hourEnv: THREE.WebGLRenderTarget | null = null;
  let appliedTime: TimeId | null = null;
  // 一个复用的 Color 实例。它被 copy 进 renderer 的清屏色，所以就地改是安全的。
  const surround = new THREE.Color();

  const applyTime = (id: TimeId) => {
    if (appliedTime === id) return;
    const preset = presetOf(id);

    // 环境贴图：重建一次 PMREM，旧的用完即弃。
    const nextEnv = createSkyEnvironment(renderer, preset.sky, preset.interior);
    scene.environment = nextEnv.texture;
    hourEnv?.dispose();
    hourEnv = nextEnv;

    /*
     * 盘外那一圈**必须**是一个 Color，不能是天空贴图。这是一个真踩过的坑：
     *
     *  1. three 的 `WebGLShadowMap.render()` 会把 GL 清屏色写成 (1,1,1,1)，
     *     equirect→cubemap 转换里的嵌套 render 会把它写成 (0,0,0,1)，
     *     **两者都不还原**；
     *  2. 而 `WebGLBackground` 只在背景是 `null` 或 `Color` 时才写清屏色，
     *     背景是贴图时它一个字节都不写（它只负责往画面上叠一个 cube 网格）。
     *
     * 两条合起来：背景一旦交给贴图，"盘外那圈"的颜色就等于"谁最后动过清屏色
     * 就是谁的颜色"。实测初始是白的（阴影 pass 留下的），中午切到夜晚时贴图
     * 重建 cubemap，清屏色被那次嵌套 render 永久写成纯黑 —— 此后无论切回哪一
     * 档，画布都是黑的。用 Color 就彻底没有这回事：`background.render()` 每帧
     * 都会 `setClear()` 一次，谁改都被下一步覆盖回去，而且 `forceClear` 保证
     * 一定真的清了。
     *
     * 视觉上也不是降级：正交投影下所有视线彼此平行，无穷远天空只对应一个方向，
     * 一圈纯色与一张 equirect 的结果本来就完全相同（那张贴图在正交下还会退化
     * 成画面正中几个像素）。
     */
    surround.setStyle(preset.surround);
    scene.background = surround;

    appliedTime = id;

    scene.environmentIntensity = preset.environmentIntensity;
    renderer.toneMappingExposure = preset.exposure;

    const { rig } = preset;
    hemi.color.set(rig.hemi.sky);
    hemi.groundColor.set(rig.hemi.ground);
    hemi.intensity = rig.hemi.intensity;
    key.color.set(rig.key.color);
    key.intensity = rig.key.intensity;
    key.position.set(...rig.key.position);
    fill.color.set(rig.fill.color);
    fill.intensity = rig.fill.intensity;
    rim.color.set(rig.rim.color);
    rim.intensity = rig.rim.intensity;

    // 天空说不出口的那一半："这栋楼里有没有人"。
    kit.setInterior(preset.interior);
    needsFrame = true;
  };

  /* ------------------------------------------------------------ 循环 */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = true;
  let raf = 0;
  let lastNow = performance.now();
  let lastProgress = -2;
  let lastShadowProgress = -2;
  let lastShadowTime = -Infinity;
  let transition = false;
  let currentView: ViewId = 'axo';
  let showFlow = true;
  let showTraffic = true;

  let frames = 0;
  let elapsed = 0;
  let renderedFrames = 0;
  let shadowUpdates = 0;
  let adaptTimer = 0;

  const interrupt = () => {
    transition = false;
  };
  controls.addEventListener('start', interrupt);

  // 正交视口：画面高 = frame（窄屏额外开一档），宽 = 高 × 视口比。
  const applyFrustum = () => {
    const h = frame * (aspect < 0.62 ? PORTRAIT_OPEN : 1);
    const w = (h * aspect) / 2;
    camera.left = -w;
    camera.right = w;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  };

  const resize = () => {
    const w = Math.max(1, mount.clientWidth);
    const h = Math.max(1, mount.clientHeight);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    aspect = w / h;
    applyFrustum();
    needsFrame = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  applyTime(DEFAULT_TIME);
  builder.progress.value = 0;
  renderer.compile(scene, camera);
  needsFrame = true;

  const render = (now: number) => {
    raf = requestAnimationFrame(render);
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    if (!running || document.hidden) return;

    const seconds = now / 1000;
    if (!reducedMotion) {
      WIND_TIME.value = seconds;
      if (ripple) ripple.offset.set(seconds * 0.004, seconds * 0.003);
      // 流线贴图往前跑：offset 减小 = 图案朝 +v（路径前进方向）移动。
      const flowMap = flowMaterial.map;
      if (flowMap && showFlow) flowMap.offset.y -= dt * 0.135;
      if (showTraffic) traffic.update(dt);
    }

    if (transition) {
      const preset = PRESETS[currentView];
      const amount = reducedMotion ? 1 : 1 - Math.exp(-dt * 4.2);
      camera.position.lerp(preset.position, amount);
      controls.target.lerp(preset.target, amount);
      // 正交相机的位置不决定尺度，取景范围得单独补间，否则换机位是硬切。
      frame += (frameHeight(preset) - frame) * amount;
      applyFrustum();
      if (camera.position.distanceTo(preset.position) < 0.5) transition = false;
    }

    const cameraChanged = controls.update();
    const progressChanged = lastProgress !== builder.progress.value;
    // 建造期间阴影最多 30 Hz；回拖与终帧立即刷新，避免拖到一半看到上一帧姿态的影子。
    const shadowChanged =
      lastShadowProgress !== builder.progress.value &&
      (now - lastShadowTime >= 1000 / 30 || builder.progress.value === 0 || builder.progress.value === 1);

    // 有动态元素时每一帧都要重画；全都关掉之后场景会回到"静止即停机"。
    const dynamic = !reducedMotion && (showTraffic || showFlow);

    if (needsFrame || cameraChanged || transition || progressChanged || shadowChanged || dynamic) {
      if (shadowChanged) {
        renderer.shadowMap.needsUpdate = true;
        lastShadowProgress = builder.progress.value;
        lastShadowTime = now;
        shadowUpdates++;
      }
      renderer.render(scene, camera);
      renderedFrames++;
      needsFrame = false;
      lastProgress = builder.progress.value;
    }

    /* --- 自适应分辨率 --- */
    frames++;
    elapsed += dt;
    adaptTimer += dt;
    if (adaptTimer > 2 && dynamic) {
      const avg = (elapsed / Math.max(1, frames)) * 1000;
      if (avg > 21 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      } else if (avg < 13.5 && dpr < maxDpr) {
        dpr = Math.min(maxDpr, dpr + 0.25);
        renderer.setPixelRatio(dpr);
        renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      }
      adaptTimer = 0;
    }

    if (elapsed > 0.6) {
      const payload = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        pieces: builder.pieces,
        edges: builder.edgePieces,
        trees: vegetation.count,
        people: traffic.counts.people,
        cars: traffic.counts.cars,
        fps: Math.round(frames / elapsed),
        renderFps: Math.round(renderedFrames / elapsed),
        shadowUpdatesPerSecond: Math.round(shadowUpdates / elapsed),
        idle: renderedFrames === 0,
        dpr: Number(dpr.toFixed(2)),
        programs: renderer.info.programs?.length ?? 0,
      };
      // 验收出口：外部工具直接读这个属性，不必去解析界面文本。
      mount.dataset.renderStats = JSON.stringify(payload);
      onStats?.(payload);
      frames = 0;
      elapsed = 0;
      renderedFrames = 0;
      shadowUpdates = 0;
    }
  };
  raf = requestAnimationFrame(render);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__twinDebug = {
      scene,
      renderer,
      camera,
      controls,
      applyTime,
      PRESETS,
      get frame() {
        return frame;
      },
      stats: () => mount.dataset.renderStats,
    };
  }

  /* -------------------------------------------------------------- API */
  return {
    setProgress(value: number) {
      builder.progress.value = value;
      needsFrame = true;
    },
    setView(view: ViewId) {
      currentView = view;
      transition = true;
      needsFrame = true;
    },
    setTime(time: TimeId) {
      applyTime(time);
    },
    setOutline(on: boolean) {
      if (outline) outline.visible = on;
      needsFrame = true;
    },
    setFlow(on: boolean) {
      showFlow = on;
      const mesh = scene.getObjectByName('surface-flow');
      if (mesh) mesh.visible = on;
      needsFrame = true;
    },
    setTraffic(on: boolean) {
      showTraffic = on;
      traffic.setVisible(on);
      needsFrame = true;
    },
    resetCamera() {
      currentView = 'axo';
      transition = true;
      needsFrame = true;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.removeEventListener('start', interrupt);
      controls.dispose();
      traffic.dispose();
      vegetation.dispose();
      builder.dispose();
      kit.dispose();
      hourEnv?.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
