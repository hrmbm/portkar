# Panduan pemasangan Portal Karir — UI saja, tanpa Terminal

Dokumen ini untuk pemasangan baru. Tidak perlu membuka Command Prompt, PowerShell, Terminal, atau memakai Supabase CLI.

## A. Buat project Supabase baru

1. Buka https://supabase.com/dashboard.
2. Klik **New project**.
3. Pilih organisasi, isi nama project, password database, dan region terdekat.
4. Tunggu sampai status project tersedia.

Simpan password database di tempat aman. Password ini tidak dimasukkan ke frontend.

## B. Jalankan database lengkap (cukup satu file)

1. Dari menu kiri project, buka **SQL Editor**.
2. Klik **New query**.
3. Di komputer, buka file `supabase/SETUP-ALL-IN-ONE.sql` dengan Notepad atau editor teks.
4. Cari baris berikut di bagian paling bawah sebelum blok `begin` admin pertama:

   `v_username text := lower(btrim('Admin'));`

   `v_pin text := 'GANTI_PIN_6_ANGKA';`

   `v_display_name text := 'Administrator';`

5. Ganti hanya PIN menjadi PIN pilihan Anda, 4–12 angka. Contoh format: `'804216'`. Pertahankan tanda kutip tunggal. Username `Admin` boleh dibiarkan; sistem otomatis mengubahnya menjadi `admin`.
6. Salin seluruh isi SQL, tempel di SQL Editor, lalu klik **Run**.
7. Pastikan hasil paling bawah menampilkan `admin` pada kolom username dan `Administrator` pada display_name.

Jika SQL berhenti dengan error, jangan lanjut ke deploy function. Salin pesan error lengkap untuk diperiksa.

## C. Buat Edge Function langsung di Dashboard

1. Buka **Edge Functions** pada menu kiri.
2. Klik **Deploy a new function**.
3. Pilih **Via Editor**.
4. Nama fungsi: `admin-login`.
5. Editor menampilkan contoh kode. Hapus contoh tersebut.
6. Buka file `supabase/functions/admin-login/index.ts` di komputer menggunakan Notepad atau editor teks.
7. Salin seluruh isinya dan tempel ke editor Supabase.
8. Klik **Deploy function**.
9. Setelah fungsi muncul pada daftar, buka fungsi `admin-login`.
10. Buka tab **Details** dan matikan toggle **Verify JWT / Enforce JWT Verification**. Simpan perubahan jika diminta.

Mengapa Verify JWT dimatikan? Halaman login harus memanggil fungsi sebelum admin mempunyai sesi Auth. Fungsi tetap memeriksa header Publishable key dan memvalidasi PIN di backend. Jangan mematikan pemeriksaan JWT untuk fungsi lain tanpa alasan.

## D. Pastikan Email provider aktif (untuk sesi internal)

1. Buka **Authentication**.
2. Buka **Sign In / Providers**.
3. Pastikan **Email** aktif.
4. Portal tidak meminta email admin. Email internal `username@portal.internal` dibuat oleh Edge Function saat login username/PIN pertama kali.

## E. Pasang URL dan Publishable key pada HTML

1. Buka **Project Settings → API Keys** (atau tombol **Connect** jika dashboard menampilkan panel koneksi).
2. Salin **Project URL**.
3. Salin **Publishable key** yang diawali `sb_publishable_`.
4. Buka file `assets/js/config.js`.
5. Ganti nilai `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY`.
6. Simpan file.

Contoh bentuknya (bukan key yang bisa dipakai):

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xxxxxxxxx';
```

JANGAN menyalin Secret key (`sb_secret_...`) ke sini.

## F. Upload ke GitHub tanpa Git / Terminal

1. Ekstrak ZIP Portal Karir di komputer.
2. Buka repository GitHub yang akan dipakai. Untuk instalasi benar-benar bersih, buat repository baru.
3. Di halaman utama repository, klik **Add file → Upload files**.
4. Buka folder hasil ekstrak. Masuk ke folder `portal-karir` (folder yang di dalamnya ada `index.html`, `apply`, `form`, `disc`, `spm`, `assets`, `templates`).
5. Seret seluruh isi folder tersebut ke area upload GitHub. Jangan unggah folder ZIP sebagai satu file.
6. Pastikan struktur `index.html`, `assets/`, `form/`, `disc/`, dan `spm/` berada langsung di root repository, bukan di dalam folder bersarang `portal-karir/portal-karir/`.
7. Isi commit message, lalu klik **Commit changes**.
8. Buka **Settings → Pages**.
9. Pada **Build and deployment**, Source pilih **Deploy from a branch**.
10. Branch pilih `main`, folder pilih `/ (root)`, lalu klik **Save**.
11. Setelah status deployment berhasil, buka URL Pages.

GitHub web upload mendukung unggah folder melalui drag-and-drop browser. Paket ini berada di bawah batas jumlah file upload browser GitHub.

## G. Tes login

1. Buka dashboard Pages pada layar desktop (lebar minimal 1024 px).
2. Username: `admin` (atau username yang Anda tulis pada SQL).
3. PIN: PIN yang sama dengan nilai `v_pin` pada SQL.
4. Klik Masuk.

Pada login pertama, fungsi `admin-login` membuat akun Auth internal dan baris `admin_users` otomatis. Anda tidak perlu membuat user Auth, memasukkan email, atau menyalin UUID.

## H. Tes kandidat di ponsel

1. Buka `.../form/` melalui HTTPS dari ponsel.
2. Izinkan akses kamera.
3. Posisikan KTP pada bingkai horizontal, ambil foto, periksa hasil OCR.
4. Lanjutkan pengisian. Perubahan otomatis tersimpan.
5. Refresh untuk tes pemulihan draft.
6. Upload CV PDF pada langkah lampiran dan kirim lamaran.
7. Kandidat melanjutkan DISC dari browser/perangkat yang sama melalui `.../disc/`.

## I. Tes function lewat Dashboard (opsional)

Buka Edge Functions → `admin-login` → **Test**.

- Method: `POST`
- Header `apikey`: isi Publishable key project
- Header `Content-Type`: `application/json`
- Body:

```json
{
  "username": "Admin",
  "pin": "PIN_YANG_ANDA_BUAT"
}
```

Jika berhasil, respons memuat `ok: true` dan sesi Supabase. Jangan mempublikasikan atau mengirim access token/refresh token kepada orang lain.

## J. Bila error username format terjadi lagi

Script setup yang baru menyimpan `lower(trim(username))`. Jadi input `Admin` akan menjadi `admin`, bukan `Admin`. Jangan menjalankan SQL login versi lama. Gunakan hanya `supabase/SETUP-ALL-IN-ONE.sql` dari paket v1.0.0 ini.

## K. Ganti PIN setelah aplikasi berjalan

1. Buka Supabase → SQL Editor → New query.
2. Buka `supabase/GANTI-PIN-ADMIN.sql`.
3. Ubah PIN dan username pada bagian atas file.
4. Run. Pada login berikutnya, Edge Function memperbarui kata sandi internal Auth secara otomatis.
