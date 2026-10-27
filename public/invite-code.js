// A UUIDv4 supplies 122 random bits; the second UUID in the original token stays private.
export function shortCode(token) {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.exec(token);
  if (!match) return null;
  const hex = match[1].replace(/-/g, '');
  const bytes = hex.match(/../g).map(byte => parseInt(byte, 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
