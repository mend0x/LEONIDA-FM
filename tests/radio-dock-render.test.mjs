import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Smoke-render the actual component, not a copied mock-up; no browser is needed.
test('compact radio drawer renders in Spanish and keeps its audio mount in DOM', async () => {
  const input = await readFile(new URL('../web/RadioDock.tsx', import.meta.url), 'utf8');
  const transpiled = ts
    .transpileModule(input, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace("import './radio-dock.css';", '')
    .replace("'./ListeningModeToggle'", `"./.mode-toggle-test-${process.pid}.mjs"`);
  const filename = new URL(`../web/.radio-dock-test-${process.pid}.mjs`, import.meta.url);
  const modeFile = new URL(`../web/.mode-toggle-test-${process.pid}.mjs`, import.meta.url);
  try {
    const modeSource = await readFile(
      new URL('../web/ListeningModeToggle.tsx', import.meta.url),
      'utf8',
    );
    const modeCode = ts
      .transpileModule(modeSource, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replace("import './listening-mode.css';", '');
    await writeFile(modeFile, modeCode);
    await writeFile(filename, transpiled);
    const { RadioDock } = await import(filename.href);
    const props = {
      radio: {
        intent: true,
        play() {},
        pause() {},
        attach() {},
        nextTrack() {},
        importFiles() {
          return 0;
        },
        selectProvider() {},
      },
      playback: {
        state: 'playing',
        issue: '',
        attempts: 0,
        kind: 'demo',
        track: { title: 'Test FM', artist: 'Example' },
        index: 0,
        total: 12,
        started: true,
        provider: 'radio-browser',
        videoUrl: '',
        localAvailable: 0,
        resolverAvailable: false,
        streamHomepage: '',
      },
      station: { slug: 'flash-fm', name: 'Flash FM' },
      language: 'es',
      mode: 'demo',
      musicMode: 'radio',
      onMusicModeChange() {},
      onNotice() {},
    };
    const html = renderToStaticMarkup(createElement(RadioDock, props));
    assert.match(html, /class="radio-dock radio-dock-visible"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /hidden=""/);
    assert.match(html, /Radio en directo independiente/);
    assert.match(html, /aria-label="Pausar audio"/);
    assert.match(html, /Otra señal/);
    assert.doesNotMatch(html, /<iframe/);

    const youtube = renderToStaticMarkup(
      createElement(RadioDock, {
        ...props,
        playback: { ...props.playback, provider: 'youtube' },
      }),
    );
    assert.match(youtube, /aria-expanded="true"/);
    assert.doesNotMatch(youtube, /hidden=""/);
  } finally {
    await unlink(filename).catch(() => {});
    await unlink(modeFile).catch(() => {});
  }
});
