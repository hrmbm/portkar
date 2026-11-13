import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, computeDisc } from '../assets/js/disc-engine.js';

const validAnswers = Array.from({ length: 24 }, (_, i) => ({ most: i % 4, least: (i + 1) % 4 }));

test('master DISC memiliki 24 kelompok dengan empat pilihan', () => {
  assert.equal(QUESTIONS.length, 24);
  assert.ok(QUESTIONS.every(row => row.length === 4));
});

test('mesin DISC menerima 24 pasangan MOST/LEAST dan membentuk tiga grafik', () => {
  const result = computeDisc(validAnswers);
  assert.equal(result.countP.length, 4);
  assert.equal(result.countK.length, 4);
  assert.equal(result.g1.length, 4);
  assert.equal(result.g2.length, 4);
  assert.equal(result.g3.length, 4);
  assert.equal(result.pola.length, 3);
  assert.ok(['D', 'I', 'S', 'C'].includes(result.hurufDominan));
});

test('mesin DISC menolak data tidak lengkap atau pilihan MOST/LEAST sama', () => {
  assert.throws(() => computeDisc(validAnswers.slice(0, 23)), /24 jawaban/);
  const invalid = validAnswers.map(x => ({ ...x }));
  invalid[7] = { most: 2, least: 2 };
  assert.throws(() => computeDisc(invalid), /soal 8 tidak valid/i);
});
