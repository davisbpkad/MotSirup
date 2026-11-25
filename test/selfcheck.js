const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { aggregate, metric, verifyIdentity, validateList, validatePackage } = require('../server/calc');
const { commitSnapshot, readSnapshots } = require('../server/store');

const a = { id: 'siti', name: 'SITI SYAMSINUR, S.E., M.Acc., AAP', shortName: 'Siti Syamsinur', bidang: 'Sekretariat' };
const b = { id: 'agus', name: 'AGUS JONI LISTIAJDI, ST', shortName: 'Agus Joni Listiajdi', bidang: 'UPTD' };
const code = '5.02.01.1.06.0002';
const target = (ppk, budget = 10000) => ({ ppk, code, name: 'Peralatan Kantor', activityName: 'Administrasi Umum Perangkat Daerah', budget });
const pkg = (id = '123', amount = 10000, subCode = code) => ({ id, type: 'penyedia', name: 'ATK', amount, status: '3', funding: [{ mak: subCode + '.5.1.02.01.001.00024.', amount }], activityName: 'Administrasi Umum Perangkat Daerah' });
const snapshot = (ppk, packages) => ({ ppk, year: 2026, syncedAt: '2026-11-24T08:00:00.000Z', packages, identity: { role: 'PPK', name: ppk === 'siti' ? a.name : b.name }, scopeVerified: false });
const model = (targets, snapshots) => aggregate({ ppks: [a, b], targets, year: 2026 }, snapshots);

test('identity rejects PA, wrong PPK, wrong satker, and missing name', () => {
  const identity = { role: 'PPK', name: 'SITI SYAMSINUR, S.E., M.Acc., AAP', satker: 'Badan Pengelolaan Keuangan dan Aset Daerah', klpd: 'Provinsi Jawa Barat' };
  assert.doesNotThrow(() => verifyIdentity(identity, a));
  for (const change of [{ role: 'PAKPA' }, { name: b.name }, { satker: 'Satker lain' }, { name: '' }, { klpd: 'Provinsi lain' }]) {
    assert.throws(() => verifyIdentity({ ...identity, ...change }, a));
  }
});

test('Andri confirmed SIRUP name without degree is accepted only for Andri', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/pagu.json')));
  const andri = baseline.ppks.find(p => p.id === 'andri');
  const identity = { role: 'PPK', name: 'Andri Pramana', satker: 'Badan Pengelolaan Keuangan dan Aset Daerah', klpd: 'Provinsi Jawa Barat' };
  assert.doesNotThrow(() => verifyIdentity(identity, andri));
  assert.doesNotThrow(() => verifyIdentity({ ...identity, name: andri.name }, andri));
  assert.throws(() => verifyIdentity(identity, a));
  assert.throws(() => verifyIdentity({ ...identity, name: 'Andri' }, andri));
  assert.throws(() => verifyIdentity({ ...identity, role: 'PAKPA' }, andri));
  assert.throws(() => verifyIdentity({ ...identity, satker: 'Satker lain' }, andri));
});

test('all PPK identities accept full names without degrees and changed comma-separated degrees', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/pagu.json')));
  for (const ppk of baseline.ppks) {
    const name = ppk.name.split(',')[0].trim();
    const identity = { role: 'PPK', name, satker: 'Badan Pengelolaan Keuangan dan Aset Daerah', klpd: 'Provinsi Jawa Barat' };
    assert.doesNotThrow(() => verifyIdentity(identity, ppk));
    assert.doesNotThrow(() => verifyIdentity({ ...identity, name: name + ', S.E., M.M.' }, ppk));
    assert.throws(() => verifyIdentity({ ...identity, name: name.split(' ')[0] }, ppk));
    assert.throws(() => verifyIdentity({ ...identity, name: name + ' Lain' }, ppk));
    assert.throws(() => verifyIdentity({ ...identity, role: 'PAKPA' }, ppk));
    assert.throws(() => verifyIdentity({ ...identity, klpd: 'Provinsi lain' }, ppk));
  }
});

test('list requires complete, unique IDs and valid amounts', () => {
  const row = ['123', 'Kegiatan', 'Paket', '100', '', '', '', 'true', 'true', '3'];
  const list = { iTotalDisplayRecords: 1, aaData: [row] };
  assert.equal(validateList(list, 'penyedia').length, 1);
  assert.throws(() => validateList({ ...list, iTotalDisplayRecords: 2 }, 'penyedia'));
  assert.throws(() => validateList({ iTotalDisplayRecords: 2, aaData: [row, row] }, 'penyedia'));
  assert.throws(() => validateList({ ...list, aaData: [[...row.slice(0, 3), 'NaN', ...row.slice(4)]] }, 'penyedia'));
});

test('detail funding must reconcile and package ID/year must match', () => {
  assert.doesNotThrow(() => validatePackage({ ...pkg(), year: 2026 }, pkg(), 2026));
  assert.throws(() => validatePackage({ ...pkg(), year: 2025 }, pkg(), 2026));
  assert.throws(() => validatePackage({ ...pkg(), year: 2026, id: '999' }, pkg(), 2026));
  assert.throws(() => validatePackage({ ...pkg(), year: 2026, funding: [] }, pkg(), 2026));
});

test('money uses integer sen, tolerance is absolute, zero is not 0%', () => {
  assert.equal(metric(10000, 10001).state, 'sesuai');
  assert.equal(metric(10000, 10101).state, 'lebih');
  assert.equal(metric(10000, 9899).state, 'kurang');
  assert.equal(metric(0, 0).percent, null);
  assert.equal(metric(0, 100).state, 'tanpa-alokasi');
  assert.equal(metric(null, 0).state, 'target-kosong');
});

test('same MAK across PPK stays separate; unsynced PPK is not zero progress', () => {
  const r = model([target('siti'), target('agus', 20000)], [snapshot('siti', [pkg()])]);
  assert.equal(r.ppks[0].input, 10000);
  assert.equal(r.ppks[1].input, null);
  assert.equal(r.ppks[1].state, 'belum-sinkron');
  assert.equal(r.complete, false);
  assert.equal(r.ppks[0].activities[0].subactivities[0].input, 10000);
  assert.equal(r.ppks[0].verifiedInput, 0);
  assert.equal(r.ppks[0].activities[0].subactivities[0].verified, false);
});

test('popup data preserves package total, allocation, funding and location without changing totals', () => {
  const p = { ...pkg(), location: 'Bandung', funding: [
    { mak: code + '.5.1.02.01.001.00024.', amount: 6000 },
    { mak: 'SALAH', amount: 4000 }
  ] };
  const r = model([target('siti')], [snapshot('siti', [p])]);
  const mapped = r.ppks[0].activities[0].subactivities[0].packages[0];
  for (const item of [mapped, r.ppks[0].unmapped[0]]) {
    assert.equal(item.packageAmount, 10000);
    assert.equal(item.year, 2026);
    assert.equal(item.location, 'Bandung');
    assert.deepEqual(item.funding, p.funding);
  }
  assert.equal(mapped.amount, 6000);
  assert.equal(r.ppks[0].input, 10000);
});

