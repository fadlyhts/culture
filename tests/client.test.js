import test from 'node:test';
import assert from 'node:assert/strict';
import { api, LiveGame } from '../public/client.js';

const original = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, EventSource: globalThis.EventSource, location: globalThis.location, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
function harness(fetcher) {
  const sockets = [], sources = [], timers = [];
  globalThis.location = { protocol: 'https:', host: 'quiz.example' };
  globalThis.fetch = fetcher;
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; sockets.push(this); }
    close() { this.closed = true; this.onclose?.({ code: 1000 }); }
  };
  globalThis.EventSource = class {
    constructor(url) { this.url = url; sources.push(this); }
    close() { this.closed = true; }
  };
  globalThis.setTimeout = (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; };
  globalThis.clearTimeout = timer => { if (timer) timer.cancelled = true; };
  return { sockets, sources, timers, restore() { for (const [name, value] of Object.entries(original)) globalThis[name] = value; } };
}

test('Client API keeps cookies same-origin and returns structured server errors', async () => {
  const requests = [];
  const h = harness(async (path, options) => {
    requests.push({ path, options });
    return new Response(JSON.stringify({ error: { code: 'LOCKED', message: 'Jawaban sudah dikunci.' } }), { status: 409 });
  });
  try {
    await assert.rejects(() => api('/api/team/submit', { text: 'Tas' }), { code: 'LOCKED', message: 'Jawaban sudah dikunci.' });
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), { text: 'Tas' });
  } finally { h.restore(); }
});

test('Live client resynchronizes after disconnect and stops on revoked sessions', async () => {
  let revision = 1;
  const h = harness(async () => new Response(JSON.stringify({ revision: revision++ })));
  const states = [], statuses = [];
  let auth = 0;
  const live = new LiveGame(state => states.push(state), (text, online) => statuses.push({ text, online }), () => auth++);
  try {
    await live.start();
    assert.equal(h.sockets[0].url, 'wss://quiz.example/api/live');
    h.sockets[0].onopen();
    h.sockets[0].onmessage({ data: JSON.stringify({ type: 'state', state: { revision: 20 } }) });
    assert.deepEqual(states.map(s => s.revision), [1, 20]);
    h.sockets[0].onclose({ code: 1006 });
    assert.equal(h.timers[0].delay, 1000);
    await h.timers[0].callback();
    assert.equal(h.sockets.length, 2);
    assert.equal(states.at(-1).revision, 2);
    h.sockets[1].onclose({ code: 4001 });
    assert.equal(auth, 1);
    assert.equal(live.closed, true);
    assert.equal(h.timers.length, 1);
    assert.ok(statuses.some(s => s.online));
  } finally { live.stop(); h.restore(); }
});

test('Stopping the live client cancels an in-flight snapshot response', async () => {
  let resolveFetch;
  const h = harness(() => new Promise(resolve => { resolveFetch = resolve; }));
  const states = [];
  const live = new LiveGame(state => states.push(state), () => {}, () => {});
  try {
    const loading = live.start();
    live.stop();
    resolveFetch(new Response(JSON.stringify({ revision: 1 })));
    await loading;
    assert.equal(states.length, 0);
    assert.equal(h.sockets.length, 0);
  } finally { live.stop(); h.restore(); }
});

test('Local SSE transport receives snapshots, resynchronizes, ignores stale events and stops on auth', async () => {
  let revision = 1, auth = 0;
  const h = harness(async () => new Response(JSON.stringify({ revision: revision++, transport: 'sse' })));
  const states = [], statuses = [];
  const live = new LiveGame(state => states.push(state), (text, online) => statuses.push({ text, online }), () => auth++);
  try {
    await live.start();
    assert.equal(h.sockets.length, 0);
    assert.equal(h.sources[0].url, '/api/live');
    h.sources[0].onopen();
    h.sources[0].onmessage({ data: JSON.stringify({ type: 'state', state: { revision: 20 } }) });
    assert.deepEqual(states.map(state => state.revision), [1, 20]);
    assert.equal(statuses.at(-1).online, true);
    h.sources[0].onerror();
    assert.equal(h.sources[0].closed, true);
    assert.equal(statuses.at(-1).online, false);
    assert.equal(h.timers[0].delay, 1000);
    h.sources[0].onmessage({ data: JSON.stringify({ type: 'state', state: { revision: 999 } }) });
    assert.equal(states.length, 2);
    await h.timers[0].callback();
    assert.equal(h.sources.length, 2);
    assert.equal(states.at(-1).revision, 2);
    h.sources[1].onmessage({ data: JSON.stringify({ type: 'auth' }) });
    assert.equal(auth, 1);
    assert.equal(live.closed, true);
    assert.equal(h.sources[1].closed, true);
    h.sources[1].onmessage({ data: JSON.stringify({ type: 'state', state: { revision: 1000 } }) });
    assert.equal(states.at(-1).revision, 2);
  } finally { live.stop(); h.restore(); }
});
