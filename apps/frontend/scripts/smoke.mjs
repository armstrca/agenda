// Browser smoke test for the planner running on sql.js (no Tauri).
//
//   yarn smoke            (from apps/frontend)   or   yarn smoke   (from the repo root)
//
// Starts a Vite dev server on its own port, drives the installed Microsoft Edge through Playwright
// (no browser download), and checks the user-visible path end to end: create a planner, open this
// week, type into a day, draw a stroke, reload and see both persisted, page to the right-hand side,
// open the month. Every request to a host other than localhost is blocked and reported, so a font,
// icon or script that still loads from a CDN shows up here as a failure.

import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PORT = Number(process.env.SMOKE_PORT || 3100);
const BASE = `http://localhost:${PORT}`;
const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.env.SMOKE_HEADED !== '1';

// tldraw UI selectors (data-testid is `${sourceId}.${id}` for menu items, `tools.${id}` for tools).
const TOGGLE_DRAWING_OFF = '[data-testid="quick-actions.toggle-tldraw"], button[aria-label="Disable TLDraw"]';
const DRAW_TOOL = '[data-testid="tools.draw"]';

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

async function waitForServer(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not answer on ${url} within ${ms} ms`);
}

// Kill whatever still listens on the port. On Windows a previous run's dev server survives killing
// its parent, because yarn starts it through a shell.
function killPort(port) {
  if (process.platform !== 'win32') return;
  let out = '';
  try {
    out = execSync('netstat -ano', { encoding: 'utf8' });
  } catch {
    return;
  }
  const pids = new Set(
    out
      .split(/\r?\n/)
      .filter((line) => line.includes(`:${port} `) && line.includes('LISTENING'))
      .map((line) => line.trim().split(/\s+/).pop()),
  );
  for (const pid of pids) {
    if (!pid || pid === '0') continue;
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // already gone
    }
  }
}

function startVite() {
  killPort(PORT);
  const child = spawn('yarn', ['-s', 'vite', '--port', String(PORT), '--strictPort'], {
    cwd: FRONTEND,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  child.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  return child;
}

function stop(child) {
  if (child && !child.killed) {
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // already gone
      }
    } else {
      child.kill('SIGTERM');
    }
  }
  killPort(PORT);
}

async function settles(fn, timeout) {
  try {
    await fn(timeout);
    return true;
  } catch {
    return false;
  }
}

const vite = startVite();
let browser;
try {
  await waitForServer(BASE, 60_000);
  browser = await chromium.launch({ channel: 'msedge', headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1200, height: 1500 } });

  const leaks = new Set();
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return route.continue();
    leaks.add(route.request().url());
    return route.abort();
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (text.startsWith('Warning:')) return; // React dev warnings
    errors.push(`console: ${text.slice(0, 300)}`);
  });

  // 1. Fresh database: the index page offers to create a planner.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check(
    await settles((t) => page.waitForSelector('text=No planners yet', { timeout: t }), 20_000),
    'index shows the empty state on a fresh database',
  );

  // 2. Create a planner; the app lands on this week's left page.
  await page.goto(`${BASE}/planners/create`, { waitUntil: 'networkidle' });
  await page.fill('input[required]', 'Smoke planner');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/planners\/[0-9a-f-]{36}\/weekly\/\d{1,2}_\d{4}_l$/, { timeout: 20_000 });
  const weeklyUrl = page.url();
  const plannerId = weeklyUrl.match(/planners\/([0-9a-f-]{36})/)[1];
  check(true, `planner created, at ${weeklyUrl.replace(BASE, '')}`);

  // 3. The weekly left page renders six day sections, editors and the drawing layer.
  await page.waitForSelector('.wl-day-section', { timeout: 20_000 });
  check((await page.locator('.wl-day-section').count()) === 6, 'six day sections rendered');
  await page.waitForSelector('.wl-tiptap-main .ProseMirror', { timeout: 20_000 });
  check((await page.locator('.wl-tiptap-main .ProseMirror').count()) === 6, 'six TipTap editors rendered');
  await page.waitForSelector('.tl-container', { timeout: 20_000 });
  check((await page.locator('.tl-container').count()) >= 1, 'tldraw canvas mounted');
  check((await page.locator('.day-number').first().textContent()) !== '', 'day numbers filled from week data');

  // 4. The drawing layer covers the page by default; a user disables it from tldraw's quick actions
  //    before typing. Type into the first day, wait past the 2 s debounce, reload, and the text is
  //    still there.
  await page.locator(TOGGLE_DRAWING_OFF).first().click({ timeout: 20_000 });
  await page.waitForSelector('#power-off-icon', { timeout: 10_000 });
  check(true, 'drawing layer toggled off through the tldraw quick action');
  await page.locator('.wl-tiptap-main .ProseMirror').first().click();
  await page.keyboard.type('Hello smoke');
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.wl-tiptap-main .ProseMirror', { timeout: 20_000 });
  check(
    await settles(
      (t) =>
        page.waitForFunction(
          () => (document.querySelector('.wl-tiptap-main .ProseMirror')?.textContent || '').includes('Hello smoke'),
          null,
          { timeout: t },
        ),
      10_000,
    ),
    'typed text survives a reload (entry saved through sql.js + IndexedDB)',
  );

  // 5. After the reload the drawing layer is on again. Pick the draw tool from the toolbar (the
  //    canvas is mounted without autofocus, so keystrokes would not reach it), draw a stroke, wait
  //    past the 350 ms debounce, reload, and a shape is still on the canvas.
  await page.waitForSelector('.tl-container', { timeout: 20_000 });
  const canvas = page.locator('.tl-canvas').first();
  await canvas.waitFor({ timeout: 20_000 });
  await page.locator(DRAW_TOOL).first().click({ timeout: 20_000 });
  const box = await canvas.boundingBox();
  const sx = box.x + box.width * 0.5;
  const sy = box.y + box.height * 0.3;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(sx + i * 6, sy + Math.sin(i / 3) * 20);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const shapesBefore = await page.locator('.tl-shape').count();
  check(shapesBefore >= 1, `stroke created a shape (${shapesBefore})`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tl-container', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const shapesAfter = await page.locator('.tl-shape').count();
  check(shapesAfter >= 1, `stroke survives a reload (${shapesAfter} shapes)`);

  // 6. Page forward: left -> right side of the same week; the right page renders its calendars.
  await page.click('.button-next');
  await page.waitForURL(/_r$/, { timeout: 20_000 });
  await page.waitForSelector('.wr-day-section, .wr-calendar-button', { timeout: 20_000 });
  check((await page.locator('.wr-calendar-button').count()) >= 42, 'right page mini calendars rendered');

  // 7. Monthly page.
  await page.goto(`${BASE}/planners/${plannerId}/monthly/10_2025`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ProseMirror', { timeout: 20_000 });
  check((await page.locator('.ProseMirror').count()) === 42, 'monthly page renders 42 day cells');

  // 8. Index lists the planner now.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check(
    await settles((t) => page.waitForSelector('text=Smoke planner', { timeout: t }), 20_000),
    'index lists the new planner',
  );

  // 9. No network leaks, no runtime errors.
  check(leaks.size === 0, `no requests to non-local hosts${leaks.size ? `: ${[...leaks].join(', ')}` : ''}`);
  check(errors.length === 0, `no page errors${errors.length ? `:\n  ${errors.join('\n  ')}` : ''}`);
} catch (e) {
  failures.push(`crashed: ${e.message}`);
  console.error(e);
} finally {
  await browser?.close();
  stop(vite);
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall smoke checks passed');
process.exit(failures.length ? 1 : 0);
