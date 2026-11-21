import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createSongLibrary, matchTrack } from '../server/song-library.mjs';
import { createNodeHandler } from '../server/node.mjs';

const catalog = {
  stations: [
    {
      slug: 'flash-fm',
      name: 'Flash FM',
      tracks: [
        { title: 'Electric Feel', artist: 'MGMT', confidence: 'OFFICIAL' },
        { title: 'Good Ones', artist: 'Charli xcx', confidence: 'OFFICIAL' },
      ],
    },
    { slug: 'the-wipe', name: 'The Wipe', tracks: [] },
  ],
};

test('filename matching is exact and accent-insensitive', () => {
  assert.equal(
    matchTrack('MGMT - Electric Feel.mp3', catalog.stations[0].tracks).title,
    'Electric Feel',
  );
  assert.equal(
    matchTrack('01 - Charli xcx - Good Ones.M4A', catalog.stations[0].tracks).title,
    'Good Ones',
  );
  assert.equal(matchTrack('Random other song.mp3', catalog.stations[0].tracks), null);
});

test('the API catalogs real files, excludes metadata and supports byte ranges, no arbitrary paths', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'leonida-song-test-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'flash-fm'));
  await mkdir(join(root, 'the-wipe'));
  await writeFile(
    join(root, 'flash-fm', 'MGMT - Electric Feel.mp3'),
    Buffer.from('abcdefghijklmnop'),
  );
  await writeFile(join(root, 'flash-fm', 'LISTA-DE-CANCIONES.txt'), 'Not audio');
  await writeFile(join(root, 'flash-fm', 'Random one.m4a'), Buffer.from('other'));
  await symlink(
    join(root, 'flash-fm', 'MGMT - Electric Feel.mp3'),
    join(root, 'flash-fm', 'unsafe.mp3'),
  );
  const library = createSongLibrary({ catalog, root });
  const manifest = await library.list('flash-fm');
  assert.equal(manifest.totalCatalog, 2);
  assert.equal(manifest.available, 2);
  assert.equal(manifest.matched, 1);
  assert.deepEqual(manifest.missing, [{ artist: 'Charli xcx', title: 'Good Ones' }]);
  assert.equal((await library.list('the-wipe')).available, 0);
  assert.equal(await library.list('fake-station'), null);
  const api = async () => new Response('Not found', { status: 404 });
  api.close = () => {};
  const handler = createNodeHandler({ api, catalog, songLibraryRoot: root });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(url + '/api/song-library/flash-fm');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).matched, 1);
  const audio = await fetch(url + '/canciones/flash-fm/MGMT%20-%20Electric%20Feel.mp3', {
    headers: { Range: 'bytes=2-5' },
  });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get('content-range'), 'bytes 2-5/16');
  assert.equal(await audio.text(), 'cdef');
  assert.equal((await fetch(url + '/canciones/flash-fm/unsafe.mp3')).status, 404);
  assert.equal((await fetch(url + '/canciones/no-such/anything.mp3')).status, 404);
  assert.equal((await fetch(url + '/canciones/flash-fm/LISTA-DE-CANCIONES.txt')).status, 404);
});
