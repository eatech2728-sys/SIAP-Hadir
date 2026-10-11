/* SIAP-Hadir — efek suara notifikasi (disintesis Web Audio, tanpa file audio).
   Dimuat SETELAH app.js / chat.js / admin.js. Tidak mengubah logika aplikasi:
   hanya membungkus toast(), tampilkanSukses(), login(), dan memantau pesan chat. */
(function () {
  'use strict';
  var KEY = 'siap_sfx';
  var ctx = null, aktif = true;
  try { aktif = localStorage.getItem(KEY) !== 'off'; } catch (e) {}

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  // buka kunci audio pada sentuhan pertama (aturan autoplay browser)
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (aktif) getCtx(); }, { passive: true, once: false });
  });

  // satu nada: frekuensi, mulai (detik), durasi, tipe gelombang, volume
  function nada(c, f, t0, dur, tipe, vol, f2) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = tipe || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  var POLA = {
    // berhasil umum: dua nada naik
    sukses: function (c, t) { nada(c, 659.25, t, .16, 'sine', .22); nada(c, 880, t + .11, .28, 'sine', .22); },
    // presensi masuk/pulang berhasil: arpeggio naik + kilau
    absen: function (c, t) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { nada(c, f, t + i * .09, .32, 'sine', .22); });
      nada(c, 2093, t + .36, .3, 'sine', .06);
    },
    // login berhasil: tiga nada ringan
    login: function (c, t) { nada(c, 587.33, t, .14, 'triangle', .2); nada(c, 783.99, t + .1, .14, 'triangle', .2); nada(c, 987.77, t + .2, .3, 'triangle', .2); },
    // gagal / error: nada turun, kasar
    gagal: function (c, t) { nada(c, 330, t, .22, 'sawtooth', .13, 220); nada(c, 220, t + .2, .34, 'sawtooth', .13, 150); },
    // salah isi / perlu dilengkapi: dua bip pendek
    peringatan: function (c, t) { nada(c, 740, t, .11, 'square', .08); nada(c, 740, t + .17, .11, 'square', .08); },
    // info netral
    info: function (c, t) { nada(c, 880, t, .16, 'sine', .15); },
    // pesan chat masuk: pop lembut
    pesan: function (c, t) { nada(c, 1046.5, t, .09, 'sine', .2); nada(c, 1568, t + .07, .16, 'sine', .15); },
    // pesan terkirim
    kirim: function (c, t) { nada(c, 700, t, .08, 'sine', .12, 1000); },
    // pengingat shift
    ingat: function (c, t) { [880, 1108.7, 880, 1108.7].forEach(function (f, i) { nada(c, f, t + i * .16, .14, 'triangle', .18); }); }
  };

  function putar(nama) {
    if (!aktif) return;
    var c = getCtx(); if (!c || !POLA[nama]) return;
    try { POLA[nama](c, c.currentTime + 0.02); } catch (e) {}
  }
  window.SFX = { putar: putar, aktif: function () { return aktif; } };

  // ---- klasifikasi pesan toast ----
  var RE_OK = /berhasil|terkirim|diaktifkan|dinonaktifkan|dicabut|dibuat|disimpan|tersimpan/i;
  var RE_ISI = /wajib|lengkapi|pilih |ambil foto|izinkan|terlebih dahulu|belum (siap|terdeteksi|dimuat|diaktifkan)|tunggu|tidak terdeteksi|harus berupa|hanya dapat/i;
  function jenisToast(msg, isError) {
    msg = String(msg || '');
    if (!isError) return RE_OK.test(msg) ? 'sukses' : 'info';
    if (RE_ISI.test(msg)) return 'peringatan';
    return 'gagal';
  }
  var tAsli = window.toast;
  if (typeof tAsli === 'function') {
    window.toast = function (msg, isError) {
      try { putar(jenisToast(msg, isError)); } catch (e) {}
      return tAsli.apply(this, arguments);
    };
  }

  // ---- presensi berhasil ----
  if (typeof window.tampilkanSukses === 'function') {
    var sAsli = window.tampilkanSukses;
    window.tampilkanSukses = function () { putar('absen'); return sAsli.apply(this, arguments); };
  }

  // ---- login: bunyi sukses hanya untuk login yang diketik pengguna ----
  var barusanLogin = false;
  ['login', 'loginBiometrik'].forEach(function (nm) {
    if (typeof window[nm] === 'function') {
      var a = window[nm];
      window[nm] = function () { barusanLogin = true; return a.apply(this, arguments); };
    }
  });
  if (typeof window.masukKeApp === 'function') {
    var mAsli = window.masukKeApp;
    window.masukKeApp = function () {
      if (barusanLogin) { barusanLogin = false; putar('login'); }
      return mAsli.apply(this, arguments);
    };
  }
  // pesan galat login (tampil di #loginError, bukan toast)
  var le = document.getElementById('loginError');
  if (le && window.MutationObserver) {
    new MutationObserver(function () {
      if (!le.classList.contains('hidden') && le.textContent) { barusanLogin = false; putar('gagal'); }
    }).observe(le, { attributes: true, attributeFilter: ['class'] });
  }

  // ---- chat: bunyi saat ada pesan baru dari orang lain ----
  var lastKey = null, lastId = null;
  if (typeof window.gambarUlangPesan === 'function') {
    var gAsli = window.gambarUlangPesan;
    window.gambarUlangPesan = function () {
      try {
        var key = (typeof currentChatRef !== 'undefined' && currentChatRef && currentChatRef.path) || '';
        var arr = (typeof pesanTerkini !== 'undefined' && pesanTerkini) || [];
        var m = arr.length ? arr[arr.length - 1] : null;
        if (key !== lastKey) { lastKey = key; lastId = m ? m.id : null; }
        else if (m && m.id !== lastId) {
          lastId = m.id;
          if (typeof chatUid !== 'undefined' && m.senderUid !== chatUid) putar('pesan');
        }
      } catch (e) {}
      return gAsli.apply(this, arguments);
    };
  }
  // pesan baru di percakapan lain: jumlah belum-dibaca bertambah
  var lastUnread = null;
  if (typeof window.perbaruiBadgeChat === 'function') {
    var bAsli = window.perbaruiBadgeChat;
    window.perbaruiBadgeChat = function () {
      try {
        var total = Object.values(unreadChatsMap).filter(Boolean).length + Object.values(unreadGroupsMap).filter(Boolean).length;
        if (lastUnread !== null && total > lastUnread) putar('pesan');
        lastUnread = total;
      } catch (e) {}
      return bAsli.apply(this, arguments);
    };
  }

  // ---- tombol suara on/off ----
  function gambarTombol(b) { b.textContent = aktif ? '🔊' : '🔇'; b.title = aktif ? 'Suara notifikasi: aktif' : 'Suara notifikasi: mati'; b.setAttribute('aria-pressed', String(aktif)); }
  function pasangTombol() {
    var b = document.getElementById('tombolSuara');
    if (!b) return;
    gambarTombol(b);
    b.addEventListener('click', function () {
      aktif = !aktif;
      try { localStorage.setItem(KEY, aktif ? 'on' : 'off'); } catch (e) {}
      gambarTombol(b);
      if (aktif) putar('info');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasangTombol); else pasangTombol();
})();
