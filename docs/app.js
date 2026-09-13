// ============================================================
// GANTI URL DI BAWAH INI dengan Web App URL Apps Script Anda
// ============================================================
const API_BASE = 'https://script.google.com/macros/s/AKfycbyTc2ZebcADtl7aR48puMf-xLnQ24VgJahSpoDbwn3dpbF1xICFBOK16rZPTkcUyQHG/exec';

let token = localStorage.getItem('sh_token') || null;
let user = JSON.parse(localStorage.getItem('sh_user') || 'null');
let currentJenis = 'masuk';
let posisiSaatIni = null;
let mediaStream = null;
let mediaStreamWajah = null;
let wajahDescriptorTersimpan = null;
const AMBANG_WAJAH = 0.6;
const MODEL_URL_WAJAH = 'https://justadudewhohacks.github.io/face-api.js/models';
let modelWajahPromise = null;
let lokasiKantor = null;
let kameraTerbukaBiometrik = false;
let chartDonutInstance = null;
let statistikTerakhir = null;
let pegawaiProfil = null;
let pendingPresensiPayload = null;
let notifInterval = null;

// ---------- tema (terang/gelap/otomatis) ----------
function terapkanTema(pref) {
  let efektif = pref;
  if (pref === 'auto') {
    efektif = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', efektif);
}
function ubahTema(pref) {
  localStorage.setItem('sh_theme', pref);
  terapkanTema(pref);
}
function initTema() {
  const pref = localStorage.getItem('sh_theme') || 'auto';
  const sel = document.getElementById('selectTema');
  if (sel) sel.value = pref;
  terapkanTema(pref);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if ((localStorage.getItem('sh_theme') || 'auto') === 'auto') terapkanTema('auto');
    });
  }
}
initTema();

