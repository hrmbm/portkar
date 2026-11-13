# PORTAL KARIR v1.0.0

Portal rekrutmen untuk GitHub Pages (frontend statis) dan Supabase (database, storage, Auth, dan Edge Function). Paket ini dibangun ulang untuk **project Supabase baru** dan dapat dipasang melalui browser: Supabase Dashboard, SQL Editor, Edge Functions Editor, dan GitHub website. **Tidak perlu Terminal, CLI, npm, atau command prompt di komputer Anda.**

## Isi fitur

### Dashboard HR — desktop
- Login hanya dengan username + PIN.
- Dashboard ringkasan rekrutmen.
- Rekrutmen tahap 1, 2, dan 3.
- Tracking karyawan: lihat, edit, dan konversi kandidat menjadi karyawan.
- Cetak dokumen berurutan: Lamaran → CV → hasil DISC.
- Master HTML cetak dapat diganti, diberi versi, diaktifkan, dan dipulihkan.
- Ekspor XLSX berisi data karyawan dan data lamaran.
- Laporan rekrutmen masih placeholder sesuai permintaan.
- Tampilan dashboard disembunyikan pada perangkat mobile.

### Kandidat — mobile
- `/apply/` tahap 1 placeholder.
- `/form/` formulir lamaran kerja, OCR kamera langsung dengan bingkai KTP, draft lokal + Supabase, upload CV PDF.
- `/disc/` tes DISC 24 kelompok, tanpa token pada URL; sesi disimpan pada browser kandidat.
- `/spm/` tahap IQ/SPM placeholder.
- Form menggunakan dropdown, field kondisional, susunan alamat KTP terstruktur, dan angka Rupiah dengan titik ribuan.

### Backend
- Database kandidat, draft, hasil DISC, karyawan, admin, dan versi master cetak.
- Private Storage bucket CV, batas 10 MB, PDF.
- RPC kandidat untuk menyimpan draft, submit lamaran, membaca status kandidat, dan mengirim DISC.
- RLS untuk data HR/admin.
- Login admin username + PIN, hash bcrypt, lockout setelah 5 percobaan salah selama 15 menit.
- Supabase Auth session dibuat otomatis pada login pertama oleh Edge Function. Tidak perlu membuat akun Auth atau UUID admin secara manual.

## Mulai cepat — urutan pemasangan

1. Ekstrak ZIP di komputer (klik kanan → Extract All).
2. Buat project baru di Supabase Dashboard.
3. Jalankan **satu file SQL saja**: `supabase/SETUP-ALL-IN-ONE.sql` melalui Supabase → SQL Editor. Sebelum Run, ubah `v_pin` dari `GANTI_PIN_6_ANGKA` menjadi PIN Anda. Username awal adalah `Admin`, dan SQL otomatis menyimpannya sebagai `admin`. Anda boleh mengubah nilai `v_username` dan `v_display_name`.
4. Buat Edge Function `admin-login` melalui Dashboard → Edge Functions → Deploy a new function → Via Editor. Salin seluruh isi `supabase/functions/admin-login/index.ts` ke editor lalu Deploy.
5. Buka fungsi `admin-login` → Details, lalu matikan **Verify JWT / Enforce JWT Verification**. Endpoint login dipanggil sebelum admin mempunyai sesi. Fungsi tetap memverifikasi publishable key aplikasi, PIN bcrypt, dan lockout di database.
6. Pastikan Authentication → Sign In / Providers → Email dalam keadaan aktif. Ini hanya dipakai internal untuk membuat sesi Supabase; admin tetap login di portal menggunakan username + PIN.
7. Buka Project Settings → API Keys, salin Project URL dan **Publishable key** (`sb_publishable_...`) ke `assets/js/config.js`.
8. Upload seluruh isi folder proyek ini ke root repository GitHub menggunakan tombol Add file → Upload files. Aktifkan Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
9. Buka URL Pages di desktop dan login dengan username/PIN yang dibuat pada langkah 3. Uji kandidat melalui `/form/` di ponsel.

**Jangan jalankan file SQL lama per tahap.** File `SETUP-ALL-IN-ONE.sql` sudah berisi seluruh skema inti, autosave mobile, HR console, private CV storage, DISC, template cetak, dan username/PIN admin.

