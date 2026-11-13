# Import master wilayah dan kode pos

Project Supabase PORTKAR yang sudah terhubung pada implementasi ini telah diisi dan diverifikasi. Untuk project Supabase baru, lakukan langkah berikut setelah menjalankan `SETUP-ALL-IN-ONE.sql` dan seluruh migration pada `supabase/migrations/`.

## Sumber CSV

Gunakan snapshot wilayah pada [awanaprilino/wilayah-administrasi-kemendagri](https://github.com/awanaprilino/wilayah-administrasi-kemendagri), yang menyatakan sumbernya adalah Kepmendagri 300.2.2-2138 Tahun 2025.

Unduh empat CSV dari folder `csv/`:

1. [provinces.csv](https://raw.githubusercontent.com/awanaprilino/wilayah-administrasi-kemendagri/main/csv/provinces.csv)
2. [regencies.csv](https://raw.githubusercontent.com/awanaprilino/wilayah-administrasi-kemendagri/main/csv/regencies.csv)
3. [districts.csv](https://raw.githubusercontent.com/awanaprilino/wilayah-administrasi-kemendagri/main/csv/districts.csv)
4. [villages.csv](https://raw.githubusercontent.com/awanaprilino/wilayah-administrasi-kemendagri/main/csv/villages.csv)

## Urutan import

Di Supabase Dashboard → Table Editor, import setiap CSV ke tabel yang namanya sama dengan awalan `regions_`. Gunakan urutan parent ke child:

- `regions_provinces`
- `regions_regencies`
- `regions_districts`
- `regions_villages`

Pastikan kolom CSV dipetakan berdasarkan header, bukan posisi. Header sumber:

- `provinces.csv`: `id,code,name`
- `regencies.csv`: `id,province_id,code,name`
- `districts.csv`: `id,regency_id,code,name`
- `villages.csv`: `id,district_id,code,name,postal_code`

Pada tabel desa/kelurahan, kolom `area_type` tidak ada pada CSV dan akan memakai default sementara. Setelah import, jalankan SQL berikut di SQL Editor untuk membedakan kode kelurahan (`1001`) dan desa (`2001`) yang digunakan pada snapshot sumber:

```sql
update public.regions_villages
set area_type = case
  when right(id, 4) like '1%' then 'Kelurahan'
  else 'Desa'
end;
```

Verifikasi jumlah data dan kode pos:

```sql
select
  (select count(*) from public.regions_provinces) as provinces,
  (select count(*) from public.regions_regencies) as regencies,
  (select count(*) from public.regions_districts) as districts,
  (select count(*) from public.regions_villages) as villages,
  (select count(*) from public.regions_villages where postal_code is not null) as villages_with_postal;
```

Snapshot yang digunakan saat implementasi menghasilkan 38 provinsi, 514 kabupaten/kota, 7.285 kecamatan, 83.762 desa/kelurahan, dan 83.762 desa/kelurahan dengan kode pos.

## Pembaruan data

Snapshot ini bukan pengganti rekonsiliasi berkala dengan data resmi terbaru. Sebelum mengubah master produksi, cocokkan kode/nama wilayah terhadap keputusan Kemendagri terbaru dan dataset kode pos yang terverifikasi. Dataset kode pos di data.go.id yang diperbarui 18 Oktober 2026 masih mencatat metadata referensi Kemendagri 137/2017 dan menyebut dataset sedang dalam pemenuhan prinsip Satu Data Indonesia; karena itu jangan menganggap tanggal modifikasi sebagai bukti semua kode sudah tersinkron dengan kode administrasi terbaru.

Jangan menghapus baris lama sebelum memeriksa kandidat yang sudah menyimpan alamat wilayah. Jika ada pemekaran, siapkan pemetaan/alias untuk ID lama supaya draft kandidat dapat dipulihkan.