// ---------- util ----------
function call(action, payload = {}) {
  if (!API_BASE || API_BASE.indexOf('PASTE_URL') === 0) {
    return Promise.reject(new Error('API_BASE belum diisi. Buka app.js dan ganti dengan URL Web App Apps Script Anda.'));
  }
  const body = Object.assign({ action, token }, payload);
  const t0 = performance.now();
  return fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  })
    .then(r => r.json())
    .then(data => {
      updatePingBadge(Math.round(performance.now() - t0));
      if (data && data.error) throw new Error(data.error);
      return data;
    })
    .catch(e => { updatePingBadge(null); throw e; });
}
function updatePingBadge(ms) {
  const pill = document.getElementById('pillServer');
  const txt = document.getElementById('pillServerText');
  if (!pill) return;
  if (ms == null) { pill.classList.remove('ok'); txt.textContent = 'Server: Offline'; return; }
  pill.classList.add('ok');
  txt.textContent = 'Server: Online ' + ms + 'ms';
}
function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
function tutupModal(id) { document.getElementById(id).classList.add('hidden'); }
function fmtTanggal(d) { return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtTanggalSingkat(str) { return new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }); }
function inisial(nama) { return (nama || '').split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''); }
function formatJarak(m) { if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km'; return Math.round(m) + ' m'; }
function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- auth ----------
function login() {
  const nip = document.getElementById('inNip').value.trim();
  const pass = document.getElementById('inPass').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  if (!nip || !pass) { errEl.textContent = 'NIP dan kata sandi wajib diisi.'; errEl.classList.remove('hidden'); return; }

  call('login', { nip, password: pass })
    .then(data => {
      token = data.token; user = data.pegawai;
      localStorage.setItem('sh_token', token);
      localStorage.setItem('sh_user', JSON.stringify(user));
      if (user.role === 'admin') { window.location.href = 'admin.html'; return; }
      masukKeApp();
    })
    .catch(e => { errEl.textContent = e.message; errEl.classList.remove('hidden'); });
}
function logout() {
  localStorage.removeItem('sh_token'); localStorage.removeItem('sh_user');
  token = null; user = null;
  if (notifInterval) clearInterval(notifInterval);
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('inPass').value = '';
}

function masukKeApp() {
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('headerNama').textContent = user.nama;
  document.getElementById('headerJabatan').textContent = user.jabatan || user.unit_kerja || '-';
  document.getElementById('headerAvatar').textContent = inisial(user.nama);

  jalankanJam();
  populateSelectBulan();
  muatModelWajah().catch(() => {});
  mulaiCekLokasi();
  muatStatistikBulanan();
  goTo('presensi');

  call('pegawaiMe').then(p => {
    pegawaiProfil = p;
    simpanDescriptorWajah(p.wajah_descriptor);
    document.getElementById('infoAvatar').textContent = inisial(p.nama);
    document.getElementById('infoNama').textContent = p.nama;
    document.getElementById('infoNip').textContent = 'NIP-' + p.nip;
    document.getElementById('infoJabatan').textContent = (p.jabatan || '-') + (p.unit_kerja ? ' • ' + p.unit_kerja : '');
    document.getElementById('infoJamMasuk').textContent = p.jam_masuk;
    document.getElementById('infoToleransi').textContent = '+' + p.toleransi_menit + ' Menit';
    document.getElementById('bannerShiftText').textContent =
      `Pengingat otomatis 15 menit sebelum jam masuk (${p.jam_masuk}), aktif selama tab ini terbuka di perangkat Anda.`;
    muatStatusHariIni();
    if ('Notification' in window && Notification.permission === 'granted') jadwalkanPengingatShift();
  }).catch(() => {});
}

// ---------- navigasi ----------
function goTo(tab) {
  document.querySelectorAll('.header-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'riwayat') muatRiwayat();
  if (tab === 'izin') muatIzin();
  if (tab === 'profil') muatProfil();
  if (tab === 'chat' && typeof masukChat === 'function') masukChat();
  if (tab === 'presensi') siapkanKameraCard(); else hentikanKamera();
}

function jalankanJam() {
  const tick = () => {
    const now = new Date();
    const jamEl = document.getElementById('jamBerjalan');
    if (jamEl) jamEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
    const tglEl = document.getElementById('tanggalHariIni');
    if (tglEl) tglEl.textContent = fmtTanggal(now);
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- status presensi hari ini & pilihan jenis ----------
function muatStatusHariIni() {
  call('absenHariIni').then(row => {
    const badge = document.getElementById('statusHariIni');
    if (!row || !row.jam_masuk) { currentJenis = 'masuk'; badge.textContent = 'Belum Presensi'; }
    else if (!row.jam_pulang) { currentJenis = 'pulang'; badge.textContent = row.jenis === 'dinas_luar' ? 'Dinas Luar Aktif' : 'Sudah Masuk'; }
    else { currentJenis = null; badge.textContent = 'Selesai Hari Ini'; }
    perbaruiPilihanJenisUI();
  }).catch(() => {});
}
function perbaruiPilihanJenisUI() {
  if (!currentJenis) {
    document.querySelectorAll('.jenis-btn').forEach(b => { b.classList.remove('active'); b.disabled = true; });
    document.getElementById('btnKirimPresensi').disabled = true;
    document.getElementById('btnKirimPresensiLabel').textContent = 'Presensi hari ini sudah lengkap';
    return;
  }
  document.querySelectorAll('.jenis-btn').forEach(b => b.disabled = false);
  document.getElementById('btnKirimPresensi').disabled = false;
  pilihJenisPresensi(currentJenis);
}
function pilihJenisPresensi(jenis) {
  currentJenis = jenis;
  document.querySelectorAll('.jenis-btn').forEach(b => b.classList.toggle('active', b.dataset.jenis === jenis));
  document.getElementById('btnKirimPresensiLabel').textContent =
    jenis === 'pulang' ? 'Kirim Presensi Pulang Sekarang' : jenis === 'dinas_luar' ? 'Kirim Presensi Dinas Luar Sekarang' : 'Kirim Presensi Masuk Sekarang';
  perbaruiTampilanRadius();
}

// ---------- kamera & kunci biometrik ----------
function siapkanKameraCard() {
  const lock = document.getElementById('camLock');
  const aktif = user && biometrikAktifUntuk(user.nip);
  if (aktif && !kameraTerbukaBiometrik) {
    lock.classList.remove('hidden');
    hentikanKamera();
    setCheck('chkBiometrik', false);
  } else {
    lock.classList.add('hidden');
    setCheck('chkBiometrik', true);
    bukaKameraUtama();
  }
}
async function verifikasiBiometrikLokal() {
  try {
    const credId = localStorage.getItem('sh_bio_cred_' + user.nip);
    if (!credId) throw new Error('Biometrik belum diaktifkan di HP ini. Lewati langkah ini atau aktifkan di menu Profil.');
    await navigator.credentials.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ id: b64urlToBuf(credId), type: 'public-key' }], userVerification: 'required', timeout: 60000 }
    });
    kameraTerbukaBiometrik = true;
    document.getElementById('camLock').classList.add('hidden');
    setCheck('chkBiometrik', true);
    bukaKameraUtama();
  } catch (e) { toast(e.message || 'Verifikasi biometrik gagal atau dibatalkan.', true); }
}
function bukaKameraUtama() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    .then(stream => { mediaStream = stream; document.getElementById('videoEl').srcObject = stream; })
    .catch(() => toast('Tidak dapat mengakses kamera. Izinkan akses kamera pada browser.', true));
}
function hentikanKamera() { if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; } }
function setCheck(id, ok, warnOnly) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('ok', 'warn');
  if (ok === true) el.classList.add(warnOnly ? 'warn' : 'ok');
  const dot = el.querySelector('.check-dot');
  dot.innerHTML = ok ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : '';
}

