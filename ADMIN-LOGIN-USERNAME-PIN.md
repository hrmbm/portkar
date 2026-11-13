# Login admin username + PIN (v1.0.0)

- Akun awal pada setup SQL: `admin`.
- Username awal di SQL ditulis `Admin`, lalu otomatis dinormalisasi menjadi lowercase.
- PIN: Anda menentukan sendiri pada variabel `v_pin` di `supabase/SETUP-ALL-IN-ONE.sql` sebelum menjalankan skrip.
- PIN harus 4–12 digit dan disimpan dalam bentuk bcrypt hash.
- Setelah lima PIN salah, akun dikunci selama 15 menit.
- Edge Function `admin-login` membuat akun Supabase Auth internal dan baris `admin_users` otomatis saat login pertama.
- Layar portal hanya meminta username + PIN. Tidak ada email yang perlu diketik admin.

## Instalasi tanpa terminal

Ikuti `docs/PANDUAN-INSTALL-UI.md`, bagian B sampai G. Edge Function dibuat dari **Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor**. Setelah deploy, buka Details fungsi dan matikan Verify JWT agar permintaan login sebelum sesi dapat diterima.

Publishable key digunakan pada frontend. Secret key / service_role hanya dibaca oleh runtime Edge Function Supabase dan tidak pernah ditempatkan di file HTML/JS.