test('inactive targets leave active totals but retain their packages for inspection', () => {
  const r = model([{ ...target('siti'), active: false }], [snapshot('siti', [pkg()])]);
  assert.equal(r.ppks[0].budget, 0);
  assert.equal(r.ppks[0].input, 0);
  assert.equal(r.ppks[0].outOfScopeInput, 10000);
  assert.equal(r.ppks[0].activities[0].subactivities.length, 0);
  assert.match(r.ppks[0].unmapped[0].problem, /nonaktif/);
  const parent = aggregate({year:2026,ppks:[a],targets:[target('siti')],inactiveActivities:['siti:5.02.01.1.06']},[snapshot('siti',[pkg()])]);
  assert.equal(parent.input,0);
  assert.equal(parent.budget,0);
  const active = model([target('siti')],[snapshot('siti',[pkg()])]);
  assert.equal(active.ppks[0].input,10000);
});

test('annual settings validate edits, prevent stale saves and isolate years without touching source', () => {
  const config = require('../server/config');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sirup-config-'));
  try {
    fs.mkdirSync(path.join(dir, 'data'));
    const baseline = { year: 2026, ppks: [a,b], targets: [target('siti'),target('agus')], source: 'fixture.xlsx' };
    const original = JSON.stringify(baseline);
    fs.writeFileSync(path.join(dir, 'data/pagu.json'), original);
    const initial = config.readConfig(dir);
    assert.equal(initial.activeYear, 2026);
    const next = structuredClone(initial);
    next.years['2026'].targets[0].budget = 25000;
    next.years['2026'].targets[0].active = false;
    config.saveConfig(dir, next);
    assert.equal(config.readConfig(dir).years['2026'].targets[0].budget, 25000);
    assert.throws(() => config.saveConfig(dir, next), /berubah/);
    const invalid = config.readConfig(dir);
    invalid.years['2026'].targets[0].budget = -1;
    assert.throws(() => config.saveConfig(dir, invalid));
    const newer = config.readConfig(dir);
    newer.years['2027'] = { ...structuredClone(baseline), year: 2027, targets: baseline.targets.map(t => ({ ...t, budget: null })) };
    newer.activeYear = 2027;
    config.saveConfig(dir, newer);
    assert.equal(config.readConfig(dir).years['2026'].targets[0].budget, 25000);
    assert.equal(config.readConfig(dir).years['2027'].targets[0].budget, null);
    assert.ok(fs.existsSync(path.join(dir, 'data/settings.json.bak')));
    assert.equal(fs.readFileSync(path.join(dir,'data/pagu.json'),'utf8'), original);
    commitSnapshot(path.join(dir,'data/snapshots'),snapshot('siti',[pkg()]));
    assert.equal(config.annualSnapshots(dir,baseline).length,1);
    assert.equal(config.annualSnapshots(dir,{...baseline,year:2027}).length,0);
    commitSnapshot(config.snapshotDirectory(dir,2027),{...snapshot('siti',[pkg('999')]),year:2027});
    assert.equal(config.annualSnapshots(dir,{...baseline,year:2027})[0].packages[0].id,'999');
    assert.equal(config.annualSnapshots(dir,baseline)[0].packages[0].id,'123');
    for (const mutate of [
      c=>{c.activeYear=1999;}, c=>{delete c.years['2026'];},
      c=>{c.years['2027'].targets.push(c.years['2027'].targets[0]);},
      c=>{c.years['2027'].targets[0].code='../escape';},
      c=>{c.years['2027'].targets[0].name='';},
      c=>{c.years['2027'].targets[0].active='no';},
      c=>{c.years['2027'].inactiveActivities=['wrong'];}
    ]) { const invalid=config.readConfig(dir); mutate(invalid);assert.throws(()=>config.saveConfig(dir,invalid)); }
  } finally { fs.rmSync(dir, { recursive:true }); }
});

test('public package detail uses GET-only fixed URLs, validates year and rejects upstream failures', async () => {
  const { publicDetail }=require('../server/browser');
  const original=global.fetch;
  let mode='ok';
  global.fetch=async(url,options)=>{
    assert.equal(url,'https://sirup.inaproc.id/sirup/penyedia/123');
    assert.equal(options.redirect,'error');
    assert.equal(options.method,undefined);
    const html='<table><tr><td>Kode RUP</td><td>123</td></tr><tr><td>Nama Paket</td><td>Asli</td></tr><tr><td>Tahun Anggaran</td><td>2026</td></tr><tr><td>Total Pagu</td><td>100</td></tr><tr><td>Uraian Pekerjaan</td><td>&lt;img onerror=x&gt;</td></tr></table><table><tr><th>No.</th><th>Sumber Dana</th><th>KLPD</th><th>MAK</th><th>Pagu</th></tr><tr><td>1.</td><td>APBD</td><td>Jabar</td><td>'+code+'.5.1.02.01.001.00024.</td><td>100</td></tr></table>';
    return new Response(mode==='large'?'x'.repeat(2000001):html,{status:mode==='error'?403:200});
  };
  try {
    const detail=await publicDetail('penyedia','123',2026);
    assert.equal(detail.fields.find(f=>f.label==='Uraian Pekerjaan').text,'<img onerror=x>');
    await assert.rejects(publicDetail('penyedia','123',2027),/TA/);
    await assert.rejects(publicDetail('other','123',2026),/tidak valid/);
    mode='error';await assert.rejects(publicDetail('penyedia','123',2026),/403/);
    mode='large';await assert.rejects(publicDetail('penyedia','123',2026),/ukuran/);
  } finally {global.fetch=original;}
});