// ---------- lokasi & visualisasi radius ----------
function mulaiCekLokasi() {
  if (!navigator.geolocation) { toast('Perangkat tidak mendukung GPS.', true); return; }
  document.getElementById('radiusCaption').textContent = 'Mendeteksi lokasi…';
  navigator.geolocation.getCurrentPosition(async pos => {
    posisiSaatIni = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setCheck('chkGps', true);
    const lbl = document.getElementById('chkGpsLabel');
    if (lbl) lbl.textContent = 'GPS terdeteksi (±' + Math.round(pos.coords.accuracy) + 'm)';
    try {
      if (!lokasiKantor) lokasiKantor = await call('getLokasi');
      perbaruiTampilanRadius();
    } catch (e) { toast(e.message, true); }
  }, () => { toast('Gagal mengambil lokasi. Izinkan akses GPS pada browser.', true); setCheck('chkGps', false, true); }, { enableHighAccuracy: true, timeout: 12000 });
}
function perbaruiTampilanRadius() {
  const namaEl = document.getElementById('namaKantorText');
  if (!posisiSaatIni || !namaEl) return;
  const pillRadius = document.getElementById('pillRadius');
  const pillText = document.getElementById('pillRadiusText');
  const caption = document.getElementById('radiusCaption');
  const detailBox = document.getElementById('lokasiDetailBox');
  const warnBox = document.getElementById('warnLuarRadius');

  if (!lokasiKantor) { namaEl.textContent = 'Lokasi kantor belum diatur admin'; return; }
  namaEl.textContent = lokasiKantor.nama + ' (Maks ' + lokasiKantor.radius_meter + 'm)';

  const jarak = hitungJarak(posisiSaatIni.latitude, posisiSaatIni.longitude, lokasiKantor.latitude, lokasiKantor.longitude);
  const dalam = jarak <= lokasiKantor.radius_meter;

  pillRadius.classList.toggle('ok', dalam);
  pillRadius.classList.toggle('warn', !dalam);
  pillText.textContent = dalam ? 'Dalam Radius' : 'Luar Radius (' + formatJarak(jarak) + ')';

  posisikanDot(dalam ? Math.min(0.8, (jarak / lokasiKantor.radius_meter) * 0.4 + 0.1) : 0.92, 35, dalam);
  caption.textContent = dalam
    ? `Jarak Anda ${formatJarak(jarak)} dari titik kantor`
    : `Jarak Anda ${formatJarak(jarak)} — melebihi batas ${lokasiKantor.radius_meter}m`;

  detailBox.innerHTML = dalam ? '' : `
    <div class="warn-box" style="margin-top:0;">
      <b>Di Luar Radius Kantor</b><br>Jarak Anda ${formatJarak(jarak)} (melebihi batas radius ${lokasiKantor.radius_meter}m). Konfirmasi akan diminta saat presensi dikirim.
    </div>`;

  warnBox.classList.toggle('hidden', dalam || currentJenis === 'dinas_luar');
  setCheck('chkRadius', dalam, !dalam);
  const chkLbl = document.getElementById('chkRadiusLabel');
  if (chkLbl) chkLbl.textContent = dalam ? 'Dalam radius kantor' : 'Luar radius (' + formatJarak(jarak) + ')';
}
function posisikanDot(rasioJarak, sudutDerajat, ok) {
  const dot = document.getElementById('ringDot');
  if (!dot) return;
  const rad = sudutDerajat * Math.PI / 180;
  const x = 50 + Math.sin(rad) * rasioJarak * 50;
  const y = 50 - Math.cos(rad) * rasioJarak * 50;
  dot.style.left = x + '%'; dot.style.top = y + '%';
  dot.style.transform = 'translate(-50%,-50%)';
  dot.classList.toggle('ok', ok);
  dot.textContent = 'A';
}
function kalibrasiLokasiSaya() {
  toast('Titik lokasi kantor hanya dapat diubah oleh admin lewat panel admin (admin.html) demi menjaga keakuratan bersama.');
}

