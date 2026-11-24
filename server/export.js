const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function exportPng(root, view, { section, ppk = '', query = '', opened = [] }) {
  if (!['ppk','rekap'].includes(section) || typeof query !== 'string' || query.length > 200 || (ppk && !view.ppks.some(p => p.id === ppk))) throw Error('Pilihan ekspor tidak valid.');
  if (!Array.isArray(opened) || opened.length > 4000 || opened.some(key => typeof key !== 'string' || key.length > 200)) throw Error('Status dropdown ekspor tidak valid.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const assets = { '/': ['public/index.html','text/html'], '/app.js': ['public/app.js','text/javascript'], '/style.css': ['public/style.css','text/css'], '/vendor/vue.js': ['node_modules/vue/dist/vue.global.prod.js','text/javascript'], '/vendor/chart.js': ['node_modules/chart.js/dist/chart.umd.js','text/javascript'] };
    // Render only local assets and supplied data; exports cannot browse arbitrary URLs or use login profiles.
    assets['/favicon.png'] = ['favicon.png','image/png'];
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://dashboard.local') return route.abort();
      if (url.pathname === '/api/data') return route.fulfill({ json: { ...view, token: '', jobs: {} } });
      const asset = assets[url.pathname];
      return asset ? route.fulfill({ body: fs.readFileSync(path.join(root, asset[0])), contentType: asset[1] }) : route.abort();
    });
    await page.goto('http://dashboard.local/');
    await page.waitForSelector('.ppk-card');
    await page.locator('#filter-ppk').selectOption(ppk);
    await page.locator('#search').fill(query);
    if (section === 'rekap') {
      const expanded = new Set(opened);
      for (const selector of ['.activity-row','.sub-row']) {
        for (const row of await page.locator(selector).all()) {
          if (expanded.has(await row.getAttribute('data-open-key'))) await row.click();
        }
      }
    }
    const target = page.locator(section === 'ppk' ? '.ppk-section' : '.details-section .table-scroll');
    await page.addStyleTag({ content: '.export-controls,.filters{display:none!important}.table-scroll{overflow:visible}.ppk-section,.details-section{background:#fff;padding:22px;border-radius:10px}.export-caption{font-size:12px;color:#596d63;margin-bottom:18px}.ppk-card{animation:none!important}' });
    if (section === 'ppk') await target.evaluate((element, meta) => {
      const note = document.createElement('p'); note.className = 'export-caption';
      note.textContent = `BPKAD Jawa Barat · TA ${meta.year} · ${meta.filter} · Pencarian: ${meta.query || 'semua'} · Ekspor ${new Date().toLocaleString('id-ID', { timeZone:'Asia/Jakarta' })} WIB · Data sinkron, bukan realisasi belanja. Sinkron sumber: ${meta.sync}.`;
      element.prepend(note);
    }, { year: view.year, filter: ppk ? view.ppks.find(p => p.id === ppk).shortName : 'Semua PPK', query,
      sync: view.ppks.filter(p=>!ppk||p.id===ppk).map(p=>p.shortName + ': ' + (p.syncedAt || 'belum sinkron')).join('; ') });
    if (section === 'ppk' && ppk) await page.locator('.ppk-card').evaluateAll((cards, id) => { for (const card of cards) if (card.dataset.ppk !== id) card.remove(); }, ppk);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(c => c.width > 0));
    const box = await target.boundingBox();
    // ponytail: one PNG is capped at 30,000px; narrow PPK/search filters for larger reports.
    if (box.height > 30000) throw Error('Rekap terlalu panjang untuk satu PNG. Pilih satu PPK atau persempit pencarian.');
    return await target.screenshot({ type: 'png', animations: 'disabled' });
  } finally { await browser.close(); }
}
module.exports = { exportPng };
