import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishLicensedLibrary } from './cloudflare-assets.mjs';

test('cloudflare build publishes actual audio and station manifests without requiring browser imports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leonida-cf-'));
  try {
    await mkdir(join(root, 'data'));
    await mkdir(join(root, 'canciones', 'flash-fm'), { recursive: true });
    const catalog = { stations: [{slug:'flash-fm',name:'Flash FM',tracks:[{artist:'Test Artist',title:'Test Song',confidence:'OFFICIAL'}]}] };
    await writeFile(join(root, 'data', 'catalog.json'), JSON.stringify(catalog));
    await writeFile(join(root, 'canciones', 'flash-fm', 'Test Artist - Test Song.mp3'), Buffer.from('sample-fixture-audio'));
    const data = await publishLicensedLibrary({root,minimumTracks:1,pullLfs:false});
    assert.equal(data.tracks,1);
    const manifest = JSON.parse(await readFile(join(root,'dist','client','library','flash-fm.json'),'utf8'));
    assert.equal(manifest.available,1);
    assert.equal(manifest.matched,1);
    assert.equal(manifest.songs[0].url,'/canciones/flash-fm/Test%20Artist%20-%20Test%20Song.mp3');
    const track = await readFile(join(root,'dist','client','canciones','flash-fm','Test Artist - Test Song.mp3'));
    assert.equal(track.toString(),'sample-fixture-audio');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('cloudflare build stops when Git LFS pointers remain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leonida-cf-'));
  try {
    await mkdir(join(root,'data'));
    await mkdir(join(root,'canciones','flash-fm'), { recursive: true });
    await writeFile(join(root,'data','catalog.json'),JSON.stringify({stations:[{slug:'flash-fm',name:'Flash FM',tracks:[]}]}));
    await writeFile(join(root,'canciones','flash-fm','track.mp3'), 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1234\n');
    await assert.rejects(() => publishLicensedLibrary({root,minimumTracks:1,pullLfs:false}),/Git LFS devolvió un puntero/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('cloudflare build refuses deployments missing licensed tracks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leonida-cf-'));
  try {
    await mkdir(join(root,'data'));
    await mkdir(join(root,'canciones','flash-fm'), { recursive: true });
    await writeFile(join(root,'data','catalog.json'), JSON.stringify({stations:[{slug:'flash-fm',name:'Flash FM',tracks:[]}]}));
    await assert.rejects(() => publishLicensedLibrary({root,minimumTracks:235,pullLfs:false}),/Biblioteca incompleta/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