test('parent activities migrate without writes and enforce CRUD references, codes and annual isolation', () => {
  const { readConfig, saveConfig } = require('../server/config');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sirup-parents-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    const baseline = { year:2026, ppks:[a,b], targets:[target('siti'),target('agus')], inactiveActivities:['siti:5.02.01.1.06'] };
    const original = JSON.stringify(baseline);
    fs.writeFileSync(path.join(root,'data/pagu.json'), original);
    let draft = readConfig(root), year = draft.years['2026'];
    assert.equal(year.activities.length,2);
    const parent = year.activities.find(p=>p.ppk==='siti');
    assert.equal(parent.active,false);
    assert.equal(year.targets[0].activityId,parent.id);
    assert.equal(Object.hasOwn(year.targets[0],'activityName'),false);
    assert.equal(fs.existsSync(path.join(root,'data/settings.json')),false);
    assert.equal(fs.readFileSync(path.join(root,'data/pagu.json'),'utf8'),original);
    // The same read-only migration also applies to existing saved legacy settings.
    const legacy = JSON.stringify({revision:3,activeYear:2026,years:{2026:baseline}});
    fs.writeFileSync(path.join(root,'data/settings.json'),legacy);
    draft=readConfig(root);year=draft.years['2026'];
    assert.equal(year.activities[0].active,false);
    assert.equal(fs.readFileSync(path.join(root,'data/settings.json'),'utf8'),legacy);
    year.activities[0].active=true;
    year.activities[0].name='Nama parent baru';
    year.activities.push({id:'parent-baru',ppk:'siti',code:'5.02.01.1.07',name:'Kegiatan kosong',active:true});
    draft=saveConfig(root,draft);year=draft.years['2026'];
    let view=aggregate(year,[snapshot('siti',[pkg()])]);
    assert.equal(view.ppks[0].activities[0].name,'Nama parent baru');
    assert.equal(view.ppks[0].activities[0].subactivities[0].activityName,'Nama parent baru');
    assert.match(view.ppks[0].unmapped[0].problem,/Nama kegiatan/);
    assert.ok(view.ppks[0].activities.some(p=>p.code==='5.02.01.1.07'&&p.subactivities.length===0));
    for (const mutate of [
      y=>{y.targets[0].activityId='missing';},
      y=>{y.targets[0].activityId=y.activities.find(p=>p.ppk==='agus').id;},
      y=>{y.targets[0].activityId='parent-baru';},
      y=>{y.activities=y.activities.filter(p=>p.id!==parent.id);},
      y=>{y.activities.push({...y.activities[0],id:'duplicate-code'});},
      y=>{y.activities[0].code='bad';},
      y=>{y.activities[0].name='';},
      y=>{y.activities[0].active='yes';}
    ]) {
      const invalid=structuredClone(draft);mutate(invalid.years['2026']);
      assert.throws(()=>saveConfig(root,invalid));
    }
    year.targets[0].activityId='parent-baru';year.targets[0].code='5.02.01.1.07.0002';
    year.activities=year.activities.filter(p=>p.id!==parent.id);
    draft=saveConfig(root,draft);year=draft.years['2026'];
    assert.equal(year.targets[0].activityId,'parent-baru');
    view=aggregate(year,[snapshot('siti',[pkg()])]);
    assert.equal(view.ppks[0].unmapped.length,1,'old MAK is never reassigned to the new code');
    year.targets.push({ppk:'siti',activityId:'parent-baru',code:'5.02.01.1.07.0003',name:'Anak baru',budget:20000,active:true});
    draft.years['2027']={...structuredClone(year),year:2027};
    draft=saveConfig(root,draft);year=draft.years['2026'];
    assert.equal(aggregate(year,[]).ppks[0].activities.find(p=>p.code==='5.02.01.1.07').budget,30000);
    year.activities.find(p=>p.id==='parent-baru').active=false;
    assert.equal(aggregate(year,[]).ppks[0].budget,0);
    year.targets=year.targets.filter(t=>t.ppk!=='siti');
    year.activities=year.activities.filter(p=>p.id!=='parent-baru');
    draft=saveConfig(root,draft);
    assert.equal(draft.years['2026'].targets.length,1);
    assert.equal(draft.years['2027'].targets.length,3);
    const raw=JSON.parse(fs.readFileSync(path.join(root,'data/settings.json'),'utf8'));
    assert.equal(Object.hasOwn(raw.years['2027'].targets[0],'activityName'),false);
    assert.equal(Object.hasOwn(raw.years['2027'],'inactiveActivities'),false);
  } finally { fs.rmSync(root,{recursive:true}); }
});

test('malformed/unknown MAK remains in PPK total and attention, not guessed', () => {
  const bad = pkg('124', 5000, '9.99.99.1.99.9999');
  const malformed = { ...pkg('125', 2000), funding: [{ mak: 'SALAH', amount: 2000 }] };
  const r = model([target('siti')], [snapshot('siti', [pkg(), bad, malformed])]);
  assert.equal(r.ppks[0].input, 17000);
  assert.equal(r.ppks[0].unmappedInput, 7000);
  assert.equal(r.ppks[0].activities[0].input, 10000);
  assert.equal(r.ppks[0].unmapped.length, 2);
});

test('independent subactivity mismatch does not enter target subtotal', () => {
  const p = { ...pkg(), structuralSubCode: '5.02.01.1.06.0003' };
  const r = model([target('siti')], [snapshot('siti', [p])]);
  assert.equal(r.ppks[0].input, 10000);
  assert.equal(r.ppks[0].activities[0].input, 0);
  assert.equal(r.ppks[0].unmappedInput, 10000);
});

test('list activity contradicting MAK is quarantined', () => {
  const r = model([target('siti')], [snapshot('siti', [{ ...pkg(), activityName: 'Pengadaan Peralatan dan Mesin' }])]);
  assert.equal(r.ppks[0].input, 10000);
  assert.equal(r.ppks[0].activities[0].input, 0);
  assert.equal(r.ppks[0].unmappedInput, 10000);
});

test('draft/cancelled excluded, split funding allocated once, ASN excluded', () => {
  const p = { ...pkg(), funding: [{ mak: code + '.5.1.02.01.001.00024', amount: 6000 }, { mak: '5.02.01.1.02.0001.5.1.01.01.001.00001', amount: 4000 }] };
  const r = model([target('siti')], [snapshot('siti', [p, { ...pkg('124'), status: '51' }, { ...pkg('125'), status: '12' }])]);
  assert.equal(r.ppks[0].input, 6000);
  assert.equal(r.ppks[0].excludedInput, 4000);
  assert.equal(r.ppks[0].count, 1);
});

test('cross-account duplicate is quarantined, never counted twice', () => {
  const r = model([target('siti'), target('agus')], [snapshot('siti', [pkg()]), snapshot('agus', [pkg()])]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.input, 0);
  assert.equal(r.ppks[0].conflictInput, 10000);
  assert.equal(r.complete, false);
});

test('snapshot commit is atomic and does not touch other PPK; bad data keeps old file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sirup-test-'));
  try {
    commitSnapshot(dir, snapshot('siti', [pkg()]));
    commitSnapshot(dir, snapshot('agus', [pkg('456')]));
    const before = fs.readFileSync(path.join(dir, 'siti.json'), 'utf8');
    assert.throws(() => commitSnapshot(dir, { ...snapshot('siti', [pkg()]), complete: false }));
    assert.equal(fs.readFileSync(path.join(dir, 'siti.json'), 'utf8'), before);
    assert.ok(fs.existsSync(path.join(dir, 'agus.json')));
    assert.equal(readSnapshots(dir, [a, b, { id: 'missing' }]).length, 2);
    assert.throws(() => commitSnapshot(dir, snapshot('../escape', [])));
  } finally { fs.rmSync(dir, { recursive: true }); }
});


