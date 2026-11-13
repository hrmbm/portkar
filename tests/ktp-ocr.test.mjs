import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKtpText, formatKtpAddress } from '../assets/js/ktp-ocr.js';

test('membaca bidang identitas dan komponen alamat dari pola KTP contoh', () => {
  const text = `PROVINSI JAWA TIMUR
KABUPATEN MALANG
NIK : 3507 2717 0101 0002
Nama : SAMSUL HARIYADI
Tempat/Tgl Lahir : MALANG, 17-01-1991
Jenis Kelamin : LAKI-LAKI Gol. Darah :
Alamat : DSN. SUMBERGONDO
RT/RW : 026/008
Kel/Desa : WATUREJO
Kecamatan : NGANTANG
Agama : ISLAM
Status Perkawinan : KAWIN
Pekerjaan : KARYAWAN SWASTA
Kewarganegaraan : WNI
Berlaku Hingga : SEUMUR HIDUP`;
  const data = extractKtpText(text);
  assert.equal(data.nik, '3507271701010002');
  assert.equal(data.nama, 'Samsul Hariyadi');
  assert.equal(data.tempat_lahir, 'Malang');
  assert.equal(data.tanggal_lahir, '1991-01-17');
  assert.equal(data.gender, 'L');
  assert.equal(data.alamat_tipe, 'Dusun');
  assert.equal(data.alamat_jalan, 'SUMBERGONDO');
  assert.equal(data.alamat_rt, '026');
  assert.equal(data.alamat_rw, '008');
  assert.equal(data.alamat_desa, 'Waturejo');
  assert.equal(data.alamat_wilayah_type, undefined);
  assert.equal(data.alamat_kecamatan, 'Ngantang');
  assert.equal(data.alamat_kota_jenis, 'Kabupaten');
  assert.equal(data.alamat_kota_nama, 'Malang');
  assert.equal(data.alamat_provinsi, 'Jawa Timur');
  assert.equal(data.agama, 'Islam');
  assert.equal(data.status_kawin, 'Kawin');
  assert.equal(data.warga_negara, 'WNI');
});

test('format alamat menyusun elemen KTP dalam susunan baku dan mengisi nol RT/RW', () => {
  assert.equal(formatKtpAddress({
    alamat_jalan:'SUMBERGONDO', alamat_tipe:'Dusun', alamat_rt:'26', alamat_rw:'8',
    alamat_desa:'WATUREJO', alamat_kecamatan:'NGANTANG',
    alamat_kota_jenis:'Kabupaten', alamat_kota_nama:'MALANG', alamat_provinsi:'JAWA TIMUR', alamat_kodepos:'65100'
  }), 'Dusun Sumbergondo, RT 026/RW 008, Desa/Kel. Waturejo, Kec. Ngantang, Kab. Malang, Jawa Timur, 65100');
});

test('tidak mengarang identitas ketika hasil OCR kosong', () => {
  const data = extractKtpText('teks tidak terbaca');
  assert.equal(data.nik, undefined);
  assert.equal(data.nama, undefined);
  assert.equal(data.warga_negara, 'WNI');
});

test('mengenali status kawin, agama, golongan darah dan WNA', () => {
  const data = extractKtpText('AGAMA : KATOLIK\nSTATUS PERKAWINAN : CERAI HIDUP\nKEWARGANEGARAAN : WNA\nGol. Darah : AB');
  assert.equal(data.agama, 'Katolik');
  assert.equal(data.status_kawin, 'Cerai hidup');
  assert.equal(data.warga_negara, 'WNA');
  assert.equal(data.gol_darah, 'AB');
});

test('nama label lengkap tetap dibaca', () => {
  const data = extractKtpText('NAMA LENGKAP : BUDI SANTOSO');
  assert.equal(data.nama, 'Budi Santoso');
});
