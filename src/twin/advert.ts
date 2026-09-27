/**
 * 广告屏 / 门头灯箱的真实素材接口。
 *
 * ## 怎么换图
 * 把图片丢进项目根目录的 `public/`（Vite 会把 public 原样挂到站点根）。
 * 每个位置可以给多个候选路径，**按顺序探测，命中第一个就用它**：
 *
 *   ADVERT_SRC  →  商场弧面上的大广告屏（16:9 横屏）
 *   SIGN_SRC    →  塔楼裙房的门头灯箱（横向长条）
 *
 * ## 版式契约：cover
 * **等比缩放 → 居中 → 溢出裁剪**，等价于 CSS 的 `object-fit: cover`。
 * 素材是什么比例都不会被拉变形，只会把多出来的边裁掉 —— 所以竖幅照片放进去
 * 会保留中间那一条，这是"不拉伸"必然的代价。
 *
 * ## 没有素材时
 * 文件不存在 / 404 / 解码失败，一律**静默回退**到程序化画面。控制台不会因此
 * 报错，画面也不会出现白屏或黑框。
 */

/** 商场弧面广告屏的素材。命中第一个存在的。 */
export const ADVERT_SRC = ['/fzd.jpeg', '/advert.jpg'];
/** 塔楼裙房灯箱的素材。 */
export const SIGN_SRC = ['/sign.jpg', '/sign.png'];

/**
 * 把 `img` 按 cover 规则画满 `w × h` 的画布。
 * 返回 false 表示图片还没有有效尺寸（未解码完 / 尺寸为 0），调用方应当放弃这次绘制。
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
): boolean {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}

/**
 * 这个路径上真的有图吗？
 *
 * 两个都必须看：
 *  · `Accept: image/*` —— Vite 之类带 SPA 回退的服务器，只在请求"看起来想要
 *    HTML"时才回退到 index.html。带上这个头，不存在的素材才会老实 404；
 *    不带的话它会返回 `200` + 一坨 HTML，`res.ok` 判真。
 *  · content-type —— 万一服务器无视 Accept 照样回退，这一条把
 *    `200 text/html` 拦下来，不会把一个 HTML 文档喂给图片解码器。
 *
 * 之所以先探测而不是直接 `new Image()`：直接 load 不存在的文件会在控制台
 * 留下 404 红字，而本项目的验收标准是"零 error 零 warning"。
 */
async function hasImage(src: string): Promise<boolean> {
  try {
    const res = await fetch(src, {
      method: 'HEAD',
      cache: 'no-store',
      headers: { Accept: 'image/*' },
    });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

/**
 * 试着用真实素材覆盖画布。**只有真的画上去了才回调** —— 回调里把
 * `CanvasTexture` 标脏并申请重绘一帧（需求渲染下不申请就永远不会画）。
 *
 * 整条链路是"尽力而为"的：任何一步失败都直接返回，画布保持调用方先画好的
 * 程序化内容，场景状态不受影响。
 */
export function applyAdvert(
  canvas: HTMLCanvasElement,
  src: string | readonly string[],
  onPainted: () => void,
) {
  const candidates = typeof src === 'string' ? [src] : src;
  void (async () => {
    for (const candidate of candidates) {
      if (!(await hasImage(candidate))) continue;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx || !drawCover(ctx, img, canvas.width, canvas.height)) return;
        onPainted();
      };
      // onerror 留空：素材坏了是"没有素材"的一种，不是异常。
      img.onerror = () => {};
      img.src = candidate;
      return;
    }
  })();
}
