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
  apiKey: "AIzaSyDF8F293BSpLUt4O97uka7ibrflPRYBQwE",
  authDomain: "chat-grup-c6a08.firebaseapp.com",
  projectId: "chat-grup-c6a08",
  storageBucket: "chat-grup-c6a08.firebasestorage.app", // tidak dipakai kode ini (gambar chat disimpan di Google Drive, bukan Firebase Storage) — boleh dibiarkan apa adanya
  messagingSenderId: "1074397994403",
  appId: "1:1074397994403:web:b5385fbe85a816984a8e16",
  databaseURL: "https://chat-grup-c6a08-default-rtdb.asia-southeast1.firebasedatabase.app"
  // ^ sesuaikan region databaseURL dengan yang dipilih saat membuat Realtime Database
};