test('Siti historical audit regression: 62 active packages = Rp7.211.169.026', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'siti-audit.json')));
  const r = aggregate(fixture.baseline, [fixture.snapshot]);
  assert.equal(r.ppks[0].count, 62);
  assert.equal(r.ppks[0].input, 721116902600);
  assert.equal(r.ppks[0].budget, 721116902623);
  assert.equal(r.ppks[0].state, 'sesuai');
  assert.equal(r.ppks[0].unmappedInput, 0);
});

test('browser collector parses both funding layouts without executing target scripts; failed sync preserves cache', async () => {
  const { chromium } = require('playwright');
  const collector = require('../server/browser');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sirup-collector-'));
  const launch = chromium.launchPersistentContext;
  let badIdentity = false, shortList = false, failDetail = false, revision = false, listCalls = 0;
  const row = ['123', 'Administrasi Umum Perangkat Daerah', 'ATK', '100', '', '', '', 'true', 'true', '3'];
  const identityHtml = () => `<div id="modalPengguna">Nama Lengkap : ${a.name} K/L/PD : Provinsi Jawa Barat Satker : Badan Pengelolaan Keuangan dan Aset Daerah Golongan : IV Role User : ${badIdentity ? 'PAKPA' : 'PPK'} Email : x</div>`;
  const detail = type => `<script>window.targetScriptExecuted=true</script><table><tr><td>Kode RUP</td><td>123</td></tr><tr><td>Nama Paket</td><td>Paket asli</td></tr><tr><td>Uraian Pekerjaan</td><td>Uraian asli dari SIRUP</td></tr><tr><td>Spesifikasi Pekerjaan</td><td>Spesifikasi asli</td></tr><tr><td>Metode Pemilihan</td><td>Pengadaan Langsung</td></tr><tr><td>Jadwal Pelaksanaan Kontrak</td><td><table><tr><th>Mulai</th><th>Akhir</th></tr><tr><td>November 2026</td><td>Desember 2026</td></tr></table></td></tr><tr><td>Tahun Anggaran</td><td>2026</td></tr><tr><td>Total Pagu</td><td>100</td></tr></table><table><tr><th>No.</th><th>Sumber Dana</th>${type==='penyedia' ? '<th>T.A.</th>' : ''}<th>KLPD</th><th>MAK</th><th>Pagu</th></tr><tr><td>1.</td><td>APBD</td>${type==='penyedia' ? '<td>2026</td>' : ''}<td>Jawa Barat</td><td>${code}.5.1.02.01.001.00024.</td><td>100</td></tr></table>`;
  context.request.get = async url => {
    let body;
    if (url.includes('/rup/penyedia')) body = identityHtml();
    else if (url.includes('/datatablectr/')) {
      listCalls++;
      const rows = url.includes('dataruppenyedia') ? [[...row]] : [];
      if (revision && listCalls > 2 && rows.length) rows[0][3] = '101';
      body = JSON.stringify({ iTotalDisplayRecords: shortList ? 99 : rows.length, aaData: rows });
    } else {
      if (failDetail) throw Error('Simulated detail failure');
      body = detail(url.includes('/swakelola/') ? 'swakelola' : 'penyedia');
    }
    return { ok: () => true, text: async () => body, json: async () => JSON.parse(body) };
  };
  chromium.launchPersistentContext = async () => context;
  async function run() {
    collector.startSync(dir, { year: 2026 }, a);
    const deadline = Date.now() + 15000;
    while (collector.jobs.get(a.id).running) {
      assert.ok(Date.now() < deadline, 'sync terminates');
      await new Promise(r => setTimeout(r, 20));
    }
    return collector.jobs.get(a.id);
  }
  try {
    assert.equal((await collector.getIdentity(context, a)).role, 'PPK');
    for (const type of ['penyedia', 'swakelola']) {
      const p = await collector.readDocument(context, 'https://sirup.inaproc.id/sirup/' + type + '/123', 'detail');
      assert.equal(p.funding.length, 1);
      assert.equal(p.funding[0].amount, 10000);
      assert.equal(p.id, '123');
      assert.equal(p.name, 'Paket asli');
      assert.equal(p.fields.find(f => f.label === 'Uraian Pekerjaan').text, 'Uraian asli dari SIRUP');
      assert.deepEqual(p.fields.find(f => f.label === 'Jadwal Pelaksanaan Kontrak').table, [['Mulai','Akhir'],['November 2026','Desember 2026']]);
    }
    assert.equal((await run()).error, null);
    const file = path.join(dir, 'data/snapshots/2026/siti.json');
    const before = fs.readFileSync(file, 'utf8');
    for (const mode of ['badIdentity', 'shortList', 'failDetail', 'revision']) {
      badIdentity = mode === 'badIdentity'; shortList = mode === 'shortList'; failDetail = mode === 'failDetail'; revision = mode === 'revision'; listCalls = 0;
      assert.ok((await run()).error, mode + ' rejects sync');
      assert.equal(fs.readFileSync(file, 'utf8'), before, mode + ' preserves cache');
    }
    const page = await context.newPage();
    assert.equal(await page.evaluate(() => window.targetScriptExecuted), undefined);
    await page.close();
  } finally {
    chromium.launchPersistentContext = launch;
    await collector.closeAll();
    await browser.close();
    fs.rmSync(dir, { recursive: true });
  }
});

