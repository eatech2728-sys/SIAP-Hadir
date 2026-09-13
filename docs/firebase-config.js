// ============================================================
// KONFIGURASI FIREBASE — WAJIB DIISI sebelum fitur Chat berfungsi
// ============================================================
// Ambil nilai-nilai ini dari Firebase Console:
//   Project Settings (ikon gerigi) > General > scroll ke "Your apps" >
//   pilih app web Anda (atau buat baru dengan ikon "</>") > Firebase SDK snippet > Config
//
// Config ini AMAN untuk ditaruh di kode frontend (bukan rahasia) — keamanan
// sebenarnya diatur lewat Firestore/Storage/Database Rules, bukan dengan
// menyembunyikan nilai-nilai ini.
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com", // tidak dipakai kode ini (gambar chat disimpan di Google Drive, bukan Firebase Storage) — boleh dibiarkan apa adanya
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
  databaseURL: "https://PASTE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app"
  // ^ sesuaikan region databaseURL dengan yang dipilih saat membuat Realtime Database
};
