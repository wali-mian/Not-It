// House code hashing and signed session tokens, using only WebCrypto.

const encoder = new TextEncoder();
// Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(byteLength: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function hashCode(code: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

export async function verifyCode(code: string, saltHex: string, expectedHash: string): Promise<boolean> {
  return safeEqual(await hashCode(code, saltHex), expectedHash);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function createSession(memberId: number, expiresAtMs: number, secret: string): Promise<string> {
  const payload = `${memberId}.${expiresAtMs}`;
  return `${payload}.${await sign(payload, secret)}`;
}

/** Returns the member id for a valid, unexpired token, otherwise null. */
export async function readSession(token: string, secret: string, nowMs: number): Promise<number | null> {
  const [memberId, expiresAt, signature] = token.split('.');
  if (!memberId || !expiresAt || !signature) return null;
  if (!safeEqual(await sign(`${memberId}.${expiresAt}`, secret), signature)) return null;
  if (Number(expiresAt) <= nowMs) return null;
  return Number(memberId);
}