test('Vue drill-down, search, identity error, mobile and reduced motion work against fixture data', async () => {
  const http = require('node:http');
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '..');
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'siti-audit.json')));
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'data/pagu.json')));
  const view = { ...aggregate(baseline, [fixture.snapshot]), token: 'test-token', jobs: {} };
  const firstPackage = view.ppks[0].activities.flatMap(a => a.subactivities).flatMap(s => s.packages)[0];
  let detailFailure = false;
  view.ppks[0].unmapped.push({ ...firstPackage, type: 'swakelola', name: '<img src=x onerror="window.popupInjected=true">', mak: 'SALAH', problem: 'Format MAK tidak valid' });
  const assets = { '/': 'public/index.html', '/app.js': 'public/app.js', '/style.css': 'public/style.css', '/vendor/vue.js': 'node_modules/vue/dist/vue.global.prod.js', '/vendor/chart.js': 'node_modules/chart.js/dist/chart.umd.js' };
  const server = http.createServer((req, res) => {
    if (req.url === '/api/data') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(view)); }
    if (req.url === '/api/detail') { res.setHeader('Content-Type','application/json'); if (detailFailure) { res.statusCode=400;return res.end(JSON.stringify({error:'SIRUP tidak tersedia'})); } return res.end(JSON.stringify({ id:'123', name:'Paket asli', fields:[{label:'Uraian Pekerjaan',text:'Uraian asli SIRUP <img src=x onerror="window.popupInjected=true">',table:null}], fetchedAt:'2026-11-24T12:00:00Z' })); }
    if (req.method === 'POST') { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Nama akun tidak cocok dengan PPK yang dipilih.' })); }
    const file = assets[req.url];
    if(req.url.split('?')[0]==='/favicon.png'){res.setHeader('Content-Type','image/png');return fs.createReadStream(path.join(root,'favicon.png')).pipe(res);}
    if(req.url==='/logo.png'){res.setHeader('Content-Type','image/png');return fs.createReadStream(path.join(root,'logo.png')).pipe(res);}
    if (!file) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    fs.createReadStream(path.join(root, file)).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForSelector('.ppk-card');
    assert.equal(await page.locator('.ppk-card').count(), 6);
    assert.equal(await page.locator('canvas').count(), 2);
    const checkProgressAlignment=async()=>{
      const cells=await page.locator('.tree-row .row-progress').evaluateAll(nodes=>nodes.map(cell=>{
        const donut=cell.querySelector('svg').getBoundingClientRect(),box=cell.getBoundingClientRect();
        const label=cell.querySelector('.progress-label, .badge').getBoundingClientRect();
        return {right:donut.right,offset:box.right-donut.right,gap:donut.left-label.right,family:getComputedStyle(cell.parentElement.children[1]).fontFamily};
      }));
      assert.ok(cells.length>1);
      for(const cell of cells){
        assert.ok(Math.abs(cell.offset)<1,'donut stays at fixed right edge of progress column');
        assert.ok(Math.abs(cell.right-cells[0].right)<1,'donuts align across parent and child rows');
        assert.ok(Math.abs(cell.gap-8)<1,'donut sits 8px to right of percentage label');
        assert.equal(cell.family,'Inter, "Segoe UI", system-ui, sans-serif');
      }
    };
    await checkProgressAlignment();
    for(const selector of ['body','h2','button','input','select','.metric strong','.donut-center strong','.ppk-progress strong','code']) {
      assert.match(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).fontFamily),/^Inter, "Segoe UI", system-ui, sans-serif$/);
    }
    assert.equal(await page.evaluate(()=>Chart.defaults.font.family),await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily));
    assert.equal(await page.locator('.brand img').evaluate(el=>getComputedStyle(el).width),'80px');
    assert.match(await page.locator('.brand').innerText(),/MonitorSIRUP/);
    assert.match(await page.locator('.brand').innerText(),/BPKAD PROVINSI JAWA BARAT/);
    assert.equal(await page.locator('.charts + .coverage').count(),1,'coverage follows both monitoring charts');
    assert.equal(await page.locator('.coverage + .ppk-section').count(),1,'coverage precedes PPK cards');
    assert.equal(await page.locator('.welcome').count(),0);
    assert.equal(await page.locator('.topbar #sync-ppk').count(),1);
    assert.equal(await page.locator('.topbar').getByRole('button',{name:'Hubungkan SIRUP',exact:true}).count(),1);
    assert.equal(await page.locator('footer').innerText(),'Monitor SIRUP · BPKAD Jawa Barat');
    assert.equal(await page.locator('footer').evaluate(el=>getComputedStyle(el).textAlign),'center');
    assert.equal(await page.locator('.status-legend [data-status]').count(),7);
    assert.doesNotMatch(await page.locator('.donut-panel').innerText(),/Lainnya/);
    assert.equal(await page.locator('#activity-chart').count(),0);
    assert.doesNotMatch(await page.locator('.topbar').innerText(),/Lokal|hanya baca/);
    const gear=page.locator('.topbar').getByRole('button',{name:'Pengaturan pagu dan TA',exact:true});
    assert.equal(await gear.innerText(),'');
    assert.equal(await gear.getAttribute('title'),'Pengaturan pagu dan TA');
    await gear.focus();
    assert.equal(await gear.evaluate(el=>getComputedStyle(el,'::after').content),'"Pengaturan pagu dan TA"');
    const donutCases=await page.evaluate(()=>[0,50,139.31,null].map(value=>{
      const node=document.createElement('div');document.body.append(node);
      const app=Vue.createApp(ProgressDonut,{value,state:value>100?'lebih':'kurang'});app.mount(node);
      const result={fill:node.querySelector('.donut-value').getAttribute('stroke-dasharray'),label:node.querySelector('svg').getAttribute('aria-label')};
      app.unmount();node.remove();return result;
    }));
    assert.deepEqual(donutCases.map(d=>d.fill),['0 100','50 100','100 100','0 100']);
    assert.equal(donutCases[2].label,'Progres 139,31%');
    assert.equal(donutCases[3].label,'Progres belum tersedia');
    const donut=page.locator('.activity-row .progress-donut').first();
    assert.equal(await donut.getAttribute('aria-label'),'Progres 100,00%');
    assert.equal(await donut.locator('.donut-value').getAttribute('stroke-dasharray'),'100 100');
    assert.match(await page.locator('.ppk-card').first().innerText(), /7\.211\.169\.026/);
    await page.locator('.ppk-card').first().click();
    assert.equal(await page.locator('.activity-row').count(), 7);
    await page.locator('.activity-row').filter({ hasText: '5.02.01.1.06' }).click();
    await page.locator('.sub-row').filter({ hasText: '5.02.01.1.06.0002' }).click();
    assert.equal(await page.locator('.sub-row .progress-donut').count(),await page.locator('.sub-row').count());
    await checkProgressAlignment();
    assert.equal(await page.locator('.package-row').count(), 10);
    const trigger = page.locator('.package-row button').first();
    const dialog = page.getByRole('dialog', { name: 'Detail paket SIRUP' });
    await trigger.click({ timeout: 2000 });
    await dialog.waitFor();
    assert.doesNotMatch(await dialog.innerText(), /Ringkasan dashboard · snapshot sinkron|Pagu total paket|Alokasi pada baris ini|Kegiatan & pemetaan/);
    await page.waitForFunction(() => document.querySelector('#package-detail').textContent.includes('Uraian asli SIRUP'));
    assert.match(await dialog.innerText(), /<img src=x/);
    assert.equal(await dialog.getByRole('link', { name: 'Buka di SIRUP' }).getAttribute('target'), '_blank');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await dialog.locator('h2').click();
    assert.equal(await dialog.evaluate(el => el.open), true, 'inside click keeps dialog open');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'focus stays in dialog');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#package-detail').open);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'focus returns to package');
    await trigger.click();
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#package-detail').open);
    detailFailure = true;
    await trigger.click();
    await page.waitForFunction(()=>document.querySelector('.live-detail').textContent.includes('SIRUP tidak tersedia'));
    assert.equal(await dialog.locator('.source-field').count(),0,'failed request does not retain previous live detail');
    assert.doesNotMatch(await dialog.innerText(),/Ringkasan sinkron di bawah|snapshot sinkron/);
    detailFailure = false;
    await dialog.getByRole('button',{name:'Coba lagi',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.live-detail').textContent.includes('Uraian asli SIRUP'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#package-detail').open);
    await page.locator('.attention button').click();
    await dialog.waitFor();
    assert.equal(await dialog.locator('img').count(), 0, 'target text is never rendered as HTML');
    assert.equal(await page.evaluate(() => window.popupInjected), undefined);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#package-detail').open);
    await page.getByRole('searchbox').fill('69124273');
    assert.equal(await page.locator('.activity-row').count(), 1);
    await page.getByRole('searchbox').fill('tidak-ada-xyz');
    assert.equal(await page.locator('.activity-row').count(), 0);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('button', { name: 'Sinkronisasi', exact: true }).click();
    await page.waitForSelector('.toast-box.error');
    assert.match(await page.locator('.toast-box').innerText(), /Nama akun tidak cocok/);
    assert.equal(await page.locator('.toast-box').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no page overflow at ' + width);
      await checkProgressAlignment();
      if(width===1440) {
        const row=await page.locator('.topbar').evaluate(el=>[...el.querySelectorAll('#sync-ppk,button,.year')].map(n=>{const r=n.getBoundingClientRect();return r.y+r.height/2}));
        assert.ok(Math.max(...row)-Math.min(...row)<2,'desktop controls share one row');
      }
      await trigger.click();
      await dialog.waitFor();
      await dialog.evaluate(el => el.removeAttribute('closedby'));
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'no dialog overflow');
      assert.equal(await dialog.evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'reduced motion disables transitions');
      await page.mouse.click(3, 3);
      await page.waitForFunction(() => !document.querySelector('#package-detail').open);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const syncButton=page.getByRole('button',{name:'Sinkronisasi',exact:true});
    assert.match(await syncButton.evaluate(el=>getComputedStyle(el).transitionProperty),/scale/);
    await page.locator('.toast-box button').click();
    assert.equal(await page.locator('.toast-leave-active').count(),1,'toast animates on dismissal');
    await trigger.click();
    await dialog.waitFor();
    assert.match(await dialog.evaluate(el => getComputedStyle(el).transitionDuration), /0\.28s/);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#package-detail')).transform === 'matrix(1, 0, 0, 1, 0, 0)');
    const box = await dialog.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 90);
    await page.mouse.down();
    await page.mouse.move(3, 3);
    await page.mouse.up();
    assert.equal(await dialog.evaluate(el => el.open), true, 'dragging from inside does not close dialog');
    await page.mouse.click(3, 3);
    await page.waitForFunction(() => !document.querySelector('#package-detail').open);
    assert.ok(await page.locator('#package-detail').evaluate(el=>el.getAnimations().length>0),'dialog animates on close');
    const states=['sesuai','kurang','lebih','target-kosong','belum-sinkron','tanpa-alokasi','nihil'];
    view.ppks=view.ppks.slice(0,1);
    view.ppks[0].activities=[{...view.ppks[0].activities[0],subactivities:states.map(state=>({state,budget:state==='target-kosong'?null:100,input:0,packages:[]}))}];
    await page.reload();await page.waitForSelector('.status-legend');
    assert.equal(await page.locator('.donut-center strong').innerText(),'7');
    for(const state of states) assert.equal(await page.locator(`[data-status="${state}"] b`).innerText(),'1');
    assert.match(await page.locator('.status-insight').innerText(),/2.*selisih nominal/);
    assert.match(await page.locator('.status-insight').innerText(),/1.*pagu.*1.*sinkron/i);
    await page.getByRole('searchbox').fill('tidak-ada-xyz');
    assert.equal(await page.locator('.donut-center strong').innerText(),'7','status follows PPK, not table search');
    view.ppks[0].activities=[];
    await page.reload();await page.waitForSelector('.status-insight');
    assert.match(await page.locator('.status-insight').innerText(),/Belum ada subkegiatan aktif/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
});

