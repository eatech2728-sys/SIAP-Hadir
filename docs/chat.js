// ============================================================
// SIAP-Hadir — Chat real-time (Firebase)
// Identitas chat memakai UID 'pegawai_<id>' yang diterbitkan oleh
// Apps Script (action getFirebaseToken) — bukan dari Firebase Auth biasa —
// sehingga tidak bisa dipalsukan dari sisi browser.
// ============================================================

let fbApp = null, fbAuth = null, fbDb = null, fbRtdb = null;
let chatUid = null;
let chatSudahSiap = false;
let daftarKontakCache = [];
let currentChatRef = null;
let currentChatType = null;   // 'chat' | 'group'
let currentChatOtherUid = null;
let unsubMessages = null;
let unsubChatDoc = null;
let pesanTerkini = [];
let lastReadTerkini = {};
let daftarKontakElemenTerpasang = false;

function initFirebaseChat() {
  if (fbApp) return true;
  if (typeof firebase === 'undefined') { console.warn('Firebase SDK belum termuat (cek koneksi internet).'); return false; }
  if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('PASTE_') === 0) {
    console.warn('FIREBASE_CONFIG belum diisi di firebase-config.js.');
    return false;
  }
  fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
  // Beberapa jaringan (proxy kantor, VPN, antivirus tertentu) memblokir protokol QUIC yang
  // dipakai koneksi real-time default Firestore, menyebabkan error WebChannel/QUIC berulang
  // di console. Baris ini membuat Firestore otomatis beralih ke long-polling biasa bila itu terjadi.
  fbDb.settings({ experimentalAutoDetectLongPolling: true, merge: true });
  fbRtdb = firebase.database();
  return true;
}

