import type { StructureBuilder } from './builder';
import { at, BRIDGE, MALL, PHASE, TOWER } from './layout';

/**
 * 空中连廊。参考图里最抢眼的一件事物：一段蓝色玻璃盒子，从商场东北角
 * 斜着跨过广场，插进塔楼裙房。
 *
 * **端点必须"扎进"楼里，不能停在墙外。** 停在墙外有两个症状：轴测下能看到
 * 一条尴尬的缝；而且两端的过渡雨篷会悬在半空，变成两块说不清来历的白色碎片。
 *
 * 所以这里不写死坐标，全部从 `BRIDGE.from/to` 派生 —— 端点一旦移动，
 * 桥墩（按跨长比例）和立面套口（与立面求交）都自动跟着走。
 */
export function buildBridge(b: StructureBuilder) {
  const span = PHASE.bridge;
  const [x0, z0] = BRIDGE.from;
  const [x1, z1] = BRIDGE.to;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(-dz, dx);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { deck, width, height } = BRIDGE;
  const rot = [0, angle, 0] as [number, number, number];
  // 桥轴是一条直线，给定 x 就能反求 z。立面套口要用它。
  const zAtX = (x: number) => z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);

  // 桥墩先立：承重先于被承重。位置按跨长比例走，所以端点一动它们就跟着动。
  for (const t of [0.32, 0.68]) {
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    b.cylinder(BRIDGE.pierRadius, deck - 0.9, [px, 0.3 + (deck - 0.9) / 2, pz], 'concrete', at(span, 0.0 + t * 0.1), {
      duration: 0.05,
      lift: 2.4,
      shade: 0.92,
    });
    b.cylinder(BRIDGE.pierRadius + 0.5, 0.6, [px, deck - 0.3, pz], 'concrete', at(span, 0.2 + t * 0.08), {
      duration: 0.025,
      lift: 0.5,
      shade: 0.86,
    });
  }

  // 桥面板
  b.box([len, 0.55, width], [cx, deck - 0.275, cz], 'white', at(span, 0.24), {
    r: rot,
    duration: 0.03,
    lift: 1.4,
    edge: true,
  });

  // 玻璃盒身：整段通长的一块，两侧通透
  b.box([len - 2.4, height, width - 0.5], [cx, deck + height / 2, cz], 'glassBridge', at(span, 0.42), {
    r: rot,
    duration: 0.035,
    lift: 1.0,
    drift: [dx / len, 1.0, dz / len],
  });

  // 桥内的地面灯带：夜里连廊是一根横着的灯管
  b.box([len - 2.4, 0.16, width - 2.2], [cx, deck + 0.14, cz], 'glowCool', at(PHASE.lighting, 0.26), {
    r: rot,
    duration: 0.03,
    lift: 0.06,
    drift: [0, 0, 0],
  });

  // 白色肋：每 4.6 m 一道，把 70 m 长的盒子打断成有节奏的结构
  const ribs = Math.max(3, Math.round(len / 4.6));
  for (let i = 1; i < ribs; i++) {
    const t = i / ribs;
    b.box([0.5, height + 0.5, width + 0.5], [x0 + dx * t, deck + height / 2, z0 + dz * t], 'white', at(span, 0.52 + (i % 6) * 0.012), {
      r: rot,
      duration: 0.02,
      lift: 0.9,
      drift: [dx / len, 1.0, dz / len],
    });
  }

  // 顶板 + 压边
  b.box([len + 0.7, 0.45, width + 0.7], [cx, deck + height + 0.22, cz], 'white', at(span, 0.68), {
    r: rot,
    duration: 0.03,
    lift: 0.9,
    edge: true,
  });
  for (const s of [-1, 1]) {
    const ox = (dz / len) * s * ((width + 0.7) / 2);
    const oz = (-dx / len) * s * ((width + 0.7) / 2);
    b.box([len + 0.7, 0.22, 0.3], [cx + ox, deck + height + 0.55, cz + oz], 'metal', at(span, 0.76), {
      r: rot,
      duration: 0.02,
      lift: 0.4,
      shade: 0.9,
    });
  }

  // 立面套口：桥穿过哪面墙，就在那面墙上留一圈洞口边。
  //
  // 原来这里是"两端接头雨篷"，但端点扎进楼里之后雨篷会被整个埋掉 ——
  // 既看不见，又让人误以为是没对齐的碎片。换成套口之后，桥和楼的交接
  // 有了一个明确的收头，读作"洞口"，而不是"两个体量碰巧插在一起"。
  for (const faceX of [MALL.main.cx + MALL.main.w / 2, TOWER.podium.cx - TOWER.podium.w / 2]) {
    b.box([1.1, height + 1.4, width + 1.4], [faceX, deck + height / 2, zAtX(faceX)], 'white', at(span, 0.8), {
      r: rot,
      duration: 0.025,
      lift: 0.5,
      edge: true,
    });
  }
}