test('SPSE credentials stay private, select only the requested PPK, and autofill without submitting', async () => {
  const { readCredential, autofillSpse } = require('../server/login');
  const { chromium } = require('playwright');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sirup-login-'));
  const file=path.join(root,'credential.md');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    assert.equal(readCredential(root,'siti'),null);
    const write=data=>fs.writeFileSync(file,'# Login\n```json\n'+JSON.stringify(data)+'\n```\n',{mode:0o600});
    write({siti:{username:'fixture-user',password:'fixture-password'},agus:{username:'other',password:'other-secret'}});
    assert.equal(readCredential(root,'siti').username,'fixture-user');
    assert.equal(readCredential(root,'unknown'),null);
    const page=await browser.newPage();let submissions=0;
    await page.route('**/*',route=>{
      if(route.request().method()!=='GET')submissions++;
      return route.fulfill({contentType:'text/html',body:'<form id="formLogin" action="/jabarprov/login" method="post"><input name="txtUserId"><input name="txtPassword" type="password"><button>Login</button></form>'});
    });
    await page.goto('https://spse.inaproc.id/jabarprov/login');
    assert.equal(await autofillSpse(page,root,'siti'),true);
    assert.equal(await page.locator('[name=txtUserId]').inputValue(),'fixture-user');
    assert.equal(await page.locator('[type=password]').inputValue(),'fixture-password');
    assert.equal(submissions,0);
    await page.locator('[type=password]').evaluate(el=>el.remove());
    await page.locator('[name=txtUserId]').fill('');
    assert.equal(await autofillSpse(page,root,'siti'),true);
    assert.equal(await page.locator('[name=txtUserId]').inputValue(),'fixture-user');
    await page.goto('https://example.org/jabarprov/login');
    assert.equal(await autofillSpse(page,root,'siti'),false);
    assert.equal(await page.locator('[type=password]').inputValue(),'');
    await page.goto('https://spse.inaproc.id/jabarprov/paket');
    assert.equal(await autofillSpse(page,root,'siti'),false);
    assert.equal(await page.locator('[type=password]').inputValue(),'');
    const originalPersistent=chromium.launchPersistentContext;
    const context=await browser.newContext();
    await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/login')?'<form action="/jabarprov/login"><input name="txtUserId"><input type="password"></form>':'<h1>SPSE</h1>'}));
    chromium.launchPersistentContext=async()=>context;
    try {
      const result=await require('../server/browser').connect(root,a);
      const loginPage=context.pages()[0];
      assert.equal(loginPage.url(),'https://spse.inaproc.id/jabarprov');
      assert.doesNotMatch(result.message,/fixture-user|fixture-password/);
      await loginPage.goto('https://spse.inaproc.id/jabarprov/login');
      await loginPage.waitForFunction(()=>document.querySelector('[name=txtUserId]').value==='fixture-user');
      assert.equal(await loginPage.locator('[type=password]').inputValue(),'fixture-password');
    } finally {chromium.launchPersistentContext=originalPersistent;await context.close();}
    await page.goto('https://spse.inaproc.id/jabarprov/login');
    await page.locator('form').evaluate(el=>el.action='https://example.org/steal');
    assert.equal(await autofillSpse(page,root,'siti'),false);
    assert.equal(await page.locator('[type=password]').inputValue(),'');
    write({siti:{username:'',password:''}});assert.equal(readCredential(root,'siti'),null);
    fs.chmodSync(file,0o644);assert.throws(()=>readCredential(root,'siti'),/0600/);fs.chmodSync(file,0o600);
    fs.writeFileSync(file,'```json\n{broken-secret\n```');
    assert.throws(()=>readCredential(root,'siti'),error=>!error.message.includes('broken-secret'));
  } finally {await browser.close();fs.rmSync(root,{recursive:true});}
});

