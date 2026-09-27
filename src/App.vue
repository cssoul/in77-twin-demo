<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { createTwinScene, VIEWS, type TwinHandle, type ViewId } from './twin/scene';
import { TIMES, type TimeId } from './twin/daylight';

/**
 * 建造时序的阶段名。它们**只是显示** —— 真正的时序住在 `layout.ts` 的 `PHASE` 里。
 * 改了 PHASE 就必须同改这份表，否则标签会和画面对不上。
 */
const STAGES: { from: number; to: number; name: string }[] = [
  { from: 0.0, to: 0.05, name: '场地与基座' },
  { from: 0.02, to: 0.16, name: '周边城市体量' },
  { from: 0.05, to: 0.16, name: '道路、路缘与人行道' },
  { from: 0.1, to: 0.24, name: '广场大板铺装' },
  { from: 0.16, to: 0.3, name: '圆形水景与同心环' },
  { from: 0.13, to: 0.36, name: '商业裙房结构' },
  { from: 0.22, to: 0.5, name: '塔楼主体与楼板带' },
  { from: 0.3, to: 0.52, name: '裙房幕墙与 LED 屏' },
  { from: 0.42, to: 0.72, name: '塔楼幕墙波次合拢' },
  { from: 0.58, to: 0.72, name: '空中连廊吊装' },
  { from: 0.66, to: 0.8, name: '绿地与树阵' },
  { from: 0.74, to: 0.9, name: '街道家具与人流动线' },
  { from: 0.84, to: 1.0, name: '灯光依次点亮' },
];

const DURATION = 22; // 一次完整建造的秒数

const stageRef = ref<HTMLDivElement | null>(null);
const scene = shallowRef<TwinHandle | null>(null);
const progress = ref(1);
const playing = ref(false);
const time = ref<TimeId>('noon');
const view = ref<ViewId>('axo');
const outline = ref(true);
const flow = ref(true);
const traffic = ref(true);
const ready = ref(false);
const stats = ref<Record<string, number | boolean>>({});
const cameraMoved = ref(false);

let timer = 0;
let last = 0;

const stage = computed(() => {
  const list = STAGES.filter((s) => progress.value >= s.from && progress.value <= s.to);
  return list.length ? list[list.length - 1].name : STAGES[STAGES.length - 1].name;
});

const clock = computed(() => {
  const total = progress.value * DURATION;
  const mm = Math.floor(total / 60);
  const ss = Math.floor(total % 60);
  const cs = Math.floor((total % 1) * 100);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
});

function tick(now: number) {
  if (!playing.value) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  progress.value = Math.min(1, progress.value + dt / DURATION);
  if (progress.value >= 1) {
    playing.value = false;
    return;
  }
  timer = requestAnimationFrame(tick);
}

function togglePlay() {
  cameraMoved.value = true;
  if (playing.value) {
    playing.value = false;
    cancelAnimationFrame(timer);
    return;
  }
  if (progress.value >= 1) progress.value = 0;
  playing.value = true;
  last = performance.now();
  timer = requestAnimationFrame(tick);
}

function rebuild() {
  progress.value = 0;
  playing.value = true;
  last = performance.now();
  cancelAnimationFrame(timer);
  timer = requestAnimationFrame(tick);
}

