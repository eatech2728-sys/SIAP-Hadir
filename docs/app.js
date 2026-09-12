// ============================================================
// GANTI URL DI BAWAH INI dengan Web App URL Apps Script Anda
// (Deploy > New deployment > Web app, salin URL yang diakhiri /exec)
// ============================================================
const API_BASE = 'https://script.google.com/macros/s/AKfycbxG8xOBUOijRMUoCtDyn2-hEBL5damM2uGK6BD31PJWFMcsfdpKT_8be6s5KdsCRmvN/exec';

let token = localStorage.getItem('sh_token') || null;
let user = JSON.parse(localStorage.getItem('sh_user') || 'null');
let mode = 'masuk';          // 'masuk' atau 'pulang'
let posisiSaatIni = null;    // {latitude, longitude}
let mediaStream = null;

const tabs = ['home', 'riwayat', 'absen', 'izin', 'profil'];

// ---------- util pemanggilan API ----------
function call(action, payload = {}) {
  if (!API_BASE || API_BASE.indexOf('PASTE_URL') === 0) {
    return Promise.reject(new Error('API_BASE belum diisi. Buka app.js dan ganti dengan URL Web App Apps Script Anda.'));
  }
  const body = Object.assign({ action, token }, payload);
  return fetch(API_BASE, {
    method: 'POST',
    // Content-Type text/plain sengaja dipakai agar browser TIDAK mengirim
    // preflight OPTIONS (Apps Script Web App tidak menangani preflight).
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  })
    .then(r => r.json())
    .then(data => {
      if (data && data.error) throw new Error(data.error);
      return data;
    });
}
function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function fmtTanggal(d) {
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTanggalSingkat(str) {
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}
function inisial(nama) {
  return (nama || '').split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
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
  localStorage.removeItem('sh_token');
  localStorage.removeItem('sh_user');
  token = null; user = null;
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('screen-login').classList.add('active');
  document.getElementById('inPass').value = '';
}

function masukKeApp() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('homeNama').textContent = user.nama;
  document.getElementById('homeNip').textContent = 'NIP ' + user.nip + (user.unit_kerja ? ' · ' + user.unit_kerja : '');
  goTo('home');
  jalankanJam();
}

// ---------- navigasi ----------
function goTo(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  if (screen === 'success') {
    document.getElementById('screen-success').classList.add('active');
    document.getElementById('bottomNav').style.display = 'none';
    hentikanKamera();
    return;
  }

  document.getElementById('bottomNav').style.display = 'flex';
  document.getElementById('screen-' + screen).classList.add('active');
  document.getElementById('appBody').scrollTop = 0;

  if (tabs.includes(screen)) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector('.nav-item[data-tab="' + screen + '"]');
    if (btn) btn.classList.add('active');
  }

  if (screen !== 'absen') hentikanKamera();

  if (screen === 'home') muatBeranda();
  if (screen === 'absen') siapkanAbsen();
  if (screen === 'riwayat') muatRiwayat();
  if (screen === 'izin') muatIzin();
  if (screen === 'profil') muatProfil();
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

// ---------- beranda ----------
function muatBeranda() {
  const jam = new Date().getHours();
  document.getElementById('greetTime').textContent =
    jam < 11 ? 'Selamat pagi,' : jam < 15 ? 'Selamat siang,' : jam < 18 ? 'Selamat sore,' : 'Selamat malam,';

  call('absenHariIni').then(row => {
    const statusEl = document.getElementById('statusHariIni');
    const lblEl = document.getElementById('absenLbl');
    const valEl = document.getElementById('absenVal');
    const btnEl = document.getElementById('btnAbsenCta');
    btnEl.disabled = false;

    if (!row || !row.jam_masuk) {
      statusEl.textContent = 'Belum absen';
      lblEl.textContent = 'Jam masuk hari ini';
      valEl.textContent = 'Belum melakukan absen';
      btnEl.textContent = 'Absen masuk';
      mode = 'masuk';
    } else if (row.jam_masuk && !row.jam_pulang) {
      statusEl.textContent = row.status_masuk === 'telat' ? 'Sudah masuk (telat)' : 'Sudah masuk';
      lblEl.textContent = 'Jam masuk hari ini';
      valEl.textContent = row.jam_masuk;
      btnEl.textContent = 'Absen pulang';
      mode = 'pulang';
    } else {
      statusEl.textContent = 'Selesai hari ini';
      lblEl.textContent = 'Jam masuk / pulang';
      valEl.textContent = row.jam_masuk + ' – ' + row.jam_pulang;
      btnEl.textContent = 'Selesai';
      btnEl.disabled = true;
      mode = null;
    }
  }).catch(e => toast(e.message, true));

  call('ringkasan').then(r => {
    document.getElementById('statHadir').textContent = r.hadir;
    document.getElementById('statTelat').textContent = r.telat;
    document.getElementById('statIzin').textContent = r.izin;
  }).catch(() => {});

  call('riwayatMe').then(rows => {
    const el = document.getElementById('aktivitasList');
    if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada riwayat kehadiran.</div>'; return; }
    el.innerHTML = rows.slice(0, 5).map(r => `
      <div class="activity-item">
        <div><div class="day">${fmtTanggalSingkat(r.tanggal)}</div>
        <div class="time">${r.jam_masuk ? 'Masuk ' + r.jam_masuk : ''}${r.jam_pulang ? ' · Pulang ' + r.jam_pulang : ''}</div></div>
        <span class="badge ${r.status_masuk || 'hadir'}">${r.status_masuk === 'telat' ? 'Telat' : 'Hadir'}</span>
      </div>`).join('');
  }).catch(() => {});
}