test('table PNG exports only the hierarchy and preserves selected expansion and filters', async () => {
  const { chromium } = require('playwright');
  const { exportPng } = require('../server/export');
  const view = model([target('siti'),target('agus')],[snapshot('siti',[pkg()])]);
  const activityKey='siti:5.02.01.1.06', subKey=activityKey+code;
  const originalLaunch=chromium.launch;
  const captures=[];
  chromium.launch=async function(options) {
    const browser=await originalLaunch.call(this,options);
    const originalNewPage=browser.newPage.bind(browser);
    browser.newPage=async options=>{
      const page=await originalNewPage(options), originalLocator=page.locator.bind(page);
      page.locator=(selector,...args)=>{
        const locator=originalLocator(selector,...args), screenshot=locator.screenshot.bind(locator);
        locator.screenshot=async options=>{
          captures.push({selector,text:await locator.innerText(),activities:await locator.locator('.activity-row').count(),subs:await locator.locator('.sub-row').count(),packages:await locator.locator('.package-row').count(),charts:await locator.locator('canvas').count(),donuts:await locator.locator('.progress-donut').count(),caption:await locator.locator('.export-caption').count()});
          return screenshot(options);
        };
        return locator;
      };
      return page;
    };
    return browser;
  };
  try {
    for (const [opened,subs,packages] of [[[],0,0],[[activityKey],1,0],[[activityKey,subKey],1,1],[[subKey],0,0]]) {
      const png=await exportPng(path.resolve(__dirname,'..'),view,{section:'rekap',ppk:'siti',query:'Peralatan',opened});
      assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      const capture=captures.at(-1);
      assert.equal(capture.selector,'.details-section .table-scroll');
      assert.equal(capture.activities,1);assert.equal(capture.subs,subs);assert.equal(capture.packages,packages);
      assert.equal(capture.charts,0);assert.equal(capture.caption,0);
      assert.equal(capture.donuts,1+subs);
      assert.match(capture.text,/Kegiatan \/ subkegiatan \/ paket/);
      assert.doesNotMatch(capture.text,/TELUSURI REKAP|Ekspor PNG|BPKAD Jawa Barat/);
    }
    await exportPng(path.resolve(__dirname,'..'),view,{section:'rekap',ppk:'siti',query:'tidak-ada',opened:[activityKey,subKey]});
    assert.equal(captures.at(-1).activities,0);
    for (const opened of ['bad',[42],['x'.repeat(201)],Array(4001).fill(activityKey)]) {
      await assert.rejects(exportPng(path.resolve(__dirname,'..'),view,{section:'rekap',opened}),/tidak valid/);
    }
  } finally { chromium.launch=originalLaunch; }
});

