const EXCLUDED = '5.02.01.1.02.0001';
const { normalizeYear } = require('./structure');
const SUB = /^\d\.\d{2}\.\d{2}\.\d\.\d{2}\.\d{4}$/;
const MAK = /^(\d\.\d{2}\.\d{2}\.\d\.\d{2}\.\d{4})\.\d\.\d\.\d{2}\.\d{2}\.\d{3}\.\d{5}\.?$/;
const normalize = s => String(s || '').normalize('NFKD').replace(/[^a-z0-9]/gi, '').toUpperCase();
const money = n => Number.isSafeInteger(n) && n >= 0;

function verifyIdentity(identity, ppk) {
  if (identity.role !== 'PPK') throw Error('Akun harus PPK, bukan PA/KPA. Login memakai akun PPK yang dipilih.');
  const fullName = name => normalize(String(name || '').split(',')[0]);
  if (!fullName(identity.name) || fullName(identity.name) !== fullName(ppk.name)) throw Error('Nama akun tidak cocok dengan PPK yang dipilih.');
  if (normalize(identity.satker) !== normalize('Badan Pengelolaan Keuangan dan Aset Daerah') || normalize(identity.klpd) !== normalize('Provinsi Jawa Barat')) throw Error('Akun bukan satker BPKAD Provinsi Jawa Barat.');
}

function validateList(data, type) {
  if (!Array.isArray(data.aaData) || Number(data.iTotalDisplayRecords) !== data.aaData.length) throw Error('Daftar SIRUP terpotong atau sesi kedaluwarsa.');
  const seen = new Set();
  return data.aaData.map(r => {
    const id = String(r[0]);
    if (!/^\d+$/.test(id) || seen.has(id) || !/^\d+(\.\d{1,2})?$/.test(String(r[3])) || !r[9]) throw Error('Baris paket SIRUP tidak valid atau ganda.');
    seen.add(id);
    const amount = Math.round(Number(r[3]) * 100);
    if (!money(amount)) throw Error('Pagu paket tidak valid.');
    return { id, type, name: String(r[2]), amount, status: String(r[9]), activityName: String(r[1] || '').replace(/[\s,]+$/, '') };
  });
}

function validatePackage(p, expected, year) {
  if (p.id !== expected.id || p.year !== year || p.amount !== expected.amount || !money(p.amount)) throw Error('Identitas/tahun/pagu detail tidak cocok dengan daftar: ' + expected.id);
  if (!p.funding?.length || p.funding.some(f => !money(f.amount)) || p.funding.reduce((s, f) => s + f.amount, 0) !== p.amount) throw Error('Rincian pendanaan tidak cocok dengan pagu paket: ' + expected.id);
}

function metric(budget, input) {
  if (input === null) return { state: 'belum-sinkron', percent: null, difference: null };
  if (budget === null) return { state: 'target-kosong', percent: null, difference: null };
  const difference = input - budget;
  if (budget === 0) return { state: input ? 'tanpa-alokasi' : 'nihil', percent: null, difference };
  return { state: Math.abs(difference) <= 100 ? 'sesuai' : difference < 0 ? 'kurang' : 'lebih', percent: input / budget * 100, difference };
}

