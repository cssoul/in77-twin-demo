#!/usr/bin/env bash
# 视觉验收：从运行中的 dev server 抓图，并读回性能读数。
#
#   scripts/shoot.sh <progress-0-1000> <out.png> [width] [height] [hour] [view]
#     scripts/shoot.sh 1000 /tmp/axo.png
#     scripts/shoot.sh 1000 /tmp/night.png 1920 1080 夜晚 轴测
#     scripts/shoot.sh 560  /tmp/mid.png 1440 900 "" 广场
#
# 几个已经踩过的坑：
#  1. agent-browser 复用同一个页面上下文，第二次顶层 `const` 会抛
#     "Identifier has already been declared" 并静默整段失效 —— 每个 eval 都包 IIFE。
#  2. Vue 的渲染是异步的。点按钮 / 派发 input 之后**必须另起一次 eval** 再读值，
#     否则读到的是上一帧。
#  3. dev server 被回收后 `open` 仍会成功但页面全白。先探一次 `.controls`。
#  4. 换时辰背后是一次 PMREM 重建 + 全场景重绘，要等够。
#  5. **进度条 input 的 min/max 是 0–1，不是 0–1000**。直接把 520 塞进去会被
#     夹到 1，于是"建造中"截出来是建成态 —— 这里必须先换算。
set -uo pipefail

URL="${URL:-http://127.0.0.1:5273}"
PROGRESS="${1:-1000}"
OUT="${2:-/tmp/shot.png}"
WIDTH="${3:-1920}"
HEIGHT="${4:-1080}"
HOUR="${5:-}"
VIEW="${6:-}"

# 0–1000 → 0–1
SEEK=$(awk -v p="$PROGRESS" 'BEGIN{ v=p/1000; if(v<0)v=0; if(v>1)v=1; printf "%.3f", v }')

open_page() {
  agent-browser close >/dev/null 2>&1
  agent-browser open "$URL" >/dev/null 2>&1
  agent-browser set viewport "$WIDTH" "$HEIGHT" >/dev/null 2>&1
  sleep 8
}
probe() { agent-browser eval "(()=>!!document.querySelector('.controls'))()" 2>/dev/null; }

open_page
tries=0
while [ "$(probe)" != "true" ]; do
  tries=$((tries + 1))
  if [ "$tries" -ge 3 ]; then
    echo "ERROR: 页面没起来（dev server 在吗？）" >&2
    exit 1
  fi
  echo "页面空白，重开…" >&2
  open_page
done

agent-browser eval "(()=>{
  if(!document.getElementById('shoot-hide')){
    const s=document.createElement('style'); s.id='shoot-hide';
    s.textContent='.brief,.controls,.transport,.meter,.hint,.vignette,.loading{display:none!important}';
    document.head.appendChild(s);
  }
  return 'ok';
})()" >/dev/null
sleep 1

agent-browser eval "(()=>{
  const el=document.querySelector('.timeline input');
  const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  set.call(el,'${SEEK}');
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return 'seek';
})()" >/dev/null
sleep 2

pick() { # $1 = group index (0=时辰 1=机位 2=图层), $2 = label
  agent-browser eval "(()=>{
    const groups=[...document.querySelectorAll('.controls .group')];
    const b=[...groups[$1].querySelectorAll('button')].find(x=>x.textContent.trim()==='$2');
    if(!b) return 'MISSING';
    b.click(); return b.textContent.trim();
  })()"
}

# 计时先停掉，否则等太久进度会自己跑完。
agent-browser eval "(()=>{const b=document.querySelector('.transport .play'); if(b&&b.textContent.trim()==='\u275a\u275a') b.click(); return 'paused';})()" >/dev/null
sleep 1

if [ -n "$VIEW" ]; then echo -n '机位: '; pick 1 "$VIEW"; sleep 4; fi
if [ -n "$HOUR" ]; then echo -n '时辰: '; pick 0 "$HOUR"; sleep 5; fi

sleep 2
agent-browser screenshot "$OUT"

echo -n '读数: '
agent-browser eval "(()=>document.querySelector('.stage')?.dataset.renderStats||'none')()"
echo
echo '控制台:'
agent-browser console 2>/dev/null | grep -viE 'vite\] conn|DevTools|\[vite\]' || true
echo "saved: $OUT"