onMounted(() => {
  if (!stageRef.value) return;
  scene.value = createTwinScene({
    mount: stageRef.value,
    onStats: (s) => {
      stats.value = s as Record<string, number | boolean>;
      ready.value = true;
    },
  });
  scene.value.setProgress(progress.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(timer);
  scene.value?.dispose();
});

watch(progress, (v) => scene.value?.setProgress(v));
watch(time, (v) => scene.value?.setTime(v));
watch(view, (v) => {
  cameraMoved.value = true;
  scene.value?.setView(v);
});
watch(outline, (v) => scene.value?.setOutline(v));
watch(flow, (v) => scene.value?.setFlow(v));
watch(traffic, (v) => scene.value?.setTraffic(v));

const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
</script>

<template>
  <div class="poster">
    <div ref="stageRef" class="stage" aria-label="可旋转的 in77 街区微缩数字孪生" />

    <div v-if="!ready" class="loading">正在生成场地…</div>

    <div class="vignette" aria-hidden="true" />

    <!-- 左上：说明卡片 -->
    <section class="brief">
      <h2>in77 街区<br />微缩数字孪生</h2>
      <p class="accent">全程序化生成 · 零外部模型 / 零纹理文件</p>
      <blockquote>
        商业裙房、玻璃塔楼、空中连廊、圆形水景与场地路网，全部由代码逐块砌成。
      </blockquote>

      <ul class="spec">
        <li><span>地块</span><b>256 × 214 m</b></li>
        <li><span>塔楼</span><b>73 m / 14 层</b></li>
        <li><span>构件</span><b>{{ fmt(stats.pieces) }} 块 · {{ fmt(stats.calls) }} draw calls</b></li>
        <li><span>三角面</span><b>{{ fmt(stats.triangles) }}</b></li>
        <li><span>植被 / 人流</span><b>{{ fmt(stats.trees) }} 棵 · {{ fmt(stats.people) }} 人</b></li>
      </ul>

      <div class="index">
        <b>{{ String(Math.round(progress * 100)).padStart(3, '0') }}</b>
        <i />
        <span>{{ stage }}</span>
        <em>{{ clock }}</em>
      </div>
    </section>

    <!-- 右上：性能读数 -->
    <aside class="meter">
      <div class="meter-row"><span>FPS</span><b>{{ fmt(stats.fps) }}</b></div>
      <div class="meter-row"><span>渲染帧 / 秒</span><b>{{ fmt(stats.renderFps) }}</b></div>
      <div class="meter-row"><span>DPR</span><b>{{ stats.dpr ?? '—' }}</b></div>
      <div class="meter-row"><span>阴影更新 / 秒</span><b>{{ fmt(stats.shadowUpdatesPerSecond) }}</b></div>
      <div class="meter-row"><span>绘制调用</span><b>{{ fmt(stats.calls) }}</b></div>
      <div class="meter-row"><span>三角面</span><b>{{ fmt(stats.triangles) }}</b></div>
      <div class="meter-hint" :class="{ on: stats.idle }">
        {{ stats.idle ? '静止 · 已停机' : '运行中' }}
      </div>
    </aside>

    <!-- 左下：控件 -->
    <section class="controls">
      <div class="group">
        <span class="label">时辰</span>
        <div class="row">
          <button
            v-for="t in TIMES"
            :key="t.id"
            :aria-pressed="time === t.id"
            @click="time = t.id"
          >{{ t.label }}</button>
        </div>
      </div>
      <div class="group">
        <span class="label">机位</span>
        <div class="row">
          <button v-for="v in VIEWS" :key="v.id" :aria-pressed="view === v.id" @click="view = v.id">
            {{ v.label }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="label">图层</span>
        <div class="row">
          <button :aria-pressed="outline" @click="outline = !outline">图纸描边</button>
          <button :aria-pressed="flow" @click="flow = !flow">人流动线</button>
          <button :aria-pressed="traffic" @click="traffic = !traffic">车流</button>
          <button @click="rebuild">重新建造</button>
        </div>
      </div>
    </section>

    <!-- 底部：播放条 -->
    <div class="transport">
      <button class="play" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
        {{ playing ? '❚❚' : '▶' }}
      </button>
      <label class="timeline">
        <span :style="{ width: `${progress * 100}%` }" />
        <input
          v-model.number="progress"
          type="range"
          min="0"
          max="1"
          step="0.001"
          aria-label="建造进度"
          @pointerdown="cameraMoved = true"
        />
      </label>
      <time>{{ clock }} / {{ String(Math.floor(DURATION / 60)).padStart(2, '0') }}:{{ String(DURATION % 60).padStart(2, '0') }}</time>
    </div>

    <p class="hint">{{ cameraMoved ? '拖动旋转 · 滚轮缩放 · 右键平移' : '拖动旋转 · 滚轮缩放 · 右键平移' }}</p>
  </div>
</template>
