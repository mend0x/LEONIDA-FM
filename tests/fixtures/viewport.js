// This fixture is copied into a local QA build on demand and never deployed.
const params = new URLSearchParams(location.search),
  frame = document.querySelector('iframe'),
  out = document.querySelector('output');
const w = Math.min(2560, Math.max(300, Number(params.get('w')) || 1440)),
  h = Math.min(2300, Math.max(300, Number(params.get('h')) || 900));
frame.width = String(w);
frame.height = String(h);
const allowed = new Set([
  '/',
  '/radio/flash-fm',
  '/radio/cocoteo-fm',
  '/radio/the-chamber',
  '/radio/dirty-south',
  '/radio/afro-bank',
  '/stations',
  '/music',
  '/status',
  '/settings',
  '/about',
  '/admin',
]);
const route = params.get('view') || '/';
function renderResult(value) {
  out.textContent = JSON.stringify(value, null, 2);
}
frame.addEventListener('load', async () => {
  try {
    const doc = frame.contentDocument,
      win = frame.contentWindow;
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    renderResult({stage:'frame loaded'});
    for(let i=0; i<100 && !doc.querySelector('main h1'); i++) await sleep(50);
    await Promise.race([doc.fonts.ready,sleep(1500)]);
    renderResult({stage:'page and fonts ready'});
    if (params.get('panel') === 'wheel') {
      const waitFor = async (selector) => {
        for (let i = 0; i < 150; i++) {
          const el = doc.querySelector(selector);
          if (el) return el;
          await new Promise((done) => setTimeout(done, 40));
        }
        throw Error('The wheel did not mount');
      };
      (await waitFor('[data-testid="wheel-open"]')).click();
      await waitFor('dialog[open]');
      await new Promise((done) => setTimeout(done, 220));
    }
    if (!params.has('audit')) return;
    const script = doc.createElement('script');
    script.src = '/qa/axe.min.js';
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      doc.head.append(script);
    });
    renderResult({stage:'axe running'});
    await sleep(150);
    const result = await win.axe.run(doc, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
      },
    });
    renderResult({
      view: route,
      width: w,
      height: h,
      engine: result.testEngine,
      documentWidth: doc.documentElement.scrollWidth,
      passes: result.passes.length,
      incomplete: result.incomplete.map((i) => i.id),
      violations: result.violations.map((i) => ({
        id: i.id,
        impact: i.impact,
        nodes: i.nodes.map((n) => ({ target: n.target, issue: n.failureSummary })),
      })),
    });
  } catch (error) {
    renderResult({ error: String(error) });
  }
});
frame.src = allowed.has(route) ? route : '/';
