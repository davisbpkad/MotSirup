const fs = require('node:fs');
const path = require('node:path');
const { SUB } = require('./calc');
const { activityCode, normalizeYear } = require('./structure');

const validYear = year => Number.isInteger(year) && year >= 2000 && year <= 2100;
function readConfig(root) {
  const file = path.join(root, 'data/settings.json');
  let config;
  if (fs.existsSync(file)) config = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, 'data/pagu.json'), 'utf8'));
    config = { revision: 0, activeYear: baseline.year, years: { [baseline.year]: baseline } };
  }
  return { ...config, years: Object.fromEntries(Object.entries(config.years).map(([year, value]) => [year, normalizeYear(value)])) };
}

function saveConfig(root, input) {
  const current = readConfig(root);
  if (input?.revision !== current.revision) throw Error('Konfigurasi telah berubah. Buka ulang pengaturan sebelum menyimpan.');
  if (!validYear(input.activeYear) || !input.years || !input.years[input.activeYear] || Object.keys(input.years).length > 30) throw Error('TA harus 2000–2100 dan tersedia dalam konfigurasi.');
  if (Object.keys(current.years).some(y => !input.years[y])) throw Error('Arsip TA tidak boleh dihapus.');
  const years = {};
  for (const [key, raw] of Object.entries(input.years)) {
    const value = normalizeYear(raw);
    if (!validYear(Number(key)) || String(Number(key)) !== key || value.year !== Number(key)) throw Error('TA tidak valid.');
    const prior = current.years[key] || current.years[current.activeYear];
    if (!Array.isArray(value.targets) || value.targets.length > 2000) throw Error('Daftar target tidak valid (maksimal 2000).');
    if (!Array.isArray(value.activities) || value.activities.length > 2000) throw Error('Daftar kegiatan tidak valid (maksimal 2000).');
    if (value.inactiveActivities?.length) throw Error('Status kegiatan harus diatur pada parent kegiatan.');
    const activityIds = new Set(), activityKeys = new Set();
    const activities = value.activities.map(activity => {
      const key = activity.ppk + ':' + activity.code;
      if (typeof activity.id !== 'string' || !/^[a-zA-Z0-9:._-]{1,100}$/.test(activity.id) || activityIds.has(activity.id)) throw Error('ID kegiatan tidak valid atau ganda.');
      if (!prior.ppks.some(p => p.id === activity.ppk) || typeof activity.code !== 'string' || !/^\d\.\d{2}\.\d{2}\.\d\.\d{2}$/.test(activity.code) || activityKeys.has(key)) throw Error('PPK/kode kegiatan tidak valid atau ganda.');
      if (typeof activity.name !== 'string' || !activity.name.trim() || activity.name.length > 500) throw Error('Nama kegiatan wajib diisi (maksimal 500 karakter).');
      if (activity.active !== undefined && typeof activity.active !== 'boolean') throw Error('Status kegiatan tidak valid.');
      activityIds.add(activity.id); activityKeys.add(key);
      return { id: activity.id, ppk: activity.ppk, code: activity.code, name: activity.name.trim(), active: activity.active !== false };
    });
    const seen = new Set();
    const targets = value.targets.map(t => {
      const id = t.ppk + ':' + t.code;
      if (!prior.ppks.some(p => p.id === t.ppk) || !SUB.test(t.code) || t.code === '5.02.01.1.02.0001' || seen.has(id)) throw Error('PPK/kode subkegiatan tidak valid, dikecualikan, atau ganda.');
      if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 500) throw Error('Nama subkegiatan wajib diisi (maksimal 500 karakter).');
      const parent = activities.find(activity => activity.id === t.activityId && activity.ppk === t.ppk);
      if (!parent) throw Error('Parent kegiatan tidak tersedia pada PPK ini. Kegiatan yang masih memiliki subkegiatan tidak boleh dihapus.');
      if (activityCode(t.code) !== parent.code) throw Error('Kode subkegiatan harus mengikuti kode kegiatan induk.');
      if (t.budget !== null && (!Number.isSafeInteger(t.budget) || t.budget < 0 || t.budget > 100000000000000)) throw Error('Pagu harus nominal nonnegatif maksimal Rp1 triliun, atau kosong.');
      if (t.active !== undefined && typeof t.active !== 'boolean') throw Error('Status aktif tidak valid.');
      seen.add(id);
      return { ppk: t.ppk, activityId: parent.id, code: t.code, name: t.name.trim(), budget: t.budget, active: t.active !== false };
    });
    if (!Number.isSafeInteger(targets.reduce((sum,t) => sum + (t.budget || 0),0))) throw Error('Jumlah pagu melampaui batas nominal aman.');
    years[key] = { ...prior, year: Number(key), activities, targets, excelComparisons: current.years[key]?.excelComparisons || [], source: current.years[key]?.source || 'Konfigurasi manual TA ' + key };
  }
  const next = { revision: current.revision + 1, activeYear: input.activeYear, years, updatedAt: new Date().toISOString() };
  const file = path.join(root, 'data/settings.json');
  // Preserve the previous complete configuration before replacing it atomically.
  fs.writeFileSync(file + '.bak.tmp', JSON.stringify(current, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.bak.tmp', file + '.bak');
  fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
  return next;
}

function snapshotDirectory(root, year) { return path.join(root, 'data/snapshots', String(year)); }
function annualSnapshots(root, baseline) {
  const { readSnapshots } = require('./store');
  const old = readSnapshots(path.join(root, 'data/snapshots'), baseline.ppks).filter(s => s.year === baseline.year);
  const recent = readSnapshots(snapshotDirectory(root, baseline.year), baseline.ppks);
  return baseline.ppks.flatMap(p => recent.find(s => s.ppk === p.id && s.year === baseline.year) || old.find(s => s.ppk === p.id) || []);
}
module.exports = { readConfig, saveConfig, annualSnapshots, snapshotDirectory };