// ---------- alur pengiriman presensi ----------
async function mulaiAlurPresensi() {
  if (!currentJenis) { toast('Presensi hari ini sudah lengkap.', true); return; }
  if (!posisiSaatIni) { toast('Lokasi belum terdeteksi. Klik "Update GPS".', true); return; }
  const video = document.getElementById('videoEl');
  if (!video.videoWidth) { toast('Kamera belum aktif. Verifikasi biometrik dulu jika terkunci.', true); return; }

  const canvas = document.getElementById('canvasEl');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
  setCheck('chkFoto', true);

  const btn = document.getElementById('btnKirimPresensi');
  btn.disabled = true;

  let wajahCocok;
  if (wajahDescriptorTersimpan) {
    document.getElementById('overlayVerifikasiTeks').textContent = 'Memverifikasi wajah…';
    document.getElementById('overlayVerifikasi').classList.remove('hidden');
    try { wajahCocok = await verifikasiWajahDariCanvas(canvas); } catch (e) { wajahCocok = undefined; }
    document.getElementById('overlayVerifikasi').classList.add('hidden');
    if (wajahCocok === false) {
      const lanjut = confirm('Wajah pada foto tidak terverifikasi cocok dengan data terdaftar.\n\nOK untuk tetap lanjut (akan ditandai untuk ditinjau admin), Batal untuk mengambil ulang.');
      if (!lanjut) { btn.disabled = false; return; }
    }
  }

  const payload = {
    latitude: posisiSaatIni.latitude, longitude: posisiSaatIni.longitude, foto: fotoBase64,
    catatan: document.getElementById('inCatatan').value.trim(),
    jenis: currentJenis === 'dinas_luar' ? 'dinas_luar' : 'kantor'
  };
  if (wajahCocok !== undefined) payload.wajah_cocok = wajahCocok;

  kirimPresensi(payload, btn);
}
function kirimPresensi(payload, btn) {
  const action = currentJenis === 'pulang' ? 'absenPulang' : 'absenMasuk';
  call(action, payload).then(r => {
    tampilkanSukses(r);
    document.getElementById('inCatatan').value = '';
    muatStatusHariIni();
    muatStatistikBulanan();
  }).catch(e => {
    if (e.message === 'LUAR_RADIUS') {
      pendingPresensiPayload = payload;
      document.getElementById('teksKonfirmasiRadius').textContent =
        'Anda mencoba mengirim presensi dari luar radius kantor. Lanjutkan sebagai kehadiran luar radius, atau batalkan dan pilih "Dinas Luar" jika ini kunjungan tugas resmi.';
      document.getElementById('modalKonfirmasiRadius').classList.remove('hidden');
    } else {
      toast(e.message, true);
    }
  }).finally(() => { if (btn) btn.disabled = false; });
}
function konfirmasiTetapKirimLuarRadius() {
  tutupModal('modalKonfirmasiRadius');
  if (!pendingPresensiPayload) return;
  pendingPresensiPayload.paksa_luar_radius = true;
  const btn = document.getElementById('btnKirimPresensi');
  btn.disabled = true;
  kirimPresensi(pendingPresensiPayload, btn);
  pendingPresensiPayload = null;
}
function tampilkanSukses(r) {
  document.getElementById('successTitle').textContent =
    currentJenis === 'pulang' ? 'Presensi pulang berhasil' : currentJenis === 'dinas_luar' ? 'Presensi dinas luar berhasil' : 'Presensi masuk berhasil';
  document.getElementById('successCard').innerHTML = `
    <div class="info-row"><span class="k">Waktu</span><span class="v">${r.jam_masuk || r.jam_pulang || '-'}</span></div>
    ${r.status ? `<div class="info-row"><span class="k">Status</span><span class="v">${r.status}</span></div>` : ''}
    <div class="info-row"><span class="k">Jarak lokasi</span><span class="v">${r.jarak_meter != null ? formatJarak(r.jarak_meter) : '-'}</span></div>
  `;
  document.getElementById('modalSuccess').classList.remove('hidden');
}
function tutupModalSukses() { document.getElementById('modalSuccess').classList.add('hidden'); }

