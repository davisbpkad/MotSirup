const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { aggregate } = require('./calc');
const { connect, startSync, jobs, closeAll, publicDetail } = require('./browser');
const { readConfig, saveConfig, annualSnapshots } = require('./config');
const { exportPng } = require('./export');
const ROOT = process.env.DASHBOARD_TEST_ROOT || path.resolve(__dirname, '..');
const ASSETS_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.DASHBOARD_TEST_PORT || 8788);
const ORIGIN = 'http://127.0.0.1:' + PORT;
const token = crypto.randomBytes(32).toString('hex');
let expensiveRequest = false;
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Error('Gunakan Content-Type application/json.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 2000000) throw Error('Konfigurasi terlalu besar.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function dataView(config) {
  const baseline = config.years[config.activeYear];
  return { ...aggregate(baseline, annualSnapshots(ROOT, baseline)), token, jobs: Object.fromEntries(jobs), years: Object.keys(config.years).map(Number), settingsRevision: config.revision };
}
const assets = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/favicon.png': ['favicon.png', 'image/png'],
  '/logo.png': ['logo.png', 'image/png'],
  '/vendor/vue.js': ['node_modules/vue/dist/vue.global.prod.js', 'text/javascript; charset=utf-8'],
  '/vendor/chart.js': ['node_modules/chart.js/dist/chart.umd.js', 'text/javascript; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (req.headers.host !== '127.0.0.1:' + PORT) return send(403, { error: 'Host tidak diizinkan.' });
  const url = new URL(req.url, ORIGIN);
  try {
    if (req.method === 'GET' && url.pathname === '/api/data') {
      return send(200, dataView(readConfig(ROOT)));
    }
    if (req.method === 'GET' && url.pathname === '/api/settings') return send(200, readConfig(ROOT));
    if (req.method === 'POST') {
      if (req.headers.origin !== ORIGIN || req.headers['x-dashboard-token'] !== token || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Permintaan bukan dari dashboard lokal.' });
      if (url.pathname === '/api/settings') {
        const body = await jsonBody(req);
        if ([...jobs.values()].some(j => j.running)) return send(409, { error:'Tunggu sinkronisasi selesai sebelum mengubah konfigurasi.' });
        return send(200, saveConfig(ROOT, body));
      }
      if (url.pathname === '/api/export' || url.pathname === '/api/detail') {
        if (expensiveRequest) return send(409, { error:'Pengambilan detail/ekspor lain sedang berjalan. Coba lagi setelah selesai.' });
        const body = await jsonBody(req);
        if (expensiveRequest) return send(409, { error:'Pengambilan detail/ekspor lain sedang berjalan. Coba lagi setelah selesai.' });
        expensiveRequest = true;
        try {
          const config = readConfig(ROOT), view = dataView(config);
          if (url.pathname === '/api/detail') {
            const baseline = config.years[config.activeYear];
            if (body.year !== baseline.year || !annualSnapshots(ROOT, baseline).some(s => s.ppk === body.ppk && s.packages.some(p => p.id === body.id && p.type === body.type))) throw Error('Paket tidak tersedia pada snapshot PPK/TA aktif.');
            return send(200, await publicDetail(body.type, body.id, body.year));
          }
          if (body.year !== view.year || body.revision !== config.revision) throw Error('TA/konfigurasi telah berubah. Muat ulang sebelum mengekspor.');
          const png = await exportPng(ASSETS_ROOT, view, body);
          res.writeHead(200, { 'Content-Type':'image/png', 'Content-Disposition':`attachment; filename="sirup-${view.year}-${body.section}.png"` });
          return res.end(png);
        } finally { expensiveRequest = false; }
      }
      const config = readConfig(ROOT), baseline = config.years[config.activeYear];
      const match = url.pathname.match(/^\/api\/(connect|sync)\/([a-z]+)$/);
      const ppk = match && baseline.ppks.find(p => p.id === match[2]);
      if (!ppk) return send(404, { error: 'PPK tidak ditemukan.' });
      const body = await jsonBody(req);
      if (body.year !== baseline.year) throw Error('TA aktif telah berubah. Muat ulang sebelum menghubungkan atau sinkronisasi.');
      if ([...jobs.values()].some(j => j.running)) return send(409, { error: 'Sinkronisasi sedang berjalan.' });
      if (match[1] === 'connect') return send(200, await connect(ROOT, ppk));
      return send(202, startSync(ROOT, baseline, ppk));
    }
    const asset = assets[url.pathname];
    if (req.method === 'GET' && asset) {
      res.writeHead(200, { 'Content-Type': asset[1] });
      fs.createReadStream(path.join(ASSETS_ROOT, asset[0])).pipe(res);
      return;
    }
    send(404, { error: 'Tidak ditemukan.' });
  } catch (error) { send(400, { error: error.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log('Monitoring SIRUP: ' + ORIGIN));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await closeAll(); process.exit(0); });
