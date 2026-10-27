import { fail } from './game-engine.js';

const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function key(secret) {
  if (!secret || secret.length < 32) fail('CONFIG', 'SESSION_SECRET belum diatur.', 503);
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(session, secret) {
  const body = b64(encoder.encode(JSON.stringify(session)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body));
  return body + '.' + b64(new Uint8Array(signature));
}

export async function verifySession(token, secret) {
  try {
    const [body, signature, ...rest] = String(token || '').split('.');
    if (rest.length || !signature || !await crypto.subtle.verify('HMAC', await key(secret), unb64(signature), encoder.encode(body))) return null;
    const session = JSON.parse(new TextDecoder().decode(unb64(body)));
    const validRole = session.role === 'host' || session.role === 'team' && Number.isInteger(session.team) && session.team >= 0 && session.team < 6;
    return session.exp > Date.now() && validRole ? session : null;
  } catch { return null; }
}

export function sessionCookie(token, url, maxAge = 43200) {
  const address = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
  return 'f100_session=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (address.protocol === 'https:' || !local ? '; Secure' : '');
}

export function cookieToken(request) {
  return request.headers.get('Cookie')?.split(';').map(text => text.trim()).find(text => text.startsWith('f100_session='))?.slice(13) || '';
}

export function checkOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail('ORIGIN', 'Permintaan harus dari situs yang sama.', 403);
}

export async function readJSON(request, maxBytes = 200000) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) fail('INVALID', 'Gunakan JSON.', 415);
  if (Number(request.headers.get('Content-Length') || 0) > maxBytes) fail('SIZE', 'Data terlalu besar.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('INVALID', 'Data kosong.');
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      fail('SIZE', 'Data terlalu besar.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail('INVALID', 'JSON tidak valid.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('INVALID', 'Isi data harus berupa objek JSON.');
  return data;
}

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
});
export const errorResponse = error => json({ error: {
  code: error.code || 'INTERNAL', message: error.code ? error.message : 'Terjadi kesalahan server.'
}}, error.status || 500);

export async function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let index = 0; index < x.length; index++) difference |= x[index] ^ y[index];
  return difference === 0;
}