// ---------- statistik bulanan, grafik donat, PDF ----------
function populateSelectBulan() {
  const sel = document.getElementById('selectBulanStatistik');
  const now = new Date();
  let html = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    html += `<option value="${d.toISOString().slice(0, 7)}">${d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>`;
  }
  sel.innerHTML = html;
}
function muatStatistikBulanan(bulan) {
  bulan = bulan || document.getElementById('selectBulanStatistik').value || new Date().toISOString().slice(0, 7);
  call('statistikBulanan', { bulan }).then(s => {
    statistikTerakhir = s;
    document.getElementById('statJamKerja').textContent = s.total_jam_kerja;
    document.getElementById('statKetepatan').textContent = s.ketepatan_waktu_persen + '%';
    document.getElementById('statTingkatHadir').textContent = s.tingkat_hadir_persen + '%';
    document.getElementById('statHariVerif').textContent = s.hari_terverifikasi;
    document.getElementById('statTarget').textContent = s.target_jam_kerja;
    renderDonut(s.distribusi);
    renderBreakdown(s.distribusi);
  }).catch(e => toast(e.message, true));
}
function renderDonut(d) {
  const ctx = document.getElementById('chartDonut');
  const data = [d.tepat_waktu, d.terlambat, d.dinas_luar, d.tidak_hadir];
  const labels = ['Tepat Waktu', 'Terlambat', 'Dinas Luar', 'Tidak Hadir'];
  const colors = ['#22C55E', '#F59E0B', '#3B82F6', '#EF4444'];
  if (chartDonutInstance) chartDonutInstance.destroy();
  if (typeof Chart === 'undefined' || !ctx) return;
  chartDonutInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { cutout: '70%', plugins: { legend: { display: false } } }
  });
  const total = data.reduce((a, b) => a + b, 0) || 1;
  document.getElementById('legendDistribusi').innerHTML = labels.map((l, i) => `
    <div class="legend-item"><span class="l"><span class="legend-dot" style="background:${colors[i]}"></span>${l}</span><b>${data[i]} hari (${Math.round(data[i] / total * 100)}%)</b></div>
  `).join('');
}
function renderBreakdown(d) {
  const items = [
    { t: 'Tepat Waktu', v: d.tepat_waktu, sub: 'Hadir sesuai jadwal', color: 'success', icon: '✓' },
    { t: 'Terlambat', v: d.terlambat, sub: 'Presensi melewati batas', color: 'warn', icon: '⏱' },
    { t: 'Dinas Luar', v: d.dinas_luar, sub: 'Tugas operasional resmi', color: 'blue', icon: '📋' },
    { t: 'Tidak Hadir', v: d.tidak_hadir, sub: 'Belum ada catatan', color: 'danger', icon: '✕' }
  ];
  document.getElementById('breakdownGrid').innerHTML = items.map(it => `
    <div class="breakdown-item">
      <div class="top"><div class="ic" style="background:var(--${it.color}-bg); color:var(--${it.color});">${it.icon}</div><div class="val">${it.v} hari</div></div>
      <div class="sub">${it.t} — ${it.sub}</div>
    </div>`).join('');
}
function unduhPdfLaporan() {
  if (!statistikTerakhir) { toast('Statistik belum dimuat.', true); return; }
  if (typeof window.jspdf === 'undefined') { toast('Modul PDF belum siap, coba beberapa saat lagi.', true); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const s = statistikTerakhir;
  doc.setFontSize(16); doc.text('Laporan Presensi Bulanan', 14, 18);
  doc.setFontSize(11);
  doc.text(`Pegawai: ${user.nama} (${user.nip})`, 14, 28);
  doc.text(`Bulan: ${s.bulan}`, 14, 35);
  doc.text(`Total jam kerja: ${s.total_jam_kerja} jam (target ${s.target_jam_kerja} jam)`, 14, 45);
  doc.text(`Ketepatan waktu: ${s.ketepatan_waktu_persen}%`, 14, 52);
  doc.text(`Tingkat hadir: ${s.tingkat_hadir_persen}%`, 14, 59);
  doc.text(`Hari terverifikasi wajah: ${s.hari_terverifikasi}`, 14, 66);
  doc.text('Rincian kehadiran:', 14, 78);
  doc.text(`- Tepat waktu: ${s.distribusi.tepat_waktu} hari`, 18, 86);
  doc.text(`- Terlambat: ${s.distribusi.terlambat} hari`, 18, 93);
  doc.text(`- Dinas luar: ${s.distribusi.dinas_luar} hari`, 18, 100);
  doc.text(`- Tidak hadir: ${s.distribusi.tidak_hadir} hari`, 18, 107);
  doc.text(`- Izin/cuti disetujui: ${s.distribusi.izin} hari`, 18, 114);
  doc.save(`laporan-presensi-${user.nip}-${s.bulan}.pdf`);
}

// ---------- notifikasi pengingat shift (berjalan selama tab terbuka) ----------
function aktifkanNotifikasiPengingat() {
  if (!('Notification' in window)) { toast('Browser ini tidak mendukung notifikasi.', true); return; }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') { toast('Notifikasi pengingat shift diaktifkan di perangkat ini.'); jadwalkanPengingatShift(); }
    else { toast('Izin notifikasi ditolak oleh browser.', true); }
  });
}
function jadwalkanPengingatShift() {
  if (!pegawaiProfil || Notification.permission !== 'granted') return;
  if (notifInterval) clearInterval(notifInterval);
  notifInterval = setInterval(() => {
    const now = new Date();
    const [jj, jm] = pegawaiProfil.jam_masuk.split(':').map(Number);
    const target = new Date(); target.setHours(jj, jm - 15, 0, 0);
    const sudah = localStorage.getItem('sh_notif_terakhir') === now.toDateString();
    if (!sudah && Math.abs(now - target) < 30000) {
      new Notification('Pengingat shift SIAP-Hadir', { body: `Shift Anda dimulai pukul ${pegawaiProfil.jam_masuk}. Jangan lupa presensi masuk.` });
      localStorage.setItem('sh_notif_terakhir', now.toDateString());
    }
  }, 20000);
}
function ujiNotifikasi() {
  if (!('Notification' in window) || Notification.permission !== 'granted') { toast('Izinkan notifikasi terlebih dahulu.', true); return; }
  new Notification('Uji notifikasi SIAP-Hadir', { body: 'Contoh tampilan notifikasi pengingat shift.' });
}