## Konfigurasi frontend

File: `assets/js/config.js`

```js
export const SUPABASE_URL = 'https://PROJECT-REF.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
```

Gunakan Publishable key, bukan Secret key. Jangan pernah memasukkan `sb_secret_...` atau `service_role` ke file frontend, GitHub, atau HTML.

## Alamat

| Path | Fungsi |
|---|---|
| `/` | Dashboard HR desktop |
| `/apply/` | Rekrutmen tahap 1 |
| `/form/` | Formulir lamaran + OCR KTP + CV |
| `/disc/` | Tes DISC |
| `/spm/` | Tes IQ/SPM |

Path mengikuti alamat repository GitHub Pages. Jika URL website adalah `https://username.github.io/nama-repo/`, alamat formulir menjadi `https://username.github.io/nama-repo/form/`.

## Catatan penting penggunaan

- OCR KTP berjalan di browser. Foto KTP tidak disimpan di database atau Storage. Kandidat tetap perlu memeriksa hasil baca karena akurasi dipengaruhi kamera, fokus, pantulan cahaya, dan kondisi kartu.
- Draft tersimpan di perangkat yang sama dan Supabase. Draft lokal bisa dipulihkan setelah reload selama browser/site data tidak dihapus. Draft tidak otomatis berpindah ke perangkat lain.
- Token kandidat tidak ditampilkan di URL. `/disc/` membaca token sesi yang tersimpan pada browser yang sama. Kandidat sebaiknya melanjutkan proses di perangkat/browser tempat formulir dikirim.
- CV disimpan pada bucket privat `candidate-files`; PDF maksimum 10 MB.
- Master HTML cetak harus mempertahankan atribut `name` dan `id="applicationForm"` agar data lama tetap bisa dicetak. Perubahan CSS, warna, logo, header, layout, dan ukuran kertas boleh dilakukan.
- Data KTP, NIK, keluarga, dan lamaran adalah data pribadi. Batasi akses admin, jangan menyebarkan file ekspor kepada pihak yang tidak berwenang, dan tetapkan retensi data internal.

## Pemecahan masalah

| Gejala | Pemeriksaan |
|---|---|
| Username/PIN tidak sesuai | SQL seed harus selesai tanpa error. Username `Admin` otomatis menjadi `admin`. PIN harus 4–12 angka. |
| Layanan login belum dikonfigurasi | Pastikan Edge Function `admin-login` sudah deploy dan secret runtime Supabase tersedia. |
| HTTP 401 dari Edge Function | Pastikan Verify JWT dimatikan di Detail fungsi dan frontend memakai Publishable key project yang sama. |
| Sesi login gagal dibuat | Pastikan Authentication → Sign In / Providers → Email aktif. |
| Akses HR belum aktif | Pastikan login memakai `admin-login` yang baru; function akan membuat `admin_users` otomatis setelah PIN valid. |
| Dashboard kosong / data gagal | Pastikan setup SQL lengkap berhasil dijalankan dan buka ulang halaman. |
| CV gagal diunggah | Pastikan file benar-benar PDF, maksimal 10 MB, dan draft sudah tersimpan. |

## File utama

- `index.html` — dashboard HR desktop.
- `apply/index.html` — tahap 1.
- `form/index.html` — formulir mobile.
- `disc/index.html` — tes DISC.
- `spm/index.html` — placeholder tahap 4.
- `templates/application-master.html` — master lamaran 2 halaman.
- `assets/js/disc-engine.js` — mesin hitung dari Code.gs DISC.
- `assets/js/applicant.js` — alur formulir dan draft.
- `assets/js/ktp-ocr.js` — parser OCR KTP.
- `assets/js/admin.js` — dashboard HR.
- `assets/js/print.js` — cetak Lamaran → CV → DISC dan master HTML.
- `supabase/SETUP-ALL-IN-ONE.sql` — satu-satunya setup database untuk project baru.
- `supabase/functions/admin-login/index.ts` — kode Edge Function untuk Dashboard editor.
- `supabase/GANTI-PIN-ADMIN.sql` — mengganti PIN admin di kemudian hari melalui SQL Editor tanpa menyentuh tabel kandidat.
- `docs/PANDUAN-INSTALL-UI.md` — petunjuk visual langkah demi langkah tanpa terminal.