// ---------- absen ----------
function siapkanAbsen() {
  document.getElementById('absenJudul').textContent = mode === 'pulang' ? 'Absen pulang' : 'Absen masuk';
  document.getElementById('absenStep1').classList.remove('hidden');
  document.getElementById('absenStep2').classList.add('hidden');
  const box = document.getElementById('locBox');
  box.className = 'loc-box';
  document.getElementById('locT1').textContent = 'Mencari lokasi Anda';
  document.getElementById('locT2').textContent = 'Pastikan GPS aktif';
  posisiSaatIni = null;
}

function mulaiCekLokasi() {
  if (!navigator.geolocation) { toast('Perangkat tidak mendukung GPS.', true); return; }
  document.getElementById('locT1').textContent = 'Mendeteksi lokasi…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      posisiSaatIni = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      try {
        const lokasi = await call('getLokasi');
        const box = document.getElementById('locBox');
        if (lokasi) {
          const jarak = hitungJarak(posisiSaatIni.latitude, posisiSaatIni.longitude, lokasi.latitude, lokasi.longitude);
          const dalam = jarak <= lokasi.radius_meter;
          box.className = 'loc-box ' + (dalam ? 'ok' : 'warn');
          document.getElementById('locT1').textContent = dalam ? 'Dalam radius kantor' : 'Di luar radius kantor';
          document.getElementById('locT2').textContent = `Jarak ${Math.round(jarak)} m dari ${lokasi.nama}`;
        } else {
          document.getElementById('locT1').textContent = 'Lokasi terdeteksi';
          document.getElementById('locT2').textContent = 'Lokasi kantor belum diatur admin';
        }
        document.getElementById('absenStep1').classList.add('hidden');
        document.getElementById('absenStep2').classList.remove('hidden');
        bukaKamera();
      } catch (e) { toast(e.message, true); }
    },
    () => toast('Gagal mengambil lokasi. Izinkan akses GPS pada browser.', true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bukaKamera() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    .then(stream => { mediaStream = stream; document.getElementById('videoEl').srcObject = stream; })
    .catch(() => toast('Tidak dapat mengakses kamera. Izinkan akses kamera pada browser.', true));
}
function hentikanKamera() {
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
}

function ambilFotoDanKirim() {
  const video = document.getElementById('videoEl');
  const canvas = document.getElementById('canvasEl');
  let fotoBase64 = null;
  if (video.videoWidth) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
  }
  if (!posisiSaatIni) { toast('Lokasi belum terdeteksi.', true); return; }

  const btn = document.getElementById('btnAmbilFoto');
  btn.disabled = true; btn.textContent = 'Mengirim…';

  const action = mode === 'pulang' ? 'absenPulang' : 'absenMasuk';
  call(action, Object.assign({}, posisiSaatIni, { foto: fotoBase64 }))
    .then(r => {
      document.getElementById('successTitle').textContent = mode === 'pulang' ? 'Absen pulang berhasil' : 'Absen masuk berhasil';
      document.getElementById('successSub').textContent = 'Data kehadiran Anda telah tercatat di Google Sheet.';
      document.getElementById('successCard').innerHTML = `
        <div class="success-row"><span class="k">Waktu</span><span class="v">${r.jam_masuk || r.jam_pulang}</span></div>
        ${r.status ? `<div class="success-row"><span class="k">Status</span><span class="v" style="color:${r.status==='telat'?'var(--warn)':'var(--success)'}">${r.status === 'telat' ? 'Terlambat' : 'Tepat waktu'}</span></div>` : ''}
        <div class="success-row"><span class="k">Jarak lokasi</span><span class="v">${r.jarak_meter != null ? r.jarak_meter + ' m' : '-'} ${r.dalam_radius === false ? '(di luar radius)' : ''}</span></div>
      `;
      goTo('success');
    })
    .catch(e => toast(e.message, true))
    .finally(() => { btn.disabled = false; btn.textContent = 'Ambil foto & absen'; });
}

// ---------- riwayat ----------
function muatRiwayat(bulan) {
  const now = new Date();
  bulan = bulan || now.toISOString().slice(0, 7);
  document.getElementById('riwayatBulanLabel').textContent =
    now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const bulanList = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    bulanList.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('id-ID', { month: 'short' }) });
  }
  document.getElementById('riwayatFilter').innerHTML = bulanList.map(b =>
    `<span class="filter-chip ${b.key === bulan ? 'active' : ''}" onclick="muatRiwayat('${b.key}')">${b.label}</span>`
  ).join('');

  call('riwayatMe', { bulan }).then(rows => {
    const el = document.getElementById('riwayatList');
    if (!rows.length) { el.innerHTML = '<div class="empty">Tidak ada catatan pada bulan ini.</div>'; return; }
    el.innerHTML = rows.map(r => `
      <div class="activity-item">
        <div><div class="day">${fmtTanggalSingkat(r.tanggal)}</div>
        <div class="time">${r.jam_masuk ? 'Masuk ' + r.jam_masuk : 'Tidak ada catatan'}${r.jam_pulang ? ' · Pulang ' + r.jam_pulang : ''}</div></div>
        <span class="badge ${r.status_masuk || 'alpha'}">${r.status_masuk === 'telat' ? 'Telat' : r.status_masuk === 'hadir' ? 'Hadir' : 'Alpha'}</span>
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
function tutupModal(id) { document.getElementById(id).classList.add('hidden'); }

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
  }).catch(e => toast(e.message, true));
}

// ---------- init ----------
if (token && user) {
  if (user.role === 'admin') { window.location.href = 'admin.html'; }
  else { masukKeApp(); }
}