// ---------- riwayat ----------
function muatRiwayat(bulan) {
  const now = new Date();
  bulan = bulan || now.toISOString().slice(0, 7);
  const bulanList = [];
  for (let i = 0; i < 3; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); bulanList.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('id-ID', { month: 'short' }) }); }
  document.getElementById('riwayatFilter').innerHTML = bulanList.map(b =>
    `<span class="filter-chip ${b.key === bulan ? 'active' : ''}" onclick="muatRiwayat('${b.key}')">${b.label}</span>`).join('');

  call('riwayatMe', { bulan }).then(rows => {
    const el = document.getElementById('riwayatList');
    if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada catatan pada bulan ini.</div>'; return; }
    el.innerHTML = rows.map(r => `
      <div class="list-item">
        <div><div class="day">${fmtTanggalSingkat(r.tanggal)}</div>
        <div class="time">${r.jam_masuk ? 'Masuk ' + r.jam_masuk : 'Tidak ada catatan'}${r.jam_pulang ? ' · Pulang ' + r.jam_pulang : ''}</div></div>
        <span class="badge ${r.jenis === 'dinas_luar' ? 'dinas_luar' : (r.status_masuk || 'alpha')}">${r.jenis === 'dinas_luar' ? 'Dinas Luar' : r.status_masuk === 'telat' ? 'Telat' : r.status_masuk === 'hadir' ? 'Hadir' : 'Alpha'}</span>
      </div>`).join('');
  }).catch(e => toast(e.message, true));
}

// ---------- izin ----------
function bukaFormIzin() {
  document.getElementById('fIzinJenis').value = 'izin';
  document.getElementById('fIzinMulai').value = '';
  document.getElementById('fIzinSelesai').value = '';
  document.getElementById('fIzinAlasan').value = '';
  document.getElementById('modalIzin').classList.remove('hidden');
}
function kirimIzin() {
  const jenis = document.getElementById('fIzinJenis').value;
  const tanggal_mulai = document.getElementById('fIzinMulai').value;
  const tanggal_selesai = document.getElementById('fIzinSelesai').value;
  const alasan = document.getElementById('fIzinAlasan').value;
  if (!tanggal_mulai || !tanggal_selesai) { toast('Lengkapi rentang tanggal.', true); return; }
  call('ajukanIzin', { jenis, tanggal_mulai, tanggal_selesai, alasan })
    .then(() => { tutupModal('modalIzin'); toast('Pengajuan izin terkirim.'); muatIzin(); })
    .catch(e => toast(e.message, true));
}
function muatIzin() {
  call('izinMe').then(rows => {
    const el = document.getElementById('izinList');
    if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada pengajuan izin.</div>'; return; }
    el.innerHTML = rows.map(r => `
      <div class="izin-item">
        <div class="izin-top">
          <div><div class="izin-jenis">${r.jenis.replace('_', ' ')}</div>
          <div class="izin-tgl">${fmtTanggalSingkat(r.tanggal_mulai)} – ${fmtTanggalSingkat(r.tanggal_selesai)}</div></div>
          <span class="badge ${r.status}">${r.status === 'menunggu' ? 'Menunggu' : r.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}</span>
        </div>
        <div class="izin-alasan">${r.alasan || '-'}</div>
      </div>`).join('');
  }).catch(e => toast(e.message, true));
}

// ---------- profil ----------
function muatProfil() {
  call('pegawaiMe').then(p => {
    document.getElementById('profilAvatar').textContent = inisial(p.nama);
    document.getElementById('profilNama').textContent = p.nama;
    document.getElementById('profilJab').textContent = (p.jabatan || '-') + (p.unit_kerja ? ' · ' + p.unit_kerja : '');
    document.getElementById('profilInfo').innerHTML = `
      <div class="info-row"><span class="k">NIP</span><span class="v">${p.nip}</span></div>
      <div class="info-row"><span class="k">Unit kerja</span><span class="v">${p.unit_kerja || '-'}</span></div>
      <div class="info-row"><span class="k">Jadwal kerja</span><span class="v">${p.jam_masuk} – ${p.jam_pulang}</span></div>
      <div class="info-row"><span class="k">No. HP</span><span class="v">${p.no_hp || '-'}</span></div>
      <div class="info-row"><span class="k">Status</span><span class="v" style="color:var(--success);">${p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></div>
    `;
    simpanDescriptorWajah(p.wajah_descriptor);
    perbaruiStatusWajah();
    perbaruiTombolBiometrikProfil();
    muatDaftarPerangkat();
  }).catch(e => toast(e.message, true));
}

