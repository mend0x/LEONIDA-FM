import test from 'node:test';
import assert from 'node:assert/strict';
import { readCsv, detectFormat, safeBase, parseArgs } from '../scripts/descargar-canciones.mjs';

test('lee CSV UTF-8 con acentos, comillas y punto y coma', () => {
  const rows = readCsv('\uFEFFArtista;Cancion;URL\r\n"Beyoncé";"A;B";"https://ejemplo.com/a.mp3"\r\n');
  assert.deepEqual(rows, [{ Artista: 'Beyoncé', Cancion: 'A;B', URL: 'https://ejemplo.com/a.mp3' }]);
});

test('rechaza CSV mal formado', () => {
  assert.throws(() => readCsv('A;B\n"sin cerrar;valor'), /comillas sin cerrar/);
  assert.throws(() => readCsv('A;B\n1\n'), /columnas desiguales/);
});

test('limpia caracteres no admitidos en Windows', () => {
  assert.equal(safeBase('Artista: Canción? <live>. '), 'Artista- Canción- -live-');
});

test('detecta archivos de audio frente a páginas HTML', () => {
  assert.equal(detectFormat(Buffer.from('49443304000000000000', 'hex')), '.mp3');
  assert.equal(detectFormat(Buffer.from('664c6143', 'hex')), '.flac');
  assert.equal(detectFormat(Buffer.from('3c68746d6c3e', 'hex')), null);
});

test('restringe carpeta y parámetros del descargador', () => {
  assert.deepEqual(parseArgs(['--check', '--only-folder', 'flash-fm', '--limit', '3']), { check: true, allowHttp: false, only: 'flash-fm', limit: 3 });
  assert.throws(() => parseArgs(['--only-folder', '../private']), /Carpeta inválida/);
});