function aggregate(baseline, snapshots) {
  baseline = normalizeYear(baseline);
  const valid = snapshots.filter(s => s.year === baseline.year && baseline.ppks.some(p => p.id === s.ppk));
  const owners = new Map();
  for (const s of valid) for (const p of s.packages.filter(p => p.status === '3')) {
    const key = p.type + ':' + p.id;
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key).add(s.ppk);
  }
  const conflicts = [...owners].filter(([, ids]) => ids.size > 1).map(([key, ids]) => ({ key, owners: [...ids] }));
  const conflictKeys = new Set(conflicts.map(c => c.key));
  const ppks = baseline.ppks.map(ppk => {
    const s = valid.find(s => s.ppk === ppk.id);
    const parents = baseline.activities.filter(activity => activity.ppk === ppk.id);
    const allTargets = baseline.targets.filter(t => t.ppk === ppk.id).map(t => ({ ...t, activityName: parents.find(activity => activity.id === t.activityId)?.name }));
    const enabled = t => t.active !== false && parents.some(activity => activity.id === t.activityId && activity.active !== false);
    const targets = allTargets.filter(enabled);
    const subs = targets.map(t => ({ ...t, input: s ? 0 : null, packages: [], verified: !!s }));
    const unmapped = [], warnings = [];
    let input = s ? 0 : null, excludedInput = 0, conflictInput = 0, verifiedInput = 0, outOfScopeInput = 0;
    const counted = new Set();
    for (const p of s?.packages || []) {
      if (p.status !== '3') continue;
      if (conflictKeys.has(p.type + ':' + p.id)) { conflictInput += p.amount; continue; }
      for (const f of p.funding) {
        const code = f.mak.match(MAK)?.[1];
        if (code === EXCLUDED) { excludedInput += f.amount; continue; }
        const inactive = allTargets.some(t => t.code === code && !enabled(t));
        if (!inactive) { input += f.amount; counted.add(p.type + ':' + p.id); }
        else outOfScopeInput += f.amount;
        const sub = subs.find(t => t.code === code);
        let problem = !code ? 'Format MAK tidak valid' : !sub ? 'Belum memiliki pasangan pagu PPK' : '';
        if (code && p.structuralSubCode && p.structuralSubCode !== code) problem = 'Subkegiatan struktur berbeda dengan MAK';
        if (sub && p.activityName && normalize(sub.activityName) !== normalize(p.activityName)) problem = 'Nama kegiatan pada daftar berbeda dengan kegiatan MAK';
        if (inactive) problem = 'Kegiatan/subkegiatan nonaktif — di luar cakupan aktif';
        const item = { id: p.id, type: p.type, name: p.name, amount: f.amount, mak: f.mak, problem,
          packageAmount: p.amount, year: s.year, location: p.location || '', funding: p.funding,
          url: `https://sirup.inaproc.id/sirup/${p.type}/${p.id}` };
        if (problem) { unmapped.push(item); continue; }
        const verified = !!p.structuralSubCode && p.structuralSubCode === code && s.scopeVerified === true;
        sub.verified &&= verified;
        sub.input += f.amount;
        sub.packages.push({ ...item, verified });
        if (verified) verifiedInput += f.amount;
      }
    }
    if (s && !s.scopeVerified) warnings.push('Cakupan daftar akun PPK belum dibuktikan terhadap identitas pemilik per paket.');
    const activities = parents.filter(activity => activity.active !== false).map(activity => ({ ...activity, subactivities: [], budget: 0, input: s ? 0 : null }));
    for (const sub of subs) {
      Object.assign(sub, metric(sub.budget, sub.input));
      if (sub.packages.length === 0) sub.verified = false;
      const activity = activities.find(a => a.id === sub.activityId);
      activity.subactivities.push(sub);
      activity.budget += sub.budget || 0;
      if (s) activity.input += sub.input;
    }
    for (const activity of activities) {
      Object.assign(activity, metric(activity.budget, activity.input));
      activity.missingBudget = activity.subactivities.some(t => t.budget === null);
      const excel = baseline.excelComparisons?.find(e => e.ppk === ppk.id && e.code === activity.code);
      activity.excelInput = excel?.input ?? null;
      activity.excelDifference = s && excel?.input != null ? activity.input - excel.input : null;
    }
    const budget = targets.reduce((sum, t) => sum + (t.budget || 0), 0);
    const allPackages = s?.packages || [];
    return { ...ppk, budget, input, ...metric(budget, input), activities, unmapped, warnings,
      unmappedInput: unmapped.filter(p => !p.problem.includes('nonaktif')).reduce((sum, p) => sum + p.amount, 0), verifiedInput, excludedInput, conflictInput, outOfScopeInput,
      missingBudget: targets.some(t => t.budget === null), count: s ? counted.size : null,
      syncedAt: s?.syncedAt || null, identity: s?.identity || null, source: s?.source || null,
      statuses: Object.fromEntries(['3', '12', '2', '31', '51'].map(status => [status, allPackages.filter(p => p.status === status).length])) };
  });
  const budget = ppks.reduce((s, p) => s + p.budget, 0);
  const input = ppks.reduce((s, p) => s + (p.input || 0), 0);
  const syncedBudget = ppks.filter(p => p.syncedAt).reduce((s, p) => s + p.budget, 0);
  return { year: baseline.year, source: baseline.source, ppks, conflicts, budget, input,
    ...metric(budget, ppks.some(p => p.syncedAt) ? input : null), syncedBudget,
    complete: ppks.every(p => p.syncedAt) && conflicts.length === 0,
    syncedCount: ppks.filter(p => p.syncedAt).length,
    count: ppks.reduce((s, p) => s + (p.count || 0), 0),
    unmappedInput: ppks.reduce((s, p) => s + p.unmappedInput, 0),
    verifiedInput: ppks.reduce((s, p) => s + p.verifiedInput, 0) };
}

module.exports = { aggregate, metric, verifyIdentity, validateList, validatePackage, SUB, MAK };