test('settings UI persists annual targets and exports both PNG sections on an isolated server', async () => {
  const { spawn } = require('node:child_process');
  const { chromium } = require('playwright');
  const http = require('node:http');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sirup-api-'));
  fs.mkdirSync(path.join(root,'data'));
  fs.writeFileSync(path.join(root,'data/pagu.json'),JSON.stringify({ year:2026,ppks:[a,b],targets:[target('siti'),target('agus')],source:'fixture.xlsx' }));
  const probe = http.createServer();
  await new Promise(r => probe.listen(0,'127.0.0.1',r));
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  const child = spawn(process.execPath,['server/index.js'],{ cwd:path.resolve(__dirname,'..'),env:{...process.env,DASHBOARD_TEST_ROOT:root,DASHBOARD_TEST_PORT:String(port)},stdio:['ignore','pipe','pipe'] });
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    await new Promise((resolve,reject) => { child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code))); });
    const origin = 'http://127.0.0.1:'+port;
    const favicon=await fetch(origin+'/favicon.png');
    assert.equal(favicon.status,200);
    assert.match(favicon.headers.get('content-type'),/^image\/png/);
    assert.deepEqual(Buffer.from(await favicon.arrayBuffer()),fs.readFileSync(path.resolve(__dirname,'../favicon.png')));
    const data = await (await fetch(origin+'/api/data')).json();
    for (const route of ['/api/settings','/api/export','/api/detail']) assert.equal((await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    const page = await browser.newPage({acceptDownloads:true,reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);
    assert.equal(await page.locator('link[rel=icon]').getAttribute('href'),'/favicon.png?v=09301b7f');
    assert.equal(await page.locator('.brand img').getAttribute('src'),'/logo.png');
    assert.equal(await page.locator('.brand img').evaluate(el=>el.complete&&el.naturalWidth>0),true);
    const cornerAlpha=await page.locator('.brand img').evaluate(img=>{
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      return [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);
    });
    assert.deepEqual(cornerAlpha,[0,0,0,0],'favicon corners remain transparent');
    const whiteBackground=await page.locator('.brand img').evaluate(img=>{
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let white=0,colored=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)continue;colored++;if(Math.min(pixels[i],pixels[i+1],pixels[i+2])>220)white++;}
      return {white,colored};
    });
    assert.equal(whiteBackground.white,0,'header logo has no white tile');assert.ok(whiteBackground.colored>0);
    await page.getByRole('button',{name:'Pengaturan pagu dan TA'}).click({timeout:2000});
    const settings = page.getByRole('dialog',{name:'Konfigurasi TA & pagu'});
    await settings.waitFor();
    assert.equal(await settings.locator('.settings-target-head').getByRole('button',{name:'Hapus subkegiatan',exact:true}).count(),1);
    assert.equal(await settings.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert.match(await settings.evaluate(el=>getComputedStyle(el).transitionDuration),/0\.28s/);
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const name of ['Tambah kegiatan','Tambah subkegiatan','Hapus kegiatan','Hapus subkegiatan']) {
      const button=settings.getByRole('button',{name,exact:true}).first();
      assert.equal(await button.innerText(),'');
      assert.equal(await button.getAttribute('title'),name);
      assert.equal(await button.locator('svg').count(),1);
    }
    for (const width of [375,768,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await settings.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'settings fits '+width);
      assert.equal(await settings.locator('.settings-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'settings form fits '+width);
    }
    await settings.getByRole('button',{name:'Tambah kegiatan',exact:true}).click({timeout:2000});
    const newParent=settings.locator('.settings-activity').last();
    await newParent.getByLabel('Kode kegiatan',{exact:true}).fill('5.02.01.1.07');
    await newParent.getByLabel('Nama kegiatan',{exact:true}).fill('Parent baru');
    await newParent.getByRole('button',{name:'Tambah subkegiatan',exact:true}).click();
    const newSub=newParent.locator('.settings-target');
    await newSub.getByLabel('Kode subkegiatan',{exact:true}).fill('5.02.01.1.07.0003');
    await newSub.getByLabel('Nama subkegiatan',{exact:true}).fill('Anak baru');
    assert.equal(await newSub.getByLabel('Kegiatan induk').locator('option:checked').innerText(),'5.02.01.1.07 · Parent baru');
    await newParent.getByRole('button',{name:'Hapus kegiatan',exact:true}).click();
    assert.match(await settings.locator('[role=alert]').innerText(),/masih memiliki subkegiatan/);
    const firstParent=settings.locator('.settings-activity').first();
    await firstParent.getByLabel('Nama kegiatan',{exact:true}).fill('Parent diperbarui');
    const firstParentId=await newSub.getByLabel('Kegiatan induk').locator('option').first().getAttribute('value');
    await newSub.getByLabel('Kegiatan induk').selectOption(firstParentId);
    assert.equal(await newParent.locator('.settings-target').count(),0);
    const movedSub=firstParent.locator('.settings-target').last();
    assert.equal(await movedSub.getByLabel('Kode subkegiatan',{exact:true}).inputValue(),'5.02.01.1.06.0003');
    await firstParent.getByLabel('Kode kegiatan',{exact:true}).fill('5.02.01.1.08');
    await firstParent.getByLabel('Kode kegiatan',{exact:true}).press('Tab');
    assert.equal(await movedSub.getByLabel('Kode subkegiatan',{exact:true}).inputValue(),'5.02.01.1.08.0003');
    await firstParent.getByLabel('Kode kegiatan',{exact:true}).fill('5.02.01.1.06');
    await firstParent.getByLabel('Kode kegiatan',{exact:true}).press('Tab');
    await newParent.getByRole('button',{name:'Hapus kegiatan',exact:true}).click();
    const confirmation=page.getByRole('dialog',{name:'Konfirmasi hapus'});
    await confirmation.getByRole('button',{name:'Hapus',exact:true}).click();
    assert.equal(await settings.locator('.settings-activity').count(),1);
    await movedSub.getByRole('button',{name:'Hapus subkegiatan',exact:true}).click();
    await confirmation.getByRole('button',{name:'Batal',exact:true}).click();
    assert.equal(await firstParent.locator('.settings-target').count(),2);
    await movedSub.getByRole('button',{name:'Hapus subkegiatan',exact:true}).click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert.match(await confirmation.evaluate(el=>getComputedStyle(el).transitionDuration),/0\.28s/);
    assert.match(await confirmation.innerText(),/Paket dan snapshot tidak dihapus/);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.keyboard.press('Escape');
    assert.equal(await firstParent.locator('.settings-target').count(),2);
    await movedSub.getByRole('button',{name:'Hapus subkegiatan',exact:true}).click();
    await confirmation.getByRole('button',{name:'Hapus',exact:true}).click();
    assert.equal(await firstParent.locator('.settings-target').count(),1);
    await settings.locator('.setting-budget').first().fill('250.25');
    await settings.locator('.setting-active').first().uncheck();
    await settings.getByRole('button',{name:'Simpan konfigurasi'}).click();
    await page.waitForFunction(()=>!document.querySelector('#settings-dialog').open);
    let saved=await(await fetch(origin+'/api/settings')).json();
    assert.equal(saved.years['2026'].targets[0].budget,25025);
    assert.equal(saved.years['2026'].targets[0].active,false);
    assert.equal(saved.years['2026'].activities[0].name,'Parent diperbarui');
    assert.equal((await(await fetch(origin+'/api/data')).json()).ppks[0].budget,0);
    await page.getByRole('button',{name:'Pengaturan pagu dan TA'}).click();
    await settings.getByLabel('TA baru').fill('2027');
    await settings.getByRole('button',{name:'Buat TA baru'}).click();
    assert.equal(await settings.locator('.setting-budget').first().inputValue(),'');
    await settings.getByRole('button',{name:'Simpan konfigurasi'}).click();
    await page.waitForFunction(()=>!document.querySelector('#settings-dialog').open);
    assert.equal((await(await fetch(origin+'/api/data')).json()).year,2027);
    await page.reload();await page.waitForSelector('.ppk-card');
    await page.locator('.activity-row').first().click();
    const exportBodies=[];
    page.on('request',request=>{if(request.url().endsWith('/api/export'))exportBodies.push(request.postDataJSON());});
    for (const name of ['Ekspor PNG progres PPK','Ekspor PNG tabel kegiatan / subkegiatan / paket']) {
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name,exact:true}).click();
      const download=await downloadPromise;
      const file=await download.path();const bytes=fs.readFileSync(file);
      assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert.ok(bytes.readUInt32BE(16)>500);assert.ok(bytes.readUInt32BE(20)>100);
      assert.match(download.suggestedFilename(),/2027/);
    }
    assert.deepEqual(exportBodies[1].opened,['siti:5.02.01.1.06']);
    assert.equal(await page.locator('.activity-row').first().getAttribute('aria-expanded'),'true','export does not change UI expansion');
    const headers={Origin:origin,'X-Dashboard-Token':data.token,'Content-Type':'application/json'};
    assert.equal((await fetch(origin+'/api/detail',{method:'POST',headers,body:JSON.stringify({id:'123',type:'penyedia',year:2027,ppk:'siti'})})).status,400);
    assert.equal((await fetch(origin+'/api/export',{method:'POST',headers,body:JSON.stringify({year:2026,revision:0,section:'ppk'})})).status,400);
    assert.equal((await fetch(origin+'/api/export',{method:'POST',headers,body:JSON.stringify({year:2027,revision:2,section:'invalid'})})).status,400);
    assert.equal((await fetch(origin+'/api/settings',{method:'POST',headers,body:JSON.stringify({...saved,revision:0})})).status,400);
    assert.equal((await fetch(origin+'/api/settings',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status,400);
    assert.equal((await fetch(origin+'/api/sync/siti',{method:'POST',headers,body:JSON.stringify({year:2026})})).status,400);
    assert.equal((await fetch(origin+'/data/settings.json')).status,404);
    assert.equal((await fetch(origin+'/data/settings.json.bak')).status,404);
    assert.equal((await fetch(origin+'/credential.md')).status,404);
    assert.deepEqual(errors,[]);
    saved=await(await fetch(origin+'/api/settings')).json();
    assert.equal(saved.years['2026'].targets[0].budget,25025);
  } finally {
    await browser.close();
    const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped;
    fs.rmSync(root,{recursive:true});
  }
});