async function masukChat() {
  if (!initFirebaseChat()) {
    document.getElementById('chatEmptyState').textContent =
      'Fitur chat belum dikonfigurasi. Admin perlu mengisi firebase-config.js (lihat README).';
    return;
  }
  if (chatSudahSiap) return;
  try {
    const data = await call('getFirebaseToken');
    await fbAuth.signInWithCustomToken(data.token);
    chatUid = data.uid;
    chatSudahSiap = true;

    // Simpan profil chat (nama/jabatan) — tidak menghalangi kontak/grup dimuat kalau ini gagal
    // (mis. koneksi Firestore lambat), supaya satu masalah kecil tidak mengunci seluruh fitur chat.
    fbDb.collection('users').doc(chatUid).set({
      nama: user.nama, nip: user.nip, jabatan: user.jabatan || '', unit_kerja: user.unit_kerja || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(e => console.warn('Gagal menyimpan profil chat (non-fatal):', e.message));

    aturPresensiOnline();
    muatKontakChat();
    muatDaftarGrup();
  } catch (e) {
    document.getElementById('chatEmptyState').textContent = 'Gagal menyambungkan ke chat: ' + e.message;
    toast('Gagal menyambungkan ke chat: ' + e.message, true);
  }
}

function aturPresensiOnline() {
  const statusRef = fbRtdb.ref('status/' + chatUid);
  const offline = { state: 'offline', last_changed: firebase.database.ServerValue.TIMESTAMP };
  const online = { state: 'online', last_changed: firebase.database.ServerValue.TIMESTAMP };
  fbRtdb.ref('.info/connected').on('value', snap => {
    if (snap.val() === false) return;
    statusRef.onDisconnect().set(offline).then(() => statusRef.set(online));
  });
}

// ---------- kontak ----------
function muatKontakChat() {
  call('daftarKontak').then(rows => {
    daftarKontakCache = rows;
    renderDaftarKontak(rows);
  }).catch(e => toast(e.message, true));
}
function renderDaftarKontak(rows) {
  const el = document.getElementById('daftarKontakChat');
  if (!rows.length) { el.innerHTML = '<div class="empty">Belum ada kontak lain.</div>'; return; }
  el.innerHTML = rows.map(k => `
    <div class="chat-list-item" data-nama="${escapeAttr(k.nama.toLowerCase())}" onclick="bukaChatDenganKontak('${k.uid}', '${escapeAttr(k.nama)}')">
      <div class="user-avatar">${inisial(k.nama)}<span class="presence-dot" id="dot-${k.uid}"></span></div>
      <div><div class="lbl">${k.nama}</div><div class="sub">${k.jabatan || k.unit_kerja || '-'}</div></div>
    </div>`).join('');
  rows.forEach(k => pantauStatusOnline(k.uid));
}
function filterKontakChat(q) {
  q = (q || '').toLowerCase();
  document.querySelectorAll('#daftarKontakChat .chat-list-item').forEach(el => {
    el.style.display = el.dataset.nama.includes(q) ? '' : 'none';
  });
}
function pantauStatusOnline(uid) {
  fbRtdb.ref('status/' + uid).on('value', snap => {
    const online = !!(snap.val() && snap.val().state === 'online');
    const dot = document.getElementById('dot-' + uid);
    if (dot) dot.classList.toggle('online', online);
    if (currentChatOtherUid === uid) {
      const st = document.getElementById('threadStatus');
      if (st) st.textContent = online ? 'Online' : 'Offline';
    }
  });
}

// ---------- buka percakapan 1-on-1 ----------
function chatIdUntuk(a, b) { return [a, b].sort().join('_'); }

async function bukaChatDenganKontak(otherUid, nama) {
  try {
    currentChatType = 'chat';
    currentChatOtherUid = otherUid;
    const chatId = chatIdUntuk(chatUid, otherUid);
    currentChatRef = fbDb.collection('chats').doc(chatId);
    const snap = await currentChatRef.get();
    if (!snap.exists) {
      await currentChatRef.set({
        participants: [chatUid, otherUid], lastMessage: '',
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), lastRead: {}
      });
    }
    document.getElementById('threadNama').textContent = nama;
    document.getElementById('threadAvatar').textContent = inisial(nama);
    document.getElementById('threadStatus').textContent = '-';
    bukaThreadUI();
    dengarkanPesan();
  } catch (e) {
    toast('Gagal membuka chat: ' + e.message, true);
  }
}

// ---------- grup ----------
function bukaModalGrupBaru() {
  document.getElementById('inNamaGrup').value = '';
  const el = document.getElementById('pilihAnggotaGrup');
  if (!daftarKontakCache.length) { el.innerHTML = '<div class="empty">Belum ada kontak lain untuk diajak.</div>'; }
  else {
    el.innerHTML = daftarKontakCache.map(k => `
      <label class="checkbox-row"><input type="checkbox" value="${k.uid}"> ${k.nama}</label>
    `).join('');
  }
  document.getElementById('modalGrupBaru').classList.remove('hidden');
}
async function buatGrupBaru() {
  const nama = document.getElementById('inNamaGrup').value.trim();
  const checked = Array.from(document.querySelectorAll('#pilihAnggotaGrup input:checked')).map(c => c.value);
  if (!nama) { toast('Nama grup wajib diisi.', true); return; }
  if (!checked.length) { toast('Pilih minimal 1 anggota.', true); return; }
  try {
    const ref = await fbDb.collection('groups').add({
      name: nama, members: [chatUid, ...checked], createdBy: chatUid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: '', lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), lastRead: {}
    });
    tutupModal('modalGrupBaru');
    toast('Grup berhasil dibuat.');
    bukaGrup(ref.id, nama);
  } catch (e) { toast('Gagal membuat grup: ' + e.message, true); }
}
function bukaGrup(groupId, nama) {
  currentChatType = 'group';
  currentChatOtherUid = null;
  currentChatRef = fbDb.collection('groups').doc(groupId);
  document.getElementById('threadNama').textContent = nama;
  document.getElementById('threadAvatar').textContent = inisial(nama);
  document.getElementById('threadStatus').textContent = 'Grup';
  bukaThreadUI();
  dengarkanPesan();
}
function muatDaftarGrup() {
  fbDb.collection('groups').where('members', 'array-contains', chatUid).onSnapshot(qs => {
    const el = document.getElementById('daftarGrup');
    if (qs.empty) { el.innerHTML = '<div class="empty">Belum ada grup.</div>'; return; }
    const rows = [];
    qs.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
    rows.sort((a, b) => (b.lastMessageAt && b.lastMessageAt.toMillis ? b.lastMessageAt.toMillis() : 0) - (a.lastMessageAt && a.lastMessageAt.toMillis ? a.lastMessageAt.toMillis() : 0));
    el.innerHTML = rows.map(g => `
      <div class="chat-list-item" onclick="bukaGrup('${g.id}', '${escapeAttr(g.name)}')">
        <div class="user-avatar">${inisial(g.name)}</div>
        <div><div class="lbl">${g.name}</div><div class="sub">${g.lastMessage || 'Belum ada pesan'}</div></div>
      </div>`).join('');
  }, e => console.warn('muatDaftarGrup:', e.message));
}

// ---------- UI thread ----------
function bukaThreadUI() {
  document.getElementById('chatEmptyState').classList.add('hidden');
  document.getElementById('chatThread').classList.remove('hidden');
  document.getElementById('chatSidebar').classList.add('tersembunyi');
  document.getElementById('chatMain').classList.remove('tersembunyi');
}
function tutupThreadChatMobile() {
  document.getElementById('chatSidebar').classList.remove('tersembunyi');
  document.getElementById('chatMain').classList.add('tersembunyi');
}

