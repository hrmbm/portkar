-- GANTI PIN ADMIN TANPA MENGUBAH USERNAME / DATA KANDIDAT
-- Ubah 'admin' ke username Anda bila berbeda, dan isi PIN 4–12 digit.
-- Jalankan dari Supabase Dashboard → SQL Editor.
-- Akun Auth internal akan diselaraskan otomatis pada login berikutnya.

update public.admin_login_credentials
set pin_hash = extensions.crypt('GANTI_PIN_BARU', extensions.gen_salt('bf', 12)),
    failed_attempts = 0,
    locked_until = null,
    updated_at = now()
where username = lower(btrim('admin'))
returning username, display_name, role;