// ---------- verifikasi wajah (face-api.js, berjalan di browser) ----------
function simpanDescriptorWajah(descriptorJson) {
  if (descriptorJson) { try { wajahDescriptorTersimpan = new Float32Array(JSON.parse(descriptorJson)); } catch (e) { wajahDescriptorTersimpan = null; } }
  else wajahDescriptorTersimpan = null;
}
function muatModelWajah() {
  if (modelWajahPromise) return modelWajahPromise;
  modelWajahPromise = (async () => {
    if (typeof faceapi === 'undefined') throw new Error('face-api.js belum termuat.');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL_WAJAH),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL_WAJAH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL_WAJAH)
    ]);
  })();
  return modelWajahPromise;
}
async function verifikasiWajahDariCanvas(canvas) {
  await muatModelWajah();
  const deteksi = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
  if (!deteksi) return false;
  const jarak = faceapi.euclideanDistance(deteksi.descriptor, wajahDescriptorTersimpan);
  return jarak < AMBANG_WAJAH;
}
function bukaModalWajah() {
  document.getElementById('modalWajah').classList.remove('hidden');
  document.getElementById('btnSimpanWajah').disabled = true;
  document.getElementById('faceWajahMsg').textContent = 'Menyiapkan kamera & model deteksi wajah…';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    .then(stream => { mediaStreamWajah = stream; document.getElementById('videoWajahEl').srcObject = stream; return muatModelWajah(); })
    .then(() => { document.getElementById('faceWajahMsg').textContent = 'Posisikan wajah di tengah, lalu tekan "Ambil & simpan"'; document.getElementById('btnSimpanWajah').disabled = false; })
    .catch(() => toast('Tidak dapat mengakses kamera atau memuat model deteksi wajah.', true));
}
function tutupModalWajah() {
  document.getElementById('modalWajah').classList.add('hidden');
  if (mediaStreamWajah) { mediaStreamWajah.getTracks().forEach(t => t.stop()); mediaStreamWajah = null; }
}
async function ambilDanSimpanWajah() {
  const video = document.getElementById('videoWajahEl');
  const canvas = document.getElementById('canvasWajahEl');
  const btn = document.getElementById('btnSimpanWajah');
  if (!video.videoWidth) { toast('Kamera belum siap.', true); return; }
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    const deteksi = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
    if (!deteksi) { toast('Wajah tidak terdeteksi. Coba lagi dengan pencahayaan lebih baik.', true); return; }
    const descriptor = Array.from(deteksi.descriptor);
    await call('daftarWajah', { descriptor });
    wajahDescriptorTersimpan = new Float32Array(descriptor);
    toast('Wajah berhasil didaftarkan untuk verifikasi absen.');
    tutupModalWajah();
    perbaruiStatusWajah();
  } catch (e) { toast(e.message || 'Gagal menyimpan data wajah.', true); }
  finally { btn.disabled = false; btn.textContent = 'Ambil & simpan'; }
}
function perbaruiStatusWajah() {
  const box = document.getElementById('faceStatusBox');
  const text = document.getElementById('faceStatusText');
  if (!box || !text) return;
  if (wajahDescriptorTersimpan) { box.classList.add('ok'); text.textContent = 'Wajah sudah terdaftar — verifikasi otomatis aktif saat absen.'; }
  else { box.classList.remove('ok'); text.textContent = 'Wajah belum didaftarkan — absen tetap bisa dilakukan tanpa verifikasi wajah.'; }
}

// ---------- login biometrik perangkat (WebAuthn + token perangkat) ----------
function dukunganBiometrik() { return !!(window.PublicKeyCredential && navigator.credentials); }
function bufToB64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlToBuf(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const bin = atob(str); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf.buffer; }
async function sha256Hex(text) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function biometrikAktifUntuk(nip) { return !!(localStorage.getItem('sh_bio_cred_' + nip) && localStorage.getItem('sh_bio_secret_' + nip)); }

