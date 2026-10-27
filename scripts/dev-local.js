import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { GameRoom } from '../src/game-room.js';
import { project } from '../src/game-engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 8787);
const envText = await readFile(resolve(root, '.dev.vars'), 'utf8').catch(() => '');
const settings = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) settings[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
const env = {
  HOST_PASSWORD: process.env.HOST_PASSWORD || settings.HOST_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET || settings.SESSION_SECRET
};
if (!env.HOST_PASSWORD || !env.SESSION_SECRET) throw new Error('Set HOST_PASSWORD and SESSION_SECRET in .dev.vars first.');
await mkdir(resolve(root, '.cache'), { recursive: true });
const previewName=process.env.PREVIEW_DB_NAME||'local-game.sqlite';
if(!/^[a-zA-Z0-9_-]+\.sqlite$/.test(previewName))throw new Error('Invalid preview database name.');
const db = new DatabaseSync(resolve(root, '.cache', previewName));
const peers = new Set();
let alarmTimer;
const context = {
  storage: {
    setAlarm(time) { clearTimeout(alarmTimer); alarmTimer=setTimeout(()=>room.alarm(),Math.max(0,time-Date.now())); },
    deleteAlarm() { clearTimeout(alarmTimer); },
    sql: {
      exec(sql, ...parameters) {
        const statement = db.prepare(sql);
        const rows = statement.columns().length ? statement.all(...parameters) : (statement.run(...parameters), []);
        return { toArray: () => rows };
      }
    },
    transactionSync(callback) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = callback(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  },
  getWebSockets: () => [...peers]
};
const room = new GameRoom(context, env);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function asset(request) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return new Response('Bad path', { status: 400 }); }
  let target = resolve(publicRoot, '.' + (path === '/' ? '/index.html' : path));
  if (!target.startsWith(publicRoot + sep)) return new Response('Not found', { status: 404 });
  if (!extname(target)) target += '.html';
  try {
    if (!(await stat(target)).isFile()) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : await readFile(target), {
      headers: { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }
    });
  } catch { return new Response('Not found', { status: 404 }); }
}
env.ASSETS = { fetch: asset };
env.GAME = { idFromName: name => name, get: () => room };

function localSnapshot(state) { return { ...state, transport: 'sse' }; }
function stream(request, response, role) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
    'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
  });
  const peer = {
    deserializeAttachment: () => role,
    send(message) {
      const data = JSON.parse(message);
      if (data.type === 'state') data.state = localSnapshot(data.state);
      response.write('data: ' + JSON.stringify(data) + '\n\n');
    },
    close(code) {
      if (code === 4001) response.write('data: {"type":"auth"}\n\n');
      response.end(); peers.delete(peer);
    }
  };
  peers.add(peer);
  peer.send(JSON.stringify({ type: 'state', state: project(room.state, role) }));
  const heartbeat = setInterval(() => {
    if (!room.validRole(role)) peer.close(4001);
    else response.write(': keep-alive\n\n');
  }, 15000);
  response.on('close', () => { clearInterval(heartbeat); peers.delete(peer); });
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host;
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(host)) {
      outgoing.writeHead(403); outgoing.end('Loopback preview only'); return;
    }
    const url = 'http://' + host + incoming.url;
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 2000000) { outgoing.writeHead(413); outgoing.end('Data too large'); return; }
      chunks.push(chunk);
    }
    const request = new Request(url, {
      method: incoming.method, headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) })
    });
    if (new URL(url).pathname === '/api/live' && incoming.method === 'GET') {
      const origin = request.headers.get('Origin');
      const site = request.headers.get('Sec-Fetch-Site');
      if (origin && origin !== new URL(url).origin || site && !['same-origin', 'none'].includes(site)) {
        outgoing.writeHead(403); outgoing.end('Same origin required'); return;
      }
      stream(request, outgoing, await room.role(request)); return;
    }
    let response = await worker.fetch(request, env);
    if (new URL(url).pathname === '/api/state' && response.ok) {
      response = new Response(JSON.stringify(localSnapshot(await response.json())), { status: response.status, headers: response.headers });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (outgoing.headersSent) { outgoing.end(); return; }
    outgoing.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify({ error: { code: error.code || 'INTERNAL', message: error.code ? error.message : 'Local preview error.' } }));
  }
});
server.listen(port, '127.0.0.1', () => console.log('Local Family 100 preview: http://127.0.0.1:' + port + ' (Node SQLite + SSE)'));
function shutdown() { for (const peer of [...peers]) peer.close(1000); server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
