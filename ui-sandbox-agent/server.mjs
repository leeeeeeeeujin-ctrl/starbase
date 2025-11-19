// ui-sandbox-agent: minimal HTTP UI sandbox for ai-roomchat (and others).
//
// This is a standalone Node process that:
// - Exposes:
//     POST /session           -> { sessionId }
//     POST /session/:id/step  -> { ok, state: { logs, domSummary, screenshotId? } }
// - Uses Playwright to drive a Chromium browser.
//
// NOTE:
// - This file is intentionally small and self-contained so you can tweak it
//   per environment. It is meant as a starting point, not a production-hardened tool.

import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.UI_SANDBOX_AGENT_PORT || 7010);
const HOST = process.env.UI_SANDBOX_AGENT_HOST || '127.0.0.1';

/** @type {Map<string,{browser, context, page, logs:string[], counter:number, lastState?: any}>} */
const sessions = new Map();

function logSession(sessionId, line) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.logs.push(String(line));
  const max = 200;
  if (s.logs.length > max) {
    s.logs.splice(0, s.logs.length - max);
  }
}

async function createSession(options = {}) {
  const browser = await chromium.launch({
    headless: options.headless !== false,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const id = Math.random().toString(36).slice(2, 10);
  const state = {
    browser,
    context,
    page,
    logs: [],
    counter: 0,
  };
  sessions.set(id, state);

  page.on('console', (msg) => {
    try {
      logSession(id, `[console:${msg.type()}] ${msg.text()}`);
    } catch {
      // ignore
    }
  });

  return { id, state };
}

async function handleStep(sessionId, action, params = {}) {
  const s = sessions.get(sessionId);
  if (!s) {
    return { ok: false, error: 'unknown_session' };
  }
  const { page } = s;
  const a = String(action || 'snapshot');
  const p = params && typeof params === 'object' ? params : {};

  try {
    if (a === 'open') {
      const url = String(p.url || '');
      if (!url) return { ok: false, error: 'missing_url' };
      await page.goto(url, { waitUntil: 'networkidle' });
      logSession(sessionId, `OPEN ${url}`);
    } else if (a === 'click') {
      const sel = String(p.selector || '');
      if (!sel) return { ok: false, error: 'missing_selector' };
      await page.click(sel);
      logSession(sessionId, `CLICK ${sel}`);
    } else if (a === 'type') {
      const sel = String(p.selector || '');
      const text = String(p.text || '');
      if (!sel) return { ok: false, error: 'missing_selector' };
      await page.fill(sel, text);
      if (p.pressEnter) {
        await page.press(sel, 'Enter');
      }
      logSession(sessionId, `TYPE "${text}" into ${sel}`);
    } else if (a === 'drag') {
      const fromSel = String(p.fromSelector || '');
      const toSel = String(p.toSelector || '');
      if (!fromSel || !toSel) return { ok: false, error: 'missing_drag_selectors' };
      await page.dragAndDrop(fromSel, toSel);
      logSession(sessionId, `DRAG ${fromSel} -> ${toSel}`);
    } else if (a === 'wait') {
      const ms = Number(p.ms || 0);
      const sel = p.selector ? String(p.selector) : null;
      if (sel) {
        await page.waitForSelector(sel, { timeout: ms || 30000 });
        logSession(sessionId, `WAIT for selector ${sel}`);
      } else if (ms > 0) {
        await page.waitForTimeout(ms);
        logSession(sessionId, `WAIT ${ms}ms`);
      }
    } else if (a === 'close') {
      await s.context.close();
      await s.browser.close();
      sessions.delete(sessionId);
      return { ok: true, state: { closed: true } };
    } else {
      // snapshot or unknown -> no-op besides state capture
      logSession(sessionId, `SNAPSHOT`);
    }

    // After every step, capture a screenshot + a minimal DOM summary.
    const shotsDir = path.join(__dirname, 'screenshots');
    try {
      fs.mkdirSync(shotsDir, { recursive: true });
    } catch {
      // ignore
    }
    s.counter += 1;
    const screenshotId = `${sessionId}-${String(s.counter).padStart(4, '0')}.png`;
    const screenshotPath = path.join(shotsDir, screenshotId);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const domSummary = await page.evaluate(() => {
      function summarizeElement(el) {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;

        const tag = el.tagName.toLowerCase();
        const roleAttr = el.getAttribute('role');
        const role = roleAttr || null;

        const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        const name =
          el.getAttribute('aria-label') ||
          el.getAttribute('alt') ||
          el.getAttribute('title') ||
          el.getAttribute('placeholder') ||
          null;

        const attrs = {};
        const href = el.getAttribute('href');
        const type = el.getAttribute('type');
        const value = el.getAttribute('value');
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
        if (href) attrs.href = href;
        if (type) attrs.type = type;
        if (value) attrs.value = value;
        if (testId) attrs.testId = testId;

        const state = {
          disabled: el.matches(':disabled'),
          hidden: el.getAttribute('aria-hidden') === 'true' || el.style.display === 'none',
          checked: el.matches(':checked'),
          selected: el.matches(':selected'),
          focused: document.activeElement === el,
          invalid: el.getAttribute('aria-invalid') === 'true',
        };

        let region = null;
        let cur = el;
        while (cur && cur !== document.body) {
          const t = cur.tagName.toLowerCase();
          if (t === 'header' || t === 'main' || t === 'footer' || t === 'nav' || t === 'aside') {
            region = t;
            break;
          }
          cur = cur.parentElement;
        }

        let kind = 'element';
        if (
          role === 'alert' ||
          el.matches(
            '[role="alert"], .error, .error-message, [data-error], [aria-invalid="true"], .toast-error',
          )
        ) {
          kind = 'error';
        } else if (role === 'dialog' || role === 'alertdialog' || el.matches('.modal, .dialog')) {
          kind = 'dialog';
        }

        if (!text && !name && !href) return null;

        return {
          kind,
          tag,
          role,
          region,
          text,
          name,
          attrs,
          state,
        };
      }

      const elements = [];
      const errors = [];

      const candidates = Array.from(
        document.querySelectorAll(
          'button, [role="button"], a, input, textarea, select, [role], [data-testid], [data-test-id]',
        ),
      ).slice(0, 120);

      candidates.forEach((el) => {
        const summary = summarizeElement(el);
        if (!summary) return;
        elements.push(summary);
        if (summary.kind === 'error') {
          errors.push(summary);
        }
      });

      return { elements, errors };
    });

    const logs = s.logs.slice(-50);
    const state = { logs, domSummary, screenshotId };
    s.lastState = state;
    return {
      ok: true,
      state,
    };
  } catch (err) {
    logSession(sessionId, `[error] ${err?.message || String(err)}`);
    return { ok: false, error: 'step_failed', detail: String(err?.message || err) };
  }
}

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '', true);
  const { pathname } = parsed;
  // Root UI: minimal dashboard
  if (req.method === 'GET' && pathname === '/') {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>UI Sandbox Agent</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#020617; color:#e5e7eb; }
    .root { display:flex; height:100vh; }
    .sidebar { width:220px; border-right:1px solid #1f2937; padding:10px; box-sizing:border-box; background:#030712; }
    .main { flex:1; display:flex; flex-direction:column; }
    .toolbar { padding:8px 10px; border-bottom:1px solid #1f2937; display:flex; gap:8px; align-items:center; background:#020617; }
    .content { flex:1; display:grid; grid-template-columns: 2fr 1.4fr; gap:8px; padding:8px; box-sizing:border-box; }
    button { padding:4px 8px; border-radius:6px; border:1px solid #334155; background:#0b1120; color:#e5e7eb; cursor:pointer; }
    button:hover { background:#111827; }
    .sessions { list-style:none; padding:0; margin:8px 0 0 0; max-height: calc(100vh - 80px); overflow:auto; }
    .sessions li { padding:4px 6px; border-radius:4px; cursor:pointer; font-size:12px; }
    .sessions li.active { background:#1d4ed8; color:#f9fafb; }
    .sessions li:hover { background:#111827; }
    .panel { border:1px solid #1f2937; border-radius:8px; background:#020617; display:flex; flex-direction:column; overflow:hidden; }
    .panel h2 { margin:0; padding:6px 8px; font-size:12px; border-bottom:1px solid #1f2937; background:#030712; }
    .panel-body { flex:1; padding:8px; overflow:auto; font-size:12px; }
    .logs-line { font-family:monospace; white-space:pre-wrap; margin-bottom:2px; }
    .dom-item { margin-bottom:4px; }
    .dom-item span.tag { color:#60a5fa; }
    .dom-item span.text { color:#e5e7eb; }
    img.screenshot { max-width:100%; border-radius:4px; border:1px solid #1f2937; background:#000; }
    .empty { color:#6b7280; font-size:12px; }
    .input-row { display:flex; gap:4px; margin-top:4px; }
    .input-row input { flex:1; padding:4px 6px; border-radius:4px; border:1px solid #1f2937; background:#020617; color:#e5e7eb; font-size:12px; }
  </style>
</head>
<body>
  <div class="root">
    <div class="sidebar">
      <div style="font-weight:600; font-size:13px;">UI Sandbox Agent</div>
      <button id="btn-new-session" style="margin-top:8px; width:100%;">새 세션 만들기</button>
      <ul id="sessions" class="sessions"></ul>
    </div>
    <div class="main">
      <div class="toolbar">
        <span id="status" style="font-size:12px; color:#9ca3af;">세션이 없습니다.</span>
        <div style="flex:1;"></div>
        <button id="btn-open">Open</button>
        <button id="btn-click">Click</button>
        <button id="btn-type">Type</button>
        <button id="btn-wait">Wait</button>
        <button id="btn-snapshot">Snapshot</button>
      </div>
      <div class="content">
        <div class="panel">
          <h2>Logs</h2>
          <div id="logs" class="panel-body"></div>
        </div>
        <div class="panel">
          <h2>DOM & Screenshot</h2>
          <div class="panel-body">
            <div id="dom"></div>
            <div style="margin-top:8px;"><img id="shot" class="screenshot" alt="screenshot"/></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const sessionsEl = document.getElementById('sessions');
    const statusEl = document.getElementById('status');
    const logsEl = document.getElementById('logs');
    const domEl = document.getElementById('dom');
    const shotEl = document.getElementById('shot');

    let sessions = [];
    let currentSessionId = null;

    function renderSessions() {
      sessionsEl.innerHTML = '';
      sessions.forEach(id => {
        const li = document.createElement('li');
        li.textContent = id;
        if (id === currentSessionId) li.classList.add('active');
        li.onclick = () => selectSession(id);
        sessionsEl.appendChild(li);
      });
    }

    function setStatus(text) {
      statusEl.textContent = text;
    }

    async function createSession() {
      try {
        const res = await fetch('/session', { method: 'POST' });
        const data = await res.json();
        if (!data || !data.sessionId) { alert('세션 생성 실패'); return; }
        const id = String(data.sessionId);
        sessions.push(id);
        currentSessionId = id;
        renderSessions();
        setStatus('세션 ' + id + ' 선택됨');
        await refreshState();
      } catch (e) {
        alert('세션 생성 오류: ' + e);
      }
    }

    function selectSession(id) {
      currentSessionId = id;
      renderSessions();
      setStatus('세션 ' + id + ' 선택됨');
      refreshState();
    }

    async function refreshState() {
      if (!currentSessionId) {
        logsEl.innerHTML = '<div class="empty">세션을 먼저 생성하세요.</div>';
        domEl.innerHTML = '';
        shotEl.src = '';
        return;
      }
      try {
        const res = await fetch('/session/' + encodeURIComponent(currentSessionId) + '/state');
        const data = await res.json();
        if (!data.ok) {
          logsEl.innerHTML = '<div class="empty">상태 조회 실패: ' + (data.error || 'unknown') + '</div>';
          domEl.innerHTML = '';
          shotEl.src = '';
          return;
        }
        const st = data.state || {};
        const logs = Array.isArray(st.logs) ? st.logs : [];
        logsEl.innerHTML = logs.length ? '' : '<div class="empty">로그가 없습니다.</div>';
        logs.forEach(line => {
          const div = document.createElement('div');
          div.className = 'logs-line';
          div.textContent = line;
          logsEl.appendChild(div);
        });
        const domSummary = st.domSummary || {};
        const dom = Array.isArray(domSummary) ? domSummary : (Array.isArray(domSummary.elements) ? domSummary.elements : []);
        domEl.innerHTML = dom.length ? '' : '<div class="empty">DOM 요약이 없습니다.</div>';
        dom.forEach(item => {
          const div = document.createElement('div');
          div.className = 'dom-item';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = '[' + (item.tag || 'el') + (item.role ? ' role=' + item.role : '') + '] ';
          const text = document.createElement('span');
          text.className = 'text';
          text.textContent = item.text || '';
          div.appendChild(tag);
          div.appendChild(text);
          domEl.appendChild(div);
        });
        if (st.screenshotId) {
          shotEl.src = '/screenshots/' + encodeURIComponent(st.screenshotId);
        } else {
          shotEl.src = '';
        }
      } catch (e) {
        logsEl.innerHTML = '<div class="empty">상태 조회 오류: ' + e + '</div>';
        domEl.innerHTML = '';
        shotEl.src = '';
      }
    }

    async function sendStep(action, params) {
      if (!currentSessionId) {
        alert('먼저 세션을 생성하세요.');
        return;
      }
      try {
        const res = await fetch('/session/' + encodeURIComponent(currentSessionId) + '/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, params }),
        });
        const data = await res.json();
        if (!data.ok) {
          alert('step 실패: ' + (data.error || 'unknown'));
        }
        await refreshState();
      } catch (e) {
        alert('step 오류: ' + e);
      }
    }

    document.getElementById('btn-new-session').onclick = () => createSession();
    document.getElementById('btn-open').onclick = () => {
      const url = prompt('열 URL을 입력하세요:', 'http://localhost:3000');
      if (!url) return;
      sendStep('open', { url });
    };
    document.getElementById('btn-click').onclick = () => {
      const sel = prompt('클릭할 셀렉터를 입력하세요:', 'button');
      if (!sel) return;
      sendStep('click', { selector: sel });
    };
    document.getElementById('btn-type').onclick = () => {
      const sel = prompt('입력할 셀렉터:', 'input');
      if (!sel) return;
      const text = prompt('입력할 텍스트:', '');
      if (text == null) return;
      sendStep('type', { selector: sel, text, pressEnter: true });
    };
    document.getElementById('btn-wait').onclick = () => {
      const ms = prompt('기다릴 시간(ms):', '1000');
      if (!ms) return;
      sendStep('wait', { ms: Number(ms) || 0 });
    };
    document.getElementById('btn-snapshot').onclick = () => {
      sendStep('snapshot', {});
    };

    setStatus('세션이 없습니다. "새 세션 만들기"를 눌러 시작하세요.');
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (req.method === 'POST' && pathname === '/session') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    req.on('end', async () => {
      let options = {};
      try {
        options = body ? JSON.parse(body) : {};
      } catch {
        options = {};
      }
      try {
        const { id } = await createSession(options);
        sendJson(res, 200, { ok: true, sessionId: id });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname && /^\/session\/[^/]+\/step$/.test(pathname)) {
    const parts = pathname.split('/');
    const sessionId = decodeURIComponent(parts[2] || '');
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    req.on('end', async () => {
      let payload = {};
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        payload = {};
      }
      const result = await handleStep(sessionId, payload.action, payload.params);
      sendJson(res, 200, result);
    });
    return;
  }

  if (req.method === 'GET' && pathname && /^\/session\/[^/]+\/state$/.test(pathname)) {
    const parts = pathname.split('/');
    const sessionId = decodeURIComponent(parts[2] || '');
    const s = sessions.get(sessionId);
    if (!s) {
      sendJson(res, 404, { ok: false, error: 'unknown_session' });
      return;
    }
    // If we already have a lastState, return it; otherwise take a fresh snapshot.
    if (s.lastState) {
      sendJson(res, 200, { ok: true, state: s.lastState });
    } else {
      const result = await handleStep(sessionId, 'snapshot', {});
      sendJson(res, 200, result);
    }
    return;
  }

  if (req.method === 'GET' && pathname && pathname.startsWith('/screenshots/')) {
    const id = decodeURIComponent(pathname.replace('/screenshots/', ''));
    const shotsDir = path.join(__dirname, 'screenshots');
    const full = path.join(shotsDir, id);
    fs.stat(full, (err, stat) => {
      if (err || !stat || !stat.isFile()) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const stream = fs.createReadStream(full);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      stream.pipe(res);
    });
    return;
  }

  // Basic health check
  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true, sessions: sessions.size });
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[ui-sandbox-agent] listening on http://${HOST}:${PORT}`);
});