async function aktifkanBiometrik() {
  if (!dukunganBiometrik()) { toast('Perangkat/browser ini tidak mendukung login biometrik.', true); return; }
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'SIAP-Hadir' },
        user: { id: new TextEncoder().encode(user.nip), name: user.nip, displayName: user.nama },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000, attestation: 'none'
      }
    });
    if (!cred) throw new Error('Pendaftaran biometrik dibatalkan.');
    const credId = bufToB64url(cred.rawId);
    const secretRaw = bufToB64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const secretHash = await sha256Hex(secretRaw);
    await call('daftarBiometrik', { credential_id: credId, device_token_hash: secretHash, label: (navigator.platform || 'HP') + ' · ' + new Date().toLocaleDateString('id-ID') });
    localStorage.setItem('sh_bio_cred_' + user.nip, credId);
    localStorage.setItem('sh_bio_secret_' + user.nip, secretRaw);
    localStorage.setItem('sh_bio_nip_terakhir', user.nip);
    toast('Login biometrik diaktifkan di HP ini.');
    perbaruiTombolBiometrikProfil(); muatDaftarPerangkat(); siapkanKameraCard();
  } catch (e) { toast(e.message || 'Gagal mengaktifkan biometrik.', true); }
}
function nonaktifkanBiometrikPerangkatIni() {
  localStorage.removeItem('sh_bio_cred_' + user.nip);
  localStorage.removeItem('sh_bio_secret_' + user.nip);
  toast('Login biometrik dinonaktifkan di HP ini.');
  perbaruiTombolBiometrikProfil(); siapkanKameraCard();
}
function toggleBiometrikPerangkatIni() { if (biometrikAktifUntuk(user.nip)) nonaktifkanBiometrikPerangkatIni(); else aktifkanBiometrik(); }
function perbaruiTombolBiometrikProfil() {
  const btn = document.getElementById('btnToggleBiometrik');
  if (!btn) return;
  if (!dukunganBiometrik()) { btn.textContent = 'Tidak didukung di perangkat ini'; btn.disabled = true; return; }
  btn.disabled = false;
  btn.textContent = biometrikAktifUntuk(user.nip) ? 'Nonaktifkan di HP ini' : 'Aktifkan di HP ini';
}
function muatDaftarPerangkat() {
  call('listPerangkatSaya').then(rows => {
    const el = document.getElementById('daftarPerangkat');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada perangkat terdaftar.</div>'; return; }
    el.innerHTML = rows.map(d => `
      <div class="device-item">
        <div><div class="lbl">${d.label || 'Perangkat'}</div><div class="sub">Terakhir dipakai: ${new Date(d.terakhir_dipakai).toLocaleString('id-ID')}</div></div>
        <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="hapusPerangkatById(${d.id})">Cabut</button>
      </div>`).join('');
  }).catch(() => {});
}
function hapusPerangkatById(id) { call('hapusPerangkat', { id }).then(() => { toast('Perangkat dicabut dari server.'); muatDaftarPerangkat(); }).catch(e => toast(e.message, true)); }

function cekTampilkanTombolBiometrikLogin() {
  const nipTerakhir = localStorage.getItem('sh_bio_nip_terakhir');
  const btn = document.getElementById('btnLoginBiometrik');
  if (!btn) return;
  if (dukunganBiometrik() && nipTerakhir && biometrikAktifUntuk(nipTerakhir)) {
    btn.classList.remove('hidden');
    document.getElementById('dividerOr').classList.remove('hidden');
  }
}
async function loginBiometrik() {
  const nip = localStorage.getItem('sh_bio_nip_terakhir');
  const credId = localStorage.getItem('sh_bio_cred_' + nip);
  const secretRaw = localStorage.getItem('sh_bio_secret_' + nip);
  if (!credId || !secretRaw) { toast('Biometrik belum diaktifkan di HP ini.', true); return; }
  const btn = document.getElementById('btnLoginBiometrik');
  const lbl = document.getElementById('btnLoginBiometrikLabel');
  btn.disabled = true; lbl.textContent = 'Menunggu verifikasi…';
  try {
    await navigator.credentials.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ id: b64urlToBuf(credId), type: 'public-key' }], userVerification: 'required', timeout: 60000 }
    });
    const hash = await sha256Hex(secretRaw);
    const data = await call('loginBiometrik', { credential_id: credId, device_token_hash: hash });
    token = data.token; user = data.pegawai;
    localStorage.setItem('sh_token', token);
    localStorage.setItem('sh_user', JSON.stringify(user));
    if (user.role === 'admin') { window.location.href = 'admin.html'; return; }
    masukKeApp();
  } catch (e) { toast(e.message || 'Verifikasi biometrik gagal atau dibatalkan.', true); }
  finally { btn.disabled = false; lbl.textContent = 'Masuk dengan Sidik Jari / Face ID'; }
}

// ---------- init ----------
cekTampilkanTombolBiometrikLogin();
if (token && user) {
  if (user.role === 'admin') { window.location.href = 'admin.html'; }
  else { masukKeApp(); }
}
