import {
  createHash,
  randomInt,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';

const HASH_BYTES = 64;
const SESSION_COOKIE = 'giftcard_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, number[]>();
const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export function deriveSecretHash(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

export interface GiftcardAdmin {
  id: number;
  username: string;
  role: 'admin' | 'issuer' | 'viewer';
}

export interface AuthenticatedRequest extends Request {
  giftcardAdmin?: GiftcardAdmin;
}

export async function derivePasswordHash(
  password: string,
  salt: Buffer = randomBytes(16),
): Promise<{ salt: Buffer; hash: Buffer }> {
  const hash = await deriveSecretHash(password, salt);
  return { salt, hash };
}

export function verifySecret(actual: Buffer, expected: Buffer): boolean {
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function digestSession(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeCardNumber(cardNumber: string): string {
  return cardNumber.replace(/[\s-]/g, '').toUpperCase();
}

export function formatCardNumber(raw: string): string {
  const compact = raw.replace(/^IND/i, '').replace(/[^a-f0-9]/gi, '');
  return `IND-${compact.match(/.{1,4}/g)?.join('-') ?? compact}`.toUpperCase();
}

export function newCardNumber(): string {
  return formatCardNumber(randomBytes(8).toString('hex'));
}

export function newPin(): string {
  const value = randomInt(0, 1_000_000);
  return value.toString().padStart(6, '0');
}

export function newQrReference(): string {
  return randomBytes(24).toString('hex');
}

export function allowAttempt(
  key: string,
  maximum: number,
  now = Date.now(),
): boolean {
  for (const [storedKey, timestamps] of attempts) {
    const active = timestamps.filter((at) => now - at < RATE_WINDOW_MS);
    if (active.length === 0) attempts.delete(storedKey);
    else attempts.set(storedKey, active);
  }

  const active = attempts.get(key) ?? [];
  if (active.length >= maximum) return false;
  active.push(now);
  attempts.set(key, active);
  return true;
}

export function requestAddressKey(request: Request): string {
  return request.ip ?? 'unknown';
}

export function qrUrl(request: Request, reference: string): string {
  const forwardedProto = request.get('x-forwarded-proto')?.split(',')[0];
  const forwardedHost = request.get('x-forwarded-host')?.split(',')[0];
  const protocol = forwardedProto || request.protocol;
  const host = forwardedHost || request.get('host');
  if (!host) throw new Error('Origine de requête indisponible pour le QR.');
  const origin = `${protocol}://${host}`;
  return new URL(
    `/carte-cadeau/solde?ref=${encodeURIComponent(reference)}`,
    origin,
  ).toString();
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function setSessionCookie(
  request: Request,
  response: Response,
  token: string,
): void {
  const secure =
    request.secure || request.get('x-forwarded-proto') === 'https';
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(
  request: Request,
  response: Response,
): void {
  const secure =
    request.secure || request.get('x-forwarded-proto') === 'https';
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
  });
}

async function loadAdmin(
  pool: Pool,
  request: Request,
): Promise<GiftcardAdmin | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await pool.query<{
    id: string;
    username: string;
    role: GiftcardAdmin['role'];
  }>(
    `SELECT a.id, a.username, a.role
       FROM giftcard_admin_sessions s
       JOIN giftcard_admins a ON a.id = s.admin_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [digestSession(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: Number(row.id), username: row.username, role: row.role };
}

export function requireSession(pool: Pool) {
  return async (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const admin = await loadAdmin(pool, request);
      if (!admin) {
        response.status(401).json({ error: 'Session administrateur requise.' });
        return;
      }
      request.giftcardAdmin = admin;
      next();
    } catch {
      response.status(503).json({ error: 'Session TEST indisponible.' });
    }
  };
}

export function requireIssuer(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  if (
    request.giftcardAdmin?.role !== 'admin' &&
    request.giftcardAdmin?.role !== 'issuer'
  ) {
    response.status(403).json({ error: 'Accès en lecture seule.' });
    return;
  }
  next();
}

export function requireAdmin(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  if (request.giftcardAdmin?.role !== 'admin') {
    response.status(403).json({ error: 'Droits administrateur requis.' });
    return;
  }
  next();
}

export const sessionDurationMs = SESSION_TTL_MS;
export const maxLoginAttempts = 8;
export const maxBalanceAttempts = 5;
export const maxQrAttempts = 20;
export { SESSION_COOKIE };
