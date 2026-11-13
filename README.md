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
- `/form/` formulir lamaran kerja, foto KTP tersimpan privat, OCR (server opsional + fallback Tesseract.js), dropdown alamat berjenjang, draft lokal + Supabase, upload CV PDF.
- `/disc/` tes DISC 24 kelompok, tanpa token pada URL; sesi disimpan pada browser kandidat.
- `/spm/` tahap IQ/SPM placeholder.
- Form menggunakan dropdown, field kondisional, susunan alamat KTP terstruktur, pilihan pendidikan berdasarkan pendidikan terakhir, dan angka Rupiah dengan titik ribuan.
- Master wilayah disimpan di Supabase: 38 provinsi, 514 kabupaten/kota, 7.285 kecamatan, 83.762 desa/kelurahan dan kode pos. Browser hanya mengambil anak dari parent terpilih; daftar desa dibatasi 30 hasil dan pencarian memakai prefix.

### Backend
- Database kandidat, draft, hasil DISC, karyawan, admin, dan versi master cetak.
- Private Storage bucket CV (PDF maks. 10 MB) dan KTP (JPG/PNG/WebP maks. 8 MB).
- RPC kandidat untuk menyimpan draft, submit lamaran (validasi objek CV/KTP), membaca status kandidat, mengirim DISC, dan mengambil wilayah/kode pos secara berjenjang.
- RLS untuk data HR/admin.
- Login admin username + PIN, hash bcrypt, lockout setelah 5 percobaan salah selama 15 menit.
- Supabase Auth session dibuat otomatis pada login pertama oleh Edge Function. Tidak perlu membuat akun Auth atau UUID admin secara manual.

## Peningkatan form kandidat

Perubahan database terbaru diterapkan melalui migration berikut (bukan dengan menjalankan ulang `SETUP-ALL-IN-ONE.sql` pada project yang sudah berjalan):

- `supabase/migrations/20261113122500_form_ocr_regions.sql`
- `supabase/migrations/20261113124500_experience_duration.sql`

Data referensi wilayah telah diimpor ke tabel `regions_provinces`, `regions_regencies`, `regions_districts`, dan `regions_villages`. RPC wilayah tersedia melalui `list_region_provinces`, `list_region_regencies`, `list_region_districts`, `list_region_villages`, dan `get_region_postal_code`.

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

- Foto KTP diunggah ke bucket privat `candidate-identity` sebelum OCR, dan `applicants.ktp_path` menyimpan path untuk pemeriksaan HR. HR membuka foto melalui signed URL yang berlaku singkat.
- OCR mencoba Edge Function `ktp-ocr` (proxy ke server OCR Python) lalu fallback Tesseract.js di browser. Maksimal tiga percobaan foto; setelah tiga kegagalan, kandidat dapat melanjutkan manual sementara foto tetap dipertahankan. Kandidat tetap wajib memeriksa seluruh hasil OCR.
- Edge Function `ktp-ocr` aktif, tetapi server OCR Python adalah service terpisah yang perlu dijalankan pada hosting/mesin sendiri. Lihat `services/ktp-ocr/README.md`. Tambahkan secrets `KTP_OCR_API_URL` (URL HTTPS service OCR) dan `KTP_OCR_API_KEY` (secret yang sama dengan container) pada Supabase → Edge Functions → Secrets. Tanpa secrets/service yang aktif, aplikasi tetap memakai OCR browser gratis.
- Draft tersimpan di perangkat yang sama dan Supabase. Draft lokal bisa dipulihkan setelah reload selama browser/site data tidak dihapus. Draft tidak otomatis berpindah ke perangkat lain.
- Token kandidat tidak ditampilkan di URL. `/disc/` membaca token sesi yang tersimpan pada browser yang sama. Kandidat sebaiknya melanjutkan proses di perangkat/browser tempat formulir dikirim.
- CV disimpan pada bucket privat `candidate-files`; PDF maksimum 10 MB. Foto KTP ada pada bucket privat `candidate-identity`; maksimum 8 MB.
- Periode pengalaman kerja diisi bulan/tahun mulai dan selesai; durasi bulan dihitung backend saat lamaran dikirim. Jika masih bekerja, backend memakai bulan berjalan.
- Master HTML cetak harus mempertahankan atribut `name` dan `id="applicationForm"` agar data lama tetap bisa dicetak. Template bawaan sudah disesuaikan dengan field baru. Perubahan CSS, warna, logo, header, layout, dan ukuran kertas boleh dilakukan.
- Master wilayah yang dipasang berasal dari [awanaprilino/wilayah-administrasi-kemendagri](https://github.com/awanaprilino/wilayah-administrasi-kemendagri), berbasis Kepmendagri 300.2.2-2138 Tahun 2025. Validasi dan perbarui data terhadap rilis resmi Kemendagri terbaru secara berkala; kode pos perlu diverifikasi bila ada pemekaran/perubahan.
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
- `supabase/functions/ktp-ocr/index.ts` — proxy aman ke service OCR server.
- `supabase/migrations/20261113122500_form_ocr_regions.sql` — tabel wilayah, RPC dropdown, private KTP bucket dan validasi file.
- `supabase/migrations/20261113124500_experience_duration.sql` — perhitungan durasi pengalaman kerja backend.
- `services/ktp-ocr/` — Dockerfile, Compose dan panduan menjalankan arakattack/ocr-ktp.
- `assets/js/admin.js` — dashboard HR.
- `assets/js/print.js` — cetak Lamaran → CV → DISC dan master HTML.
- `supabase/SETUP-ALL-IN-ONE.sql` — satu-satunya setup database untuk project baru.
- `supabase/functions/admin-login/index.ts` — kode Edge Function untuk Dashboard editor.
- `supabase/GANTI-PIN-ADMIN.sql` — mengganti PIN admin di kemudian hari melalui SQL Editor tanpa menyentuh tabel kandidat.
- `docs/PANDUAN-INSTALL-UI.md` — petunjuk visual langkah demi langkah tanpa terminal.