// ---------- pesan ----------
function dengarkanPesan() {
  if (unsubMessages) unsubMessages();
  if (unsubChatDoc) unsubChatDoc();
  document.getElementById('chatMessages').innerHTML = '<div class="empty">Memuat pesan…</div>';

  unsubChatDoc = currentChatRef.onSnapshot(doc => {
    const data = doc.data();
    lastReadTerkini = (data && data.lastRead) || {};
    gambarUlangPesan();
  }, err => toast('Gagal memuat status baca: ' + err.message, true));

  unsubMessages = currentChatRef.collection('messages').orderBy('createdAt', 'asc').limitToLast(150)
    .onSnapshot(qs => {
      pesanTerkini = [];
      qs.forEach(doc => pesanTerkini.push({ id: doc.id, ...doc.data() }));
      gambarUlangPesan();
      tandaiSudahDibaca();
    }, err => toast('Gagal memuat pesan: ' + err.message, true));
}
function gambarUlangPesan() {
  const el = document.getElementById('chatMessages');
  if (!pesanTerkini.length) { el.innerHTML = '<div class="empty">Belum ada pesan. Mulai obrolan!</div>'; return; }

  let idxTerakhirMilikSaya = -1;
  pesanTerkini.forEach((m, i) => { if (m.senderUid === chatUid) idxTerakhirMilikSaya = i; });

  el.innerHTML = pesanTerkini.map((m, i) => {
    let statusHtml = '';
    if (i === idxTerakhirMilikSaya && currentChatType === 'chat' && currentChatOtherUid) {
      const dibacaTs = lastReadTerkini[currentChatOtherUid];
      const waktuBaca = dibacaTs && dibacaTs.toMillis ? dibacaTs.toMillis() : 0;
      const waktuPesan = m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : Date.now();
      statusHtml = `<div class="read-status">${waktuBaca >= waktuPesan ? '✓✓ Dibaca' : '✓ Terkirim'}</div>`;
    }
    return renderBubble(m) + (statusHtml ? `<div class="bubble-row mine">${statusHtml}</div>` : '');
  }).join('');
  el.scrollTop = el.scrollHeight;
}
function renderBubble(m) {
  const mine = m.senderUid === chatUid;
  const waktu = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="bubble-row ${mine ? 'mine' : ''}">
    <div class="bubble ${mine ? 'mine' : ''}">
      ${m.imageUrl ? `<img src="${m.imageUrl}" class="bubble-img" onclick="window.open('${m.imageUrl}','_blank')">` : ''}
      ${m.text ? `<div>${escapeHtml(m.text)}</div>` : ''}
      <div class="bubble-time">${waktu}</div>
    </div>
  </div>`;
}
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escapeAttr(s) { return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }

function kirimTeksChat() {
  const input = document.getElementById('chatTextInput');
  const text = input.value.trim();
  if (!text || !currentChatRef) return;
  input.value = '';
  currentChatRef.collection('messages').add({ senderUid: chatUid, text: text, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(e => toast('Gagal mengirim pesan: ' + e.message, true));
  currentChatRef.set({ lastMessage: text, lastMessageAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}
function pilihGambarChat() { document.getElementById('inputGambarChat').click(); }
function kirimGambarChat(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file || !currentChatRef) return;
  if (!file.type.startsWith('image/')) { toast('File harus berupa gambar.', true); return; }
  const refSaatDikirim = currentChatRef; // jaga-jaga kalau pengguna pindah chat sebelum unggah selesai
  toast('Mengirim gambar…');
  kompresGambarKeBase64(file, base64 => {
    call('uploadGambarChat', { base64 })
      .then(r => {
        refSaatDikirim.collection('messages').add({ senderUid: chatUid, imageUrl: r.url, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        refSaatDikirim.set({ lastMessage: '📷 Foto', lastMessageAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      })
      .catch(e => toast('Gagal mengirim gambar: ' + e.message, true));
  });
}
function kompresGambarKeBase64(file, cb) {
  const img = new Image();
  const reader = new FileReader();
  reader.onload = e => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 1080;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/jpeg', 0.7)); // base64 data URL, dikirim ke Apps Script (bukan Firebase Storage)
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function tandaiSudahDibaca() {
  if (!currentChatRef || !chatUid) return;
  currentChatRef.set({ lastRead: { [chatUid]: firebase.firestore.FieldValue.serverTimestamp() } }, { merge: true });
}
