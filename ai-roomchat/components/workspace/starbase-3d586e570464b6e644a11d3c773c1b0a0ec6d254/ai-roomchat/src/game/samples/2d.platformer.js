// 2D Platformer Starter (키맵/중력/점프/타일맵 로드 예시)
// 붙이는 법: src/game/index.js의 factory 내부에 필요한 부분을 복사해 확장하세요.
// 참고: docs/GAME_ADAPTERS.md, docs/MOBILE_CONTROLS.md, docs/REFERENCE_DATA.md

export default function createPlatformer({ gravity = 1200 } = {}) {
  let el, canvas, ctx, raf = null, running = false;
  const player = { x: 64, y: 64, vx: 0, vy: 0, w: 16, h: 24, onGround: false };
  const input = new Set();

  function resize() {
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0c0c10'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(0, h-20, w, 20);
    ctx.fillStyle = '#fff';
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }

  function step(dt) {
    const speed = 160;
    if (input.has('ArrowLeft')) player.vx = -speed; else if (input.has('ArrowRight')) player.vx = speed; else player.vx = 0;
    if (input.has('Space') && player.onGround) { player.vy = -360; player.onGround = false; }
    player.vy += gravity * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    // 바닥 충돌
    const floor = (canvas.height - 20);
    if (player.y + player.h >= floor) { player.y = floor - player.h; player.vy = 0; player.onGround = true; }
  }

  function loop(ts) { if (!running) return; step(1/60); draw(); raf = requestAnimationFrame(loop); }

  return {
    init(container) {
      el = container; canvas = document.createElement('canvas'); canvas.style.width='100%'; canvas.style.height='100%'; el.appendChild(canvas); ctx = canvas.getContext('2d');
      resize(); window.addEventListener('resize', resize);
    },
    start() { if (running) return; running = true; raf = requestAnimationFrame(loop); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
    dispose() { this.stop(); window.removeEventListener('resize', resize); if (canvas?.parentNode) canvas.parentNode.removeChild(canvas); },
    resize,
    onInput(ev) { if (ev.type==='keydown') input.add(ev.key); else if (ev.type==='keyup') input.delete(ev.key); },
  };
}

