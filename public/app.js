const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch } = Vue;
const IconButton = {
  props: ['icon','label'],
  template: `<button class="icon-button" :aria-label="label" :title="label"><svg aria-hidden="true" viewBox="0 0 24 24"><template v-if="icon==='trash'"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></template><template v-else-if="icon==='gear'"><path d="m9 3-.7 2.2-2 .9-2.1-.5-2 3.4 1.5 1.7v2.6L2.2 15l2 3.4 2.1-.5 2 .9L9 21h4l.7-2.2 2-.9 2.1.5 2-3.4-1.5-1.7v-2.6L19.8 9l-2-3.4-2.1.5-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></template><path v-else d="M12 5v14M5 12h14"/></svg></button>`
};
const ProgressDonut = {
  props: ['value','state'],
  computed: {
    fill() { return Number.isFinite(this.value) ? Math.min(100,Math.max(0,this.value)) : 0; },
    description() { return Number.isFinite(this.value) ? 'Progres ' + this.value.toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%' : 'Progres belum tersedia'; }
  },
  template: `<svg class="progress-donut" viewBox="0 0 36 36" role="img" :aria-label="description" :data-state="state"><title>{{ description }}</title><circle class="donut-track" cx="18" cy="18" r="14"/><circle class="donut-value" cx="18" cy="18" r="14" pathLength="100" :stroke-dasharray="fill+' 100'" transform="rotate(-90 18 18)"/></svg>`
};
createApp({
  components: { IconButton, ProgressDonut },
  setup() {
    const data = ref(null), selectedPpk = ref('siti'), filterPpk = ref(''), query = ref('');
    const loadError = ref(''), message = ref(null), connecting = ref(false), opened = ref(new Set());
    const packageDialog = ref(null), packageDetail = ref(null);
    const detailLoading = ref(false), liveDetail = ref(null), detailError = ref('');
    const settingsDialog = ref(null), settings = ref(null), settingsError = ref(''), savingSettings = ref(false), settingsPpk = ref('siti'), newYear = ref('');
    const exporting = ref(false);
    const deleteDialog = ref(null), pendingDeletion = ref(null);
    let detailRequest = 0;
    let pressedOutside = false;
    const charts = new Map();
    let timer, toastTimer;
    const legend = [
      { key: 'sesuai', label: 'Sesuai pagu', description: 'Selisih maksimal Rp1', color: '#159464' },
      { key: 'kurang', label: 'Input di bawah pagu', description: 'Cek paket yang belum diumumkan', color: '#d05544' },
      { key: 'lebih', label: 'Input melebihi pagu', description: 'Periksa nominal dan pemetaan', color: '#cb8b22' },
      { key: 'target-kosong', label: 'Pagu belum diisi', description: 'Belum dapat dibandingkan', color: '#b38b45' },
      { key: 'belum-sinkron', label: 'Belum sinkron', description: 'Input belum diketahui, bukan nol', color: '#8a9bb1' },
      { key: 'tanpa-alokasi', label: 'Input tanpa alokasi', description: 'Ada input, pagu Rp0', color: '#963f60' },
      { key: 'nihil', label: 'Pagu dan input Rp0', description: 'Tidak dinilai sebagai 100%', color: '#c8d4cd' }
    ];
    const labels = { sesuai: 'Sesuai nominal', kurang: 'Kurang', lebih: 'Lebih', nihil: 'Tanpa alokasi', 'tanpa-alokasi': 'Input tanpa alokasi', 'target-kosong': 'Pagu belum tersedia', 'belum-sinkron': 'Belum sinkron' };
    const rupiah = value => value === null || value === undefined ? '—' : 'Rp' + (value / 100).toLocaleString('id-ID', { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 });
    const signed = value => value === null || value === undefined ? '—' : (value > 0 ? '+' : value < 0 ? '−' : '') + rupiah(Math.abs(value));
    const percent = value => value === null || value === undefined ? '—' : value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    const date = value => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';
    const clamp = n => Math.min(100, Math.max(0, n || 0));
    const initials = name => name.split(' ').slice(0, 2).map(n => n[0]).join('');
    const chosenPpk = computed(() => data.value?.ppks.find(p => p.id === filterPpk.value));
    const visiblePpks = computed(() => chosenPpk.value ? [chosenPpk.value] : data.value?.ppks || []);
    const currentJob = computed(() => Object.values(data.value?.jobs || {}).find(j => j.running));
    const busy = computed(() => !!currentJob.value);
    const missingTargets = computed(() => data.value?.ppks.flatMap(p => p.activities.flatMap(a => a.subactivities)).filter(s => s.budget === null).length || 0);
    const activities = computed(() => {
      const q = query.value.trim().toLocaleLowerCase('id-ID');
      return visiblePpks.value.flatMap(ppk => ppk.activities.map(activity => ({ ppk, activity, key: ppk.id + ':' + activity.code })))
        .filter(e => !q || JSON.stringify([e.ppk.shortName, e.activity]).toLocaleLowerCase('id-ID').includes(q));
    });
    const statusCounts = computed(() => {
      const counts = Object.fromEntries(legend.map(s => [s.key,0]));
      for (const p of visiblePpks.value) for (const a of p.activities) for (const s of a.subactivities) counts[s.state]++;
      return counts;
    });
    const statusTotal = computed(() => Object.values(statusCounts.value).reduce((sum,n) => sum+n,0));
    const statusInsight = computed(() => {
      if (!statusTotal.value) return 'Belum ada subkegiatan aktif pada PPK yang dipilih.';
      const c = statusCounts.value;
      return `${c.kurang+c.lebih} subkegiatan memiliki selisih nominal di luar toleransi Rp1; ${c.sesuai} sesuai pagu. ${c['target-kosong']} perlu diisi pagu; ${c['belum-sinkron']} perlu sinkron. ${c['tanpa-alokasi']} memiliki input tanpa alokasi. Status nominal bukan hasil audit MAK atau realisasi belanja.`;
    });
    const attention = computed(() => {
      const notes = [];
      for (const p of visiblePpks.value) {
        if (!p.syncedAt) continue;
        for (const warning of p.warnings) notes.push({ title: p.shortName + ' · validasi cakupan', text: warning, kind: 'warning' });
        if (p.input > p.verifiedInput) notes.push({ title: p.shortName + ' · pemetaan belum diaudit independen', text: rupiah(p.input - p.verifiedInput) + ' belum memiliki verifikasi silang struktur subkegiatan dan kepemilikan paket.', kind: 'warning' });
        for (const a of p.activities) for (const s of a.subactivities) {
          if (['kurang', 'lebih', 'tanpa-alokasi', 'target-kosong'].includes(s.state)) notes.push({ title: p.bidang + ' · ' + s.name, text: s.code + ' · ' + labels[s.state] + ' · Selisih ' + signed(s.difference), kind: s.state === 'lebih' ? 'warning' : 'error' });
        }
        for (const item of p.unmapped) notes.push({ title: p.shortName + ' · ID ' + item.id, text: item.problem + ' · ' + item.mak + ' · ' + rupiah(item.amount), package: item, ppk: p, kind: 'error' });
        if (p.conflictInput) notes.push({ title: p.shortName + ' · konflik pemilik paket', text: rupiah(p.conflictInput) + ' dikarantina dan tidak dihitung sampai konflik diselesaikan.', kind: 'error' });
      }
      for (const c of data.value?.conflicts || []) notes.push({ title: 'ID paket muncul pada lebih dari satu PPK', text: c.key + ' · ' + c.owners.join(', '), kind: 'error' });
      return notes;
    });
    const isOpen = key => opened.value.has(key);
    const draftYear = computed(() => settings.value?.years[settings.value.activeYear]);
    const settingsActivities = computed(() => (draftYear.value?.activities || []).filter(activity => activity.ppk === settingsPpk.value));
    const activityTargets = activity => draftYear.value.targets.filter(target => target.activityId === activity.id && target.ppk === activity.ppk);
    function parseBudget(value) {
      if (value === '') return null;
      if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw Error('Pagu harus angka rupiah nonnegatif, maksimal dua desimal.');
      const [whole, decimal=''] = String(value).split('.');
      const result = Number(whole) * 100 + Number(decimal.padEnd(2,'0'));
      if (!Number.isSafeInteger(result)) throw Error('Pagu terlalu besar.');
      return result;
    }
    const budgetText = value => value == null ? '' : (value / 100).toFixed(value % 100 ? 2 : 0);
    function editBudget(target, event) {
      try { target.budget = parseBudget(event.target.value); settingsError.value = ''; event.target.setCustomValidity(''); }
      catch (error) { settingsError.value = error.message; event.target.setCustomValidity(error.message); }
    }
    function activityBudget(activity) { return activity.active === false ? 0 : activityTargets(activity).filter(t => t.active !== false).reduce((sum,t)=>sum+(t.budget||0),0); }
    function changeActivityCode(activity, code) {
      activity.code = code.trim();
      for (const target of activityTargets(activity)) target.code = activity.code + '.' + target.code.split('.').at(-1);
    }
    function moveTarget(target, activityId) {
      const parent = settingsActivities.value.find(activity => activity.id === activityId);
      if (!parent) return;
      target.activityId = parent.id;
      target.code = parent.code + '.' + target.code.split('.').at(-1);
    }
    async function postJson(route, body) {
      return fetch('/api/' + route, { method:'POST', headers:{'Content-Type':'application/json','X-Dashboard-Token':data.value.token}, body:JSON.stringify(body) });
    }
    async function openSettings() {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw Error('Konfigurasi tidak dapat dimuat.');
        settings.value = await response.json();
        settingsError.value = ''; newYear.value = '';
        if (!draftYear.value.ppks.some(p=>p.id===settingsPpk.value)) settingsPpk.value = draftYear.value.ppks[0].id;
        await nextTick(); settingsDialog.value.showModal();
      } catch (error) { notify(error.message,'error'); }
    }
    function createYear() {
      const year = Number(newYear.value);
      if (!Number.isInteger(year) || year < 2000 || year > 2100 || settings.value.years[year]) { settingsError.value = 'TA harus 2000–2100 dan belum tersedia.'; return; }
      const copied = JSON.parse(JSON.stringify(draftYear.value));
      copied.year = year; copied.excelComparisons = [];
      copied.activities = copied.activities.map(activity => ({...activity,active:true}));
      copied.targets = copied.targets.map(t => ({...t,budget:null,active:true}));
      settings.value.years[year] = copied; settings.value.activeYear = year; settingsError.value = '';
    }
    function addActivity() {
      draftYear.value.activities.push({id:crypto.randomUUID(),ppk:settingsPpk.value,code:'',name:'',active:true});
      settingsError.value = '';
    }
    function addTarget(activity) {
      draftYear.value.targets.push({ppk:activity.ppk,activityId:activity.id,code:activity.code+'.',name:'',budget:null,active:true});
      settingsError.value = '';
    }
    async function deleteActivity(activity) {
      if (activityTargets(activity).length) { settingsError.value = 'Kegiatan masih memiliki subkegiatan. Pindahkan atau hapus anak terlebih dahulu.'; return; }
      pendingDeletion.value = { kind:'activity', item:activity };
      await nextTick(); deleteDialog.value.showModal();
    }
    async function deleteTarget(target) {
      pendingDeletion.value = { kind:'target', item:target };
      await nextTick(); deleteDialog.value.showModal();
    }
    function confirmDelete() {
      const { kind,item } = pendingDeletion.value;
      if (kind==='activity') draftYear.value.activities = draftYear.value.activities.filter(activity => activity !== item);
      else draftYear.value.targets = draftYear.value.targets.filter(target => target !== item);
      settingsError.value = '';
      deleteDialog.value.close();
    }
    async function saveSettings() {
      if (!settingsDialog.value.querySelector('form').reportValidity()) return;
      savingSettings.value = true; settingsError.value = '';
      try {
        const response = await postJson('settings',settings.value); const body = await response.json();
        if (!response.ok) throw Error(body.error || 'Gagal menyimpan konfigurasi.');
        settings.value = body; opened.value = new Set();
        await load(); settingsDialog.value.close(); notify('Konfigurasi TA dan pagu tersimpan. Workbook dan snapshot lama tidak diubah.');
      } catch (error) { settingsError.value = error.message; }
      finally { savingSettings.value = false; }
    }
    async function exportSection(section) {
      exporting.value = true;
      try {
        const response = await postJson('export',{section,ppk:filterPpk.value,query:section==='rekap'?query.value:'',opened:section==='rekap'?[...opened.value]:[],year:data.value.year,revision:data.value.settingsRevision});
        if (!response.ok) throw Error((await response.json()).error || 'Ekspor gagal.');
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a'); link.href = url; link.download = `sirup-${data.value.year}-${section}-${filterPpk.value || 'semua'}.png`;
        document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      } catch (error) { notify(error.message,'error'); }
      finally { exporting.value = false; }
    }
    async function showPackage(item, ppk) {
      packageDetail.value = { item, ppk };
      liveDetail.value = null; detailError.value = ''; detailLoading.value = true;
      const request = ++detailRequest;
      await nextTick();
      pressedOutside = false;
      packageDialog.value.showModal();
      packageDialog.value.querySelector('.package-detail-body').scrollTop = 0;
      try {
        const response = await postJson('detail',{id:item.id,type:item.type,ppk:ppk.id,year:data.value.year});
        const body = await response.json();
        if (!response.ok) throw Error(body.error || 'Detail asli SIRUP gagal dimuat.');
        if (request === detailRequest) liveDetail.value = body;
      } catch (error) { if (request === detailRequest) detailError.value = error.message; }
      finally { if (request === detailRequest) detailLoading.value = false; }
    }
    function closePackage() { packageDialog.value.close(); }
    function outsideDialog(event) {
      const box = packageDialog.value.getBoundingClientRect();
      return event.target === packageDialog.value && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
    }
    function dialogPointerDown(event) { pressedOutside = outsideDialog(event); }
    function dialogClick(event) { if (pressedOutside && outsideDialog(event)) closePackage(); }
    function toggle(key) { const next = new Set(opened.value); next.has(key) ? next.delete(key) : next.add(key); opened.value = next; }
    function notify(text, kind = 'info') { clearTimeout(toastTimer); message.value = { text, kind }; if (kind !== 'error') toastTimer = setTimeout(() => { message.value = null; }, 12000); }
    async function load() {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw Error('Dashboard tidak dapat membaca data lokal.');
        const body = await response.json();
        if (data.value && data.value.year !== body.year) {
          if (packageDialog.value?.open) packageDialog.value.close();
          detailRequest++;
        }
        data.value = body;
        loadError.value = '';
      } catch (error) { loadError.value = error.message; }
    }
    async function action(name) {
      const response = await postJson(name + '/' + selectedPpk.value, { year:data.value.year });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Permintaan gagal.');
      return body;
    }
    async function connect() {
      connecting.value = true;
      try { const result = await action('connect'); notify(result.message); } catch (error) { notify(error.message, 'error'); }
      finally { connecting.value = false; }
    }
    async function sync() {
      try { await action('sync'); await load(); poll(); } catch (error) { notify(error.message, 'error'); }
    }
    function poll() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await load();
        if (busy.value) return poll();
        const failed = Object.values(data.value?.jobs || {}).find(j => j.error);
        if (failed) notify(failed.error, 'error'); else notify('Sinkronisasi selesai. Rekap diperbarui dari sesi PPK.');
      }, 1400);
    }
    function draw(id, configuration) {
      charts.get(id)?.destroy();
      const canvas = document.getElementById(id);
      if (canvas) charts.set(id, new Chart(canvas, configuration));
    }
    async function renderCharts() {
      await nextTick();
      if (!data.value) return;
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const common = { responsive: true, maintainAspectRatio: false, animation: reduced ? false : { duration: 500 }, plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } } } } };
      const ps = data.value.ppks;
      draw('ppk-chart', { type: 'bar', data: { labels: ps.map(p => p.bidang), datasets: [
        { label: 'Target pagu aktif', data: ps.map(p => p.budget / 100000000), backgroundColor: '#d5e8dd', borderRadius: 4 },
        { label: 'Input terumumkan', data: ps.map(p => p.input === null ? null : p.input / 100000000), backgroundColor: '#08754c', borderRadius: 4 }
      ] }, options: { ...common, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => Number(v).toLocaleString('id-ID') }, grid: { color: '#edf2ef' } } } } });
      draw('status-chart', { type: 'doughnut', data: { labels: legend.map(s => s.label), datasets: [{ data: legend.map(s => statusCounts.value[s.key]), backgroundColor: legend.map(s => s.color), borderWidth: 3, borderColor: '#fff', hoverOffset: 3 }] }, options: { ...common, cutout: '78%', plugins: { legend: { display: false } } } });
    }
    watch([filterPpk, query], renderCharts);
    watch(() => [data.value?.year,data.value?.settingsRevision,data.value?.ppks.map(p => p.syncedAt).join('|')].join(':'), renderCharts);
    onMounted(async () => { await load(); await renderCharts(); if (busy.value) poll(); });
    onBeforeUnmount(() => { clearTimeout(timer); clearTimeout(toastTimer); for (const chart of charts.values()) chart.destroy(); });
    return { data, selectedPpk, filterPpk, query, loadError, message, connecting, currentJob, busy, chosenPpk, missingTargets, activities, attention, statusCounts, statusTotal, statusInsight, legend,
      deleteDialog,pendingDeletion,confirmDelete,
      packageDialog, packageDetail, showPackage, closePackage, dialogPointerDown, dialogClick,
      detailLoading,liveDetail,detailError,settingsDialog,settings,settingsError,savingSettings,settingsPpk,newYear,draftYear,settingsActivities,
      openSettings,createYear,addActivity,addTarget,deleteActivity,deleteTarget,activityTargets,changeActivityCode,moveTarget,saveSettings,editBudget,budgetText,activityBudget,exportSection,exporting,
      rupiah, signed, percent, date, clamp, initials, label: s => labels[s] || s, toggle, isOpen, load, connect, sync };
  }
}).mount('#app');
