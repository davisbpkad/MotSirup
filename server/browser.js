const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { verifyIdentity, validateList, validatePackage } = require('./calc');
const { commitSnapshot } = require('./store');
const { SPSE, readCredential, autofillSpse, watchSpse } = require('./login');

const ORIGIN = 'https://sirup.inaproc.id';
const contexts = new Map();
const jobs = new Map();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function contextFor(root, ppk) {
  if (contexts.has(ppk.id)) return contexts.get(ppk.id);
  const dir = path.join(root, 'data/profiles', ppk.id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chrome', headless: false, viewport: { width: 1280, height: 850 }, acceptDownloads: false
  });
  // User submits login; the collector itself only uses fixed GET endpoints.
  context.on('close', () => contexts.delete(ppk.id));
  contexts.set(ppk.id, context);
  return context;
}

async function connect(root, ppk) {
  const configured = !!readCredential(root, ppk.id);
  const context = await contextFor(root, ppk);
  const page = context.pages()[0] || await context.newPage();
  await watchSpse(page, root, ppk.id);
  await page.goto(SPSE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await autofillSpse(page, root, ppk.id);
  await page.bringToFront();
  return { message: 'SPSE Jawa Barat dibuka untuk ' + ppk.shortName + '. ' + (configured ? 'User ID/password diisi otomatis saat form login SPSE dibuka.' : 'Credential belum diisi; login manual atau isi credential.md per PPK.') + ' Pilih LOGIN > NON PENYEDIA, lanjutkan tahap login sendiri, lalu buka SIRUP dari SPSE dan tekan Sinkronisasi pada dashboard.' };
}

async function readDocument(context, url, mode, suppliedHtml = null) {
  let html = suppliedHtml;
  if (html === null) {
    const response = await context.request.get(url, { timeout: 45000, maxRedirects: 0, headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok()) throw Error('Sesi SIRUP kedaluwarsa atau halaman tidak tersedia. Hubungkan SIRUP kembali.');
    html = await response.text();
  }
  const page = await context.newPage();
  try {
    await page.route('**/*', route => route.abort());
    return await page.evaluate(({ html, mode }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
      if (mode === 'identity') {
        const text = clean(doc.querySelector('#modalPengguna')?.textContent);
        const part = (start, end) => text.split(start)[1]?.split(end)[0]?.trim() || '';
        return { name: part('Nama Lengkap :', 'K/L/PD :'), klpd: part('K/L/PD :', 'Satker :'),
          satker: part('Satker :', 'Golongan :'), role: part('Role User :', 'Email :') };
      }
      const rows = [...doc.querySelectorAll('tr')].map(tr => [...tr.cells].map(c => clean(c.textContent)));
      const get = key => rows.find(r => r.length === 2 && r[0] === key)?.[1];
      const header = [...doc.querySelectorAll('tr')].find(tr => [...tr.cells].some(c => clean(c.textContent) === 'MAK'));
      const funding = header ? [...header.closest('table').querySelectorAll('tr')].map(tr => [...tr.cells].map(c => clean(c.textContent)))
        .filter(r => (r.length === 5 || r.length === 6) && /^\d+\.$/.test(r[0])) : [];
      const structural = ['Kode Sub Kegiatan', 'Kode Sub-Kegiatan', 'Kode Subkegiatan'].map(get).find(Boolean);
      const fields = [...doc.querySelectorAll('tr')].filter(tr => tr.cells.length === 2 && !tr.parentElement.closest('td,th')).map(tr => {
        const cell = tr.cells[1];
        const table = cell.querySelector('table');
        return { label: clean(tr.cells[0].textContent), text: table ? '' : clean(cell.textContent),
          table: table ? [...table.rows].map(row => [...row.cells].map(c => clean(c.textContent))) : null };
      }).filter(f => f.label && (f.text || f.table?.length));
      return { id: get('Kode RUP'), name: get('Nama Paket'), fields, year: Number(get('Tahun Anggaran')), amount: Math.round(Number(get('Total Pagu')) * 100),
        funding: funding.map(r => ({ mak: r[r.length - 2], amount: Math.round(Number(r[r.length - 1]) * 100) })),
        location: get('Lokasi Pekerjaan') || '', structuralSubCode: structural || null };
    }, { html, mode });
  } finally { await page.close(); }
}

async function getIdentity(context, ppk) {
  const identity = await readDocument(context, ORIGIN + '/sirup/rup/penyedia', 'identity');
  verifyIdentity(identity, ppk);
  return identity;
}

async function lists(context, year) {
  const all = [];
  for (const type of ['penyedia', 'swakelola']) {
    const response = await context.request.get(`${ORIGIN}/sirup/datatablectr/datarup${type}2018?tahun=${year}&iDisplayLength=10000`, {
      timeout: 45000, maxRedirects: 0, headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok()) throw Error('Daftar SIRUP tidak tersedia. Hubungkan akun PPK kembali.');
    let data;
    try { data = await response.json(); } catch { throw Error('Sesi SIRUP tidak aktif; daftar bukan JSON.'); }
    all.push(...validateList(data, type));
  }
  return all;
}

const signature = list => JSON.stringify(list.map(p => [p.type, p.id, p.amount, p.status]).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])));

