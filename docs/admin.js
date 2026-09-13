// ============================================================
// GANTI URL DI BAWAH INI dengan Web App URL Apps Script Anda
// (harus SAMA PERSIS dengan yang dipakai di app.js)
// ============================================================
const API_BASE = 'https://script.google.com/macros/s/AKfycbyTc2ZebcADtl7aR48puMf-xLnQ24VgJahSpoDbwn3dpbF1xICFBOK16rZPTkcUyQHG/exec';

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

let token = localStorage.getItem('sh_token') || null;
let user = JSON.parse(localStorage.getItem('sh_user') || 'null');

function call(action, payload = {}) {
  if (!API_BASE || API_BASE.indexOf('PASTE_URL') === 0) {
    return Promise.reject(new Error('API_BASE belum diisi. Buka admin.js dan ganti dengan URL Web App Apps Script Anda.'));
  }
  const body = Object.assign({ action, token }, payload);
  return fetch(API_BASE, {
    method: 'POST',
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
function tutupModal(id) { document.getElementById(id).classList.add('hidden'); }
function fmtTgl(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- auth ----------
function login() {
  const nip = document.getElementById('inNip').value.trim();
  const pass = document.getElementById('inPass').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');

  call('login', { nip, password: pass })
    .then(data => {
      if (data.pegawai.role !== 'admin') {
        errEl.textContent = 'Akun ini bukan admin. Gunakan aplikasi pegawai.';
        errEl.classList.remove('hidden');
        return;
      }
      token = data.token; user = data.pegawai;
      localStorage.setItem('sh_token', token);
      localStorage.setItem('sh_user', JSON.stringify(user));
      masukKeAdmin();
    })
    .catch(e => { errEl.textContent = e.message; errEl.classList.remove('hidden'); });
}
function logout() {
  localStorage.removeItem('sh_token'); localStorage.removeItem('sh_user');
  token = null; user = null;
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('screen-login').style.display = 'flex';
}
function masukKeAdmin() {
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  document.getElementById('adminNama').textContent = user.nama;
  document.getElementById('rekapTanggal').value = new Date().toISOString().slice(0, 10);
  gantiTab('rekap');
}

// ---------- tab ----------
function gantiTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  if (tab === 'rekap') muatRekap();
  if (tab === 'pegawai') muatPegawai();
  if (tab === 'izin') muatIzinAdmin();
  if (tab === 'lokasi') muatLokasi();
}

// ---------- rekap ----------
function muatRekap() {
  const tanggal = document.getElementById('rekapTanggal').value;
  call('rekap', { tanggal }).then(rows => {
    document.getElementById('rekapStat').innerHTML = `
      <div class="stat-card"><div class="num">${rows.filter(r=>r.status_masuk==='hadir').length}</div><div class="lbl">Hadir tepat waktu</div></div>
      <div class="stat-card"><div class="num">${rows.filter(r=>r.status_masuk==='telat').length}</div><div class="lbl">Terlambat</div></div>
      <div class="stat-card"><div class="num">${rows.filter(r=>r.dalam_radius_masuk===0).length}</div><div class="lbl">Absen di luar radius</div></div>
    `;
    const body = document.getElementById('rekapBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="empty">Belum ada absensi pada tanggal ini.</td></tr>'; return; }
    body.innerHTML = rows.map(r => {
      let wajahLabel = '<span style="color:var(--text-mute);">-</span>';
      if (r.wajah_cocok_masuk === 1) wajahLabel = '<span class="badge hadir">Cocok</span>';
      else if (r.wajah_cocok_masuk === 0) wajahLabel = '<span class="badge alpha">Tidak cocok</span>';
      return `
      <tr>
        <td>${r.nama}</td><td>${r.nip}</td><td>${r.unit_kerja || '-'}</td>
        <td>${r.jam_masuk || '-'}</td>
        <td><span class="badge ${r.status_masuk || 'alpha'}">${r.status_masuk === 'telat' ? 'Telat' : r.status_masuk === 'hadir' ? 'Hadir' : r.status_masuk === 'dinas_luar' ? 'Dinas Luar' : '-'}</span></td>
        <td>${r.jam_pulang || '-'}</td>
        <td>${r.jarak_masuk != null && r.jarak_masuk !== '' ? Math.round(r.jarak_masuk) + ' m' : '-'} ${r.dalam_radius_masuk === 0 ? '⚠️' : ''}</td>
        <td>${wajahLabel}</td>
      </tr>`;
    }).join('');
  }).catch(e => toast(e.message, true));
}
function exportCsv() {
  const bulan = document.getElementById('rekapTanggal').value.slice(0, 7);
  call('exportRekap', { bulan }).then(r => {
    const blob = new Blob(['\uFEFF' + r.csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.filename;
    a.click();
  }).catch(e => toast(e.message, true));
}

// ---------- pegawai ----------
function muatPegawai() {
  call('listPegawai').then(rows => {
    const body = document.getElementById('pegawaiBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="empty">Belum ada data pegawai.</td></tr>'; return; }
    body.innerHTML = rows.map(p => `
      <tr>
        <td>${p.nama}</td><td>${p.nip}</td><td>${p.jabatan || '-'}</td><td>${p.unit_kerja || '-'}</td>
        <td>${p.jam_masuk}–${p.jam_pulang}</td>
        <td><span class="badge ${p.status === 'aktif' ? 'hadir' : 'alpha'}">${p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></td>
        <td><button class="pill-btn edit" onclick='editPegawai(${JSON.stringify(p)})'>Ubah</button></td>
      </tr>`).join('');
  }).catch(e => toast(e.message, true));
}
function bukaFormPegawai() {
  document.getElementById('modalPegawaiTitle').textContent = 'Tambah pegawai';
  document.getElementById('fPegawaiId').value = '';
  document.getElementById('fNip').value = ''; document.getElementById('fNip').disabled = false;
  document.getElementById('fNama').value = '';
  document.getElementById('fJabatan').value = '';
  document.getElementById('fUnit').value = '';
  document.getElementById('fJamMasuk').value = '07:30';
  document.getElementById('fJamPulang').value = '16:00';
  document.getElementById('fToleransi').value = 15;
  document.getElementById('fRole').value = 'pegawai';
  document.getElementById('fPassword').value = '';
  document.getElementById('fPassLabel').textContent = 'Kata sandi awal';
  document.getElementById('fStatusWrap').style.display = 'none';
  document.getElementById('fBiometrikWrap').style.display = 'none';
  document.getElementById('modalPegawai').classList.remove('hidden');
}
function editPegawai(p) {
  document.getElementById('modalPegawaiTitle').textContent = 'Ubah data pegawai';
  document.getElementById('fPegawaiId').value = p.id;
  document.getElementById('fNip').value = p.nip; document.getElementById('fNip').disabled = true;
  document.getElementById('fNama').value = p.nama;
  document.getElementById('fJabatan').value = p.jabatan || '';
  document.getElementById('fUnit').value = p.unit_kerja || '';
  document.getElementById('fJamMasuk').value = p.jam_masuk;
  document.getElementById('fJamPulang').value = p.jam_pulang;
  document.getElementById('fToleransi').value = p.toleransi_menit;
  document.getElementById('fRole').value = p.role;
  document.getElementById('fPassword').value = '';
  document.getElementById('fPassLabel').textContent = 'Ganti kata sandi (kosongkan jika tidak diubah)';
  document.getElementById('fStatusWrap').style.display = 'block';
  document.getElementById('fStatus').value = p.status;
  document.getElementById('fBiometrikWrap').style.display = 'block';
  document.getElementById('modalPegawai').classList.remove('hidden');
}
function cabutSemuaPerangkatPegawai() {
  const id = document.getElementById('fPegawaiId').value;
  if (!id) return;
  if (!confirm('Cabut semua akses login biometrik untuk pegawai ini? Pegawai wajib login dengan NIP & kata sandi setelah ini.')) return;
  call('cabutSemuaPerangkat', { pegawai_id: Number(id) })
    .then(() => toast('Akses biometrik pegawai ini sudah dicabut.'))
    .catch(e => toast(e.message, true));
}
function simpanPegawai() {
  const id = document.getElementById('fPegawaiId').value;
  const payload = {
    nip: document.getElementById('fNip').value.trim(),
    nama: document.getElementById('fNama').value.trim(),
    jabatan: document.getElementById('fJabatan').value.trim(),
    unit_kerja: document.getElementById('fUnit').value.trim(),
    jam_masuk: document.getElementById('fJamMasuk').value,
    jam_pulang: document.getElementById('fJamPulang').value,
    toleransi_menit: Number(document.getElementById('fToleransi').value),
    role: document.getElementById('fRole').value,
    password: document.getElementById('fPassword').value,
  };
  if (!payload.nama) { toast('Nama wajib diisi.', true); return; }

  const req = id
    ? call('updatePegawai', Object.assign({ id }, payload, { status: document.getElementById('fStatus').value }))
    : call('tambahPegawai', payload);

  req.then(() => { tutupModal('modalPegawai'); toast('Data pegawai tersimpan.'); muatPegawai(); })
     .catch(e => toast(e.message, true));
}

// ---------- izin ----------
function muatIzinAdmin() {
  const status = document.getElementById('izinFilter').value;
  call('listIzin', { status }).then(rows => {
    const body = document.getElementById('izinBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="empty">Tidak ada pengajuan.</td></tr>'; return; }
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.nama}</td><td style="text-transform:capitalize;">${r.jenis.replace('_',' ')}</td>
        <td>${fmtTgl(r.tanggal_mulai)} – ${fmtTgl(r.tanggal_selesai)}</td>
        <td>${r.alasan || '-'}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>
          ${r.status === 'menunggu' ? `
            <button class="pill-btn approve" onclick="setIzinStatus(${r.id}, 'disetujui')">Setujui</button>
            <button class="pill-btn reject" onclick="setIzinStatus(${r.id}, 'ditolak')">Tolak</button>
          ` : '-'}
        </td>
      </tr>`).join('');
  }).catch(e => toast(e.message, true));
}
function setIzinStatus(id, status) {
  call('setIzinStatus', { id, status })
    .then(() => { toast('Status izin diperbarui.'); muatIzinAdmin(); })
    .catch(e => toast(e.message, true));
}

// ---------- lokasi ----------
function muatLokasi() {
  call('getLokasi').then(l => {
    if (!l) return;
    document.getElementById('fLokasiNama').value = l.nama;
    document.getElementById('fLokasiLat').value = l.latitude;
    document.getElementById('fLokasiLng').value = l.longitude;
    document.getElementById('fLokasiRadius').value = l.radius_meter;
  }).catch(e => toast(e.message, true));
}
function gunakanLokasiSaatIni() {
  if (!navigator.geolocation) { toast('Perangkat tidak mendukung GPS.', true); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('fLokasiLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('fLokasiLng').value = pos.coords.longitude.toFixed(6);
      toast('Lokasi perangkat diterapkan. Jangan lupa simpan.');
    },
    () => toast('Gagal mengambil lokasi perangkat.', true)
  );
}
function simpanLokasi() {
  const payload = {
    nama: document.getElementById('fLokasiNama').value.trim() || 'Kantor',
    latitude: parseFloat(document.getElementById('fLokasiLat').value),
    longitude: parseFloat(document.getElementById('fLokasiLng').value),
    radius_meter: Number(document.getElementById('fLokasiRadius').value) || 150,
  };
  if (isNaN(payload.latitude) || isNaN(payload.longitude)) { toast('Latitude/longitude tidak valid.', true); return; }
  call('setLokasi', payload)
    .then(() => toast('Lokasi kantor tersimpan.'))
    .catch(e => toast(e.message, true));
}

// ---------- init ----------
if (token && user && user.role === 'admin') {
  masukKeAdmin();
}
