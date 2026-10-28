import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import {hostPage} from '../public/host-pages.js';

const assets = new URL('../public/', import.meta.url);
const slugs = ['teh', 'tebu', 'kopi', 'kakao', 'tembakau', 'hore'];

test('Host and six team pages reference existing same-origin assets', async () => {
  for (const page of ['index.html', ...slugs.map(slug => 'tim/' + slug + '.html')]) {
    const html = await readFile(new URL(page, assets), 'utf8');
    assert.match(html, /lang="id"/);
    for (const match of html.matchAll(new RegExp('(?:src|href)="(/[^"#]*)"', 'g'))) {
      if(['edit','extra'].includes(hostPage(match[1])))continue;
      await access(new URL('.' + match[1], assets));
    }
    assert.doesNotMatch(html, /claude\.ai|window\.claude/);
  }
});

test('Host retains the mockup board, animation, palette and projector layout stylesheet', async () => {
  const css = await readFile(new URL('host.css', assets), 'utf8');
  for (const required of ['--bg:', '--gold:', '--font-display:', '.board-frame', '.slot-inner', '.face', '.mode-play #view-play', 'rotateX(180deg)', 'aspect-ratio: 16 / 9']) {
    assert.ok(css.includes(required), 'Missing mockup styling: ' + required);
  }
});

test('Static host controls referenced by code exist in the host document', async () => {
  const html = await readFile(new URL('index.html', assets), 'utf8');
  const source = await readFile(new URL('host.js', assets), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  for (const match of source.matchAll(/\$\(['"]#([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
    assert.ok(ids.has(match[1]), 'Missing control #' + match[1]);
  }
  const publicSources = await Promise.all(['host.js', 'team.js', 'client.js'].map(name => readFile(new URL(name, assets), 'utf8')));
  for (const content of publicSources) assert.doesNotMatch(content, /window\.claude|SAMPLE_TEXT|HOST_PASSWORD|SESSION_SECRET/);
});