function startSync(root, baseline, ppk) {
  if ([...jobs.values()].some(j => j.running)) throw Error('Sinkronisasi lain sedang berjalan. Tunggu sampai selesai.');
  const job = { running: true, done: 0, total: 0, phase: 'Memeriksa identitas akun', error: null };
  jobs.set(ppk.id, job);
  (async () => {
    try {
      const context = await contextFor(root, ppk);
      const identity = await getIdentity(context, ppk);
      const before = await lists(context, baseline.year);
      const active = before.filter(p => p.status === '3');
      job.total = active.length;
      job.phase = 'Membaca detail paket terumumkan';
      const packages = [];
      for (let i = 0; i < active.length; i += 3) {
        const batch = await Promise.allSettled(active.slice(i, i + 3).map(async p => {
          const detail = await readDocument(context, `${ORIGIN}/sirup/${p.type}/${p.id}`, 'detail');
          validatePackage(detail, p, baseline.year);
          job.done++;
          return { ...p, ...detail };
        }));
        const failure = batch.find(r => r.status === 'rejected');
        if (failure) throw failure.reason;
        packages.push(...batch.map(r => r.value));
        await wait(250);
      }
      job.phase = 'Memeriksa ulang konsistensi daftar';
      await getIdentity(context, ppk);
      const after = await lists(context, baseline.year);
      if (signature(before) !== signature(after)) throw Error('Daftar paket berubah saat sinkron. Hasil lama dipertahankan; ulangi sinkron.');
      const nonActive = before.filter(p => p.status !== '3').map(p => ({ ...p, funding: [] }));
      commitSnapshot(path.join(root, 'data/snapshots', String(baseline.year)), { ppk: ppk.id, year: baseline.year, identity,
        syncedAt: new Date().toISOString(), complete: true, scopeVerified: false,
        source: 'Sesi akun PPK terverifikasi; subkegiatan berdasarkan MAK belum diaudit independen',
        packages: [...packages, ...nonActive] });
      job.phase = 'Selesai';
    } catch (error) {
      job.error = error.message;
      job.phase = 'Gagal — hasil sinkron sebelumnya tetap tersedia';
    } finally { job.running = false; }
  })();
  return job;
}

async function closeAll() { await Promise.allSettled([...contexts.values()].map(c => c.close())); }
async function publicDetail(type, id, year) {
  if (!['penyedia','swakelola'].includes(type) || !/^\d{1,15}$/.test(id)) throw Error('Identitas paket tidak valid.');
  const url = `${ORIGIN}/sirup/${type}/${id}`;
  const response = await fetch(url, { redirect:'error', signal:AbortSignal.timeout(30000), headers:{'Cache-Control':'no-cache'} });
  if (!response.ok) throw Error('Detail publik SIRUP tidak tersedia (HTTP ' + response.status + ').');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 2000000) throw Error('Halaman detail SIRUP melebihi batas ukuran.');
    chunks.push(Buffer.from(chunk));
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const detail = await readDocument(context, url, 'detail', Buffer.concat(chunks).toString('utf8'));
    if (detail.id !== id || detail.year !== year || !detail.name || !detail.fields.length) throw Error('Detail SIRUP tidak sesuai ID/TA yang dipilih atau tidak tersedia.');
    validatePackage(detail, { id, amount: detail.amount }, year);
    return { ...detail, fetchedAt: new Date().toISOString(), url: `${ORIGIN}/sirup/${type}/${id}` };
  } finally { await browser.close(); }
}
module.exports = { connect, startSync, jobs, closeAll, readDocument, getIdentity, lists, publicDetail };
