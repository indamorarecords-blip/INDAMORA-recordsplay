import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  derivePasswordHash,
  newCardNumber,
  newPin,
  newQrReference,
  qrUrl,
} from './security.js';
import type { GiftcardAdmin } from './security.js';
import type { Request } from 'express';

export const MINIMUM_CARD_VALUE_CENTS = 1_000;
export const MAXIMUM_CARD_VALUE_CENTS = 100_000;
export const STANDARD_VALUES_CENTS = [1_000, 2_000, 2_500, 5_000, 10_000];
export const MOCK_PARTNER_LABEL = 'Partenaire fictif — TEST';
const CARD_LIFETIME_MAX_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export interface CreatedCard {
  card: GiftcardRecord;
  pin: string;
}

export interface GiftcardRecord {
  id: number;
  cardNumber: string;
  currency: 'EUR';
  startingBalanceCents: number;
  balanceCents: number;
  status: 'issued' | 'active' | 'blocked' | 'cancelled' | 'spent' | 'expired';
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  qrUrl: string;
}

type CardRow = {
  id: string;
  card_number: string;
  starting_balance_cents: number;
  balance_cents: number;
  status: GiftcardRecord['status'];
  created_at: Date;
  activated_at: Date | null;
  expires_at: Date | null;
  qr_reference: string;
};

function effectiveStatus(row: CardRow): GiftcardRecord['status'] {
  if (
    row.expires_at &&
    row.expires_at.getTime() <= Date.now() &&
    !['cancelled', 'spent'].includes(row.status)
  ) {
    return 'expired';
  }
  return row.status;
}

export function toGiftcard(row: CardRow, request: Request): GiftcardRecord {
  return {
    id: Number(row.id),
    cardNumber: row.card_number,
    currency: 'EUR',
    startingBalanceCents: row.starting_balance_cents,
    balanceCents: row.balance_cents,
    status: effectiveStatus(row),
    createdAt: row.created_at.toISOString(),
    activatedAt: row.activated_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    qrUrl: qrUrl(request, row.qr_reference),
  };
}

export function validateAmount(amountCents: number): boolean {
  return (
    Number.isSafeInteger(amountCents) &&
    amountCents >= MINIMUM_CARD_VALUE_CENTS &&
    amountCents <= MAXIMUM_CARD_VALUE_CENTS
  );
}

export function validateExpiry(
  expiresAt: string | null | undefined,
): Date | null | undefined {
  if (expiresAt === undefined) return undefined;
  if (expiresAt === null) return null;
  const date = new Date(expiresAt);
  const remaining = date.getTime() - Date.now();
  if (!Number.isFinite(date.getTime()) || remaining <= 0) return undefined;
  if (remaining > CARD_LIFETIME_MAX_MS) return undefined;
  return date;
}

export async function createGiftcardInTransaction(
  client: PoolClient,
  admin: GiftcardAdmin,
  request: Request,
  amountCents: number,
  expiresAt: Date | null,
  activateNow: boolean,
): Promise<CreatedCard> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cardNumber = newCardNumber();
    const pin = newPin();
    const qrReference = newQrReference();
    const pinHash = await derivePasswordHash(pin);

    try {
      await client.query('SAVEPOINT giftcard_issue_attempt');
      const inserted = await client.query<CardRow>(
        `INSERT INTO giftcard_cards
          (card_number, pin_salt, pin_hash, qr_reference,
           starting_balance_cents, balance_cents, status, created_by,
           activated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7,
                 CASE WHEN $8 THEN NOW() ELSE NULL END, $9)
         RETURNING id, card_number, starting_balance_cents, balance_cents,
                   status, created_at, activated_at, expires_at, qr_reference`,
        [
          cardNumber,
          pinHash.salt,
          pinHash.hash,
          qrReference,
          amountCents,
          activateNow ? 'active' : 'issued',
          admin.id,
          activateNow,
          expiresAt,
        ],
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO giftcard_transactions
          (card_id, kind, amount_cents, balance_after_cents, note, created_by)
         VALUES ($1, 'issue', $2, $2, 'Émission TEST', $3)`,
        [row.id, amountCents, admin.id],
      );
      await client.query(
        `INSERT INTO giftcard_audit_log
          (admin_id, action, card_id, details)
         VALUES ($1, 'card_issued', $2, $3::jsonb)`,
        [
          admin.id,
          row.id,
          JSON.stringify({ amountCents, activated: activateNow }),
        ],
      );
      await client.query('RELEASE SAVEPOINT giftcard_issue_attempt');
      return { card: toGiftcard(row, request), pin };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        attempt < 4
      ) {
        await client.query('ROLLBACK TO SAVEPOINT giftcard_issue_attempt');
        await client.query('RELEASE SAVEPOINT giftcard_issue_attempt');
        continue;
      }
      throw error;
    }
  }
  throw new Error('Impossible de générer un identifiant de carte unique.');
}

export async function withTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function logAdminAction(
  pool: Pool,
  admin: GiftcardAdmin,
  action: string,
  cardId: number | null,
  details: Record<string, string | number | boolean | null>,
): Promise<void> {
  await pool.query(
    `INSERT INTO giftcard_audit_log (admin_id, action, card_id, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [admin.id, action, cardId, JSON.stringify(details)],
  );
}

export function newIdempotencyKey(): string {
  return randomBytes(24).toString('hex');
}
