import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  logAdminAction,
  createGiftcardInTransaction,
  MAXIMUM_CARD_VALUE_CENTS,
  MINIMUM_CARD_VALUE_CENTS,
  MOCK_PARTNER_LABEL,
  STANDARD_VALUES_CENTS,
  toGiftcard,
  validateAmount,
  validateExpiry,
  withTransaction,
} from './cards.js';
import {
  allowAttempt,
  clearSessionCookie,
  deriveSecretHash,
  digestSession,
  maxBalanceAttempts,
  maxLoginAttempts,
  maxQrAttempts,
  newSessionToken,
  normalizeCardNumber,
  normalizeUsername,
  qrUrl,
  requestAddressKey,
  requireAdmin,
  requireIssuer,
  requireSession,
  sessionDurationMs,
  setSessionCookie,
  verifySecret,
  type AuthenticatedRequest,
  type GiftcardAdmin,
} from './security.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
}).strict();
const balanceSchema = z.object({
  cardNumber: z.string().trim().min(12).max(24),
  pin: z.string().regex(/^[0-9]{6}$/),
}).strict();
const createCardSchema = z.object({
  amountCents: z.number().int().min(MINIMUM_CARD_VALUE_CENTS).max(MAXIMUM_CARD_VALUE_CENTS),
  expiresAt: z.string().datetime().nullable().optional(),
  activateNow: z.boolean().default(false),
}).strict();
const batchSchema = z.object({
  count: z.number().int().min(1).max(50),
  amountCents: z.number().int().min(MINIMUM_CARD_VALUE_CENTS).max(MAXIMUM_CARD_VALUE_CENTS),
  expiresAt: z.string().datetime().nullable().optional(),
  activateNow: z.boolean().default(false),
}).strict();
const statusSchema = z.object({
  status: z.enum(['issued', 'active', 'blocked', 'cancelled', 'spent', 'expired']),
}).strict();
const redeemSchema = z.object({
  amountCents: z.number().int().positive().max(MAXIMUM_CARD_VALUE_CENTS),
  idempotencyKey: z.string().min(16).max(80),
  note: z.string().trim().max(160).optional(),
}).strict();
const partnerSchema = z.object({ enabled: z.boolean() }).strict();
const giftcardIdSchema = z.coerce.number().int().positive();
const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['issued', 'active', 'blocked', 'cancelled', 'spent', 'expired']).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

interface GiftcardTransactionRow {
  id: string;
  kind: 'issue' | 'redemption' | 'adjustment';
  amount_cents: number;
  balance_after_cents: number;
  partner_label: string | null;
  note: string | null;
  created_at: Date;
}

function invalidBody(response: Response): void {
  response.status(400).json({ error: 'Données invalides.' });
}

function safeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function requestAdmin(request: AuthenticatedRequest): GiftcardAdmin {
  if (!request.giftcardAdmin) throw new Error('Session administrateur manquante.');
  return request.giftcardAdmin;
}

function toSession(admin: GiftcardAdmin) {
  return { username: admin.username, role: admin.role, mode: 'TEST' as const };
}

function transactionResponse(row: GiftcardTransactionRow) {
  return {
    id: Number(row.id),
    kind: row.kind,
    amountCents: row.amount_cents,
    balanceAfterCents: row.balance_after_cents,
    partnerLabel: row.partner_label,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

function safeCsvCell(value: string | number | null): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function adminQrUrl(request: Request, reference: string): string {
  return qrUrl(request, reference);
}

function insertAudit(
  client: Pool | PoolClient,
  admin: GiftcardAdmin,
  action: string,
  cardId: number | null,
  details: Record<string, string | number | boolean | null>,
) {
  return client.query(
    `INSERT INTO giftcard_audit_log (admin_id, action, card_id, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [admin.id, action, cardId, JSON.stringify(details)],
  );
}

async function getCardRow(pool: Pool, cardId: number) {
  const result = await pool.query(
    `SELECT id, card_number, starting_balance_cents, balance_cents, status,
            created_at, activated_at, expires_at, qr_reference
       FROM giftcard_cards
      WHERE id = $1`,
    [cardId],
  );
  return result.rows[0] ?? null;
}

function effectiveStatus(
  status: string,
  expiresAt: Date | null,
): 'issued' | 'active' | 'blocked' | 'cancelled' | 'spent' | 'expired' {
  if (
    expiresAt &&
    expiresAt.getTime() <= Date.now() &&
    !['cancelled', 'spent'].includes(status)
  ) {
    return 'expired';
  }
  return status as ReturnType<typeof effectiveStatus>;
}

function permittedTransition(current: string, next: string): boolean {
  if (current === next) return true;
  const transitions: Record<string, string[]> = {
    issued: ['active', 'blocked', 'cancelled'],
    active: ['blocked', 'cancelled'],
    blocked: ['active', 'cancelled'],
    cancelled: [],
    spent: [],
    expired: [],
  };
  return transitions[current]?.includes(next) ?? false;
}

function handleAsync(
  handler: (request: AuthenticatedRequest, response: Response) => Promise<void>,
) {
  return (
    request: AuthenticatedRequest,
    response: Response,
    next: (error?: unknown) => void,
  ) => {
    void handler(request, response).catch(next);
  };
}

export function createGiftcardApp(pool: Pool) {
  const app = express();
  const authenticated = requireSession(pool);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((request, _response, next) => {
    const prefix = '/carte-cadeau-api';
    if (
      request.url === prefix ||
      request.url.startsWith(`${prefix}/`) ||
      request.url.startsWith(`${prefix}?`)
    ) {
      request.url = request.url.slice(prefix.length) || '/';
    }
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use((request, response, next) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      next();
      return;
    }
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'Seul le format JSON est accepté.' });
      return;
    }
    next();
  });

  app.get(
    '/healthz',
    handleAsync(async (_request, response) => {
      await pool.query('SELECT 1');
      response.json({ status: 'ok', mode: 'TEST' });
    }),
  );

  app.post(
    '/auth/login',
    handleAsync(async (request, response) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        invalidBody(response);
        return;
      }
      const key = `login:${requestAddressKey(request)}`;
      if (!allowAttempt(key, maxLoginAttempts)) {
        response.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
        return;
      }

      const username = normalizeUsername(parsed.data.username);
      const result = await pool.query<{
        id: string;
        username: string;
        role: GiftcardAdmin['role'];
        password_salt: Buffer;
        password_hash: Buffer;
      }>(
        `SELECT id, username, role, password_salt, password_hash
           FROM giftcard_admins
          WHERE username = $1`,
        [username],
      );
      const account = result.rows[0];
      const salt = account?.password_salt ?? Buffer.alloc(16);
      const storedHash = account?.password_hash ?? Buffer.alloc(64);
      const derived = await deriveSecretHash(parsed.data.password, salt);
      if (!account || !verifySecret(derived, storedHash)) {
        response.status(401).json({ error: 'Identifiants invalides.' });
        return;
      }

      const admin: GiftcardAdmin = {
        id: Number(account.id),
        username: account.username,
        role: account.role,
      };
      const token = newSessionToken();
      await pool.query(
        `DELETE FROM giftcard_admin_sessions WHERE expires_at <= NOW()`,
      );
      await pool.query(
        `INSERT INTO giftcard_admin_sessions (token_hash, admin_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '8 hours')`,
        [digestSession(token), admin.id],
      );
      setSessionCookie(request, response, token);
      await logAdminAction(pool, admin, 'admin_login', null, {});
      response.json(toSession(admin));
    }),
  );

  app.get(
    '/auth/session',
    authenticated,
    handleAsync(async (request, response) => {
      response.json(toSession(requestAdmin(request)));
    }),
  );

  app.post(
    '/auth/logout',
    authenticated,
    handleAsync(async (request, response) => {
      const token = request.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('giftcard_admin_session='))
        ?.slice('giftcard_admin_session='.length);
      if (token) {
        await pool.query(
          `DELETE FROM giftcard_admin_sessions WHERE token_hash = $1`,
          [digestSession(decodeURIComponent(token))],
        );
      }
      await logAdminAction(pool, requestAdmin(request), 'admin_logout', null, {});
      clearSessionCookie(request, response);
      response.status(204).end();
    }),
  );

  app.post(
    '/customer/balance',
    handleAsync(async (request, response) => {
      const parsed = balanceSchema.safeParse(request.body);
      if (!parsed.success) {
        invalidBody(response);
        return;
      }
      if (
        !allowAttempt(
          `balance:${requestAddressKey(request)}`,
          maxBalanceAttempts,
        )
      ) {
        response.status(429).json({ error: 'Trop de vérifications. Réessayez plus tard.' });
        return;
      }

      const normalizedNumber = normalizeCardNumber(parsed.data.cardNumber);
      const lookup = await pool.query<{
        id: string;
        card_number: string;
        pin_salt: Buffer;
        pin_hash: Buffer;
        starting_balance_cents: number;
        balance_cents: number;
        status: string;
        created_at: Date;
        activated_at: Date | null;
        expires_at: Date | null;
      }>(
        `SELECT id, card_number, pin_salt, pin_hash,
                starting_balance_cents, balance_cents, status,
                created_at, activated_at, expires_at
           FROM giftcard_cards
          WHERE regexp_replace(card_number, '[^A-Z0-9]', '', 'g') = $1
          LIMIT 1`,
        [normalizedNumber],
      );
      const card = lookup.rows[0];
      const salt = card?.pin_salt ?? Buffer.alloc(16);
      const expected = card?.pin_hash ?? Buffer.alloc(64);
      const actual = await deriveSecretHash(parsed.data.pin, salt);
      if (!card || !verifySecret(actual, expected)) {
        response.status(401).json({ error: 'Numéro de carte ou code PIN invalide.' });
        return;
      }

      const transactionResult = await pool.query<GiftcardTransactionRow>(
        `SELECT t.id, t.kind, t.amount_cents, t.balance_after_cents,
                NULL::text AS partner_label,
                CASE t.kind
                  WHEN 'issue' THEN 'Crédit initial'
                  WHEN 'redemption' THEN 'Utilisation'
                  ELSE 'Opération'
                END AS note,
                t.created_at
           FROM giftcard_transactions t
          WHERE t.card_id = $1
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 5`,
        [card.id],
      );
      response.json({
        cardNumber: card.card_number,
        currency: 'EUR',
        startingBalanceCents: card.starting_balance_cents,
        balanceCents: card.balance_cents,
        status: effectiveStatus(card.status, card.expires_at),
        createdAt: card.created_at.toISOString(),
        activatedAt: card.activated_at?.toISOString() ?? null,
        expiresAt: card.expires_at?.toISOString() ?? null,
        recentTransactions: transactionResult.rows.map(transactionResponse),
        mode: 'TEST',
      });
    }),
  );

  app.get(
    '/customer/qr/:reference',
    handleAsync(async (request, response) => {
      if (
        !allowAttempt(
          `qr:${requestAddressKey(request)}`,
          maxQrAttempts,
        )
      ) {
        response.status(429).json({ error: 'Trop de vérifications. Réessayez plus tard.' });
        return;
      }
      const reference = request.params.reference;
      if (typeof reference !== 'string' || !/^[a-f0-9]{48}$/.test(reference)) {
        response.status(404).json({ error: 'Référence QR introuvable.' });
        return;
      }
      const result = await pool.query<{
        card_number: string;
        status: string;
      }>(
        `SELECT card_number, status
           FROM giftcard_cards
          WHERE qr_reference = $1`,
        [reference],
      );
      const card = result.rows[0];
      if (!card || card.status === 'cancelled') {
        response.status(404).json({ error: 'Référence QR introuvable.' });
        return;
      }
      response.json({ cardNumber: card.card_number });
    }),
  );

  app.get(
    '/admin/dashboard',
    authenticated,
    handleAsync(async (_request, response) => {
      const [totals, activity] = await Promise.all([
        pool.query<{
          total_cards: string;
          active_cards: string;
          blocked_cards: string;
          starting_value: string;
          remaining_value: string;
          redeemed_value: string;
        }>(
          `SELECT COUNT(*)::text AS total_cards,
                  COUNT(*) FILTER (
                    WHERE status = 'active'
                      AND (expires_at IS NULL OR expires_at > NOW())
                  )::text AS active_cards,
                  COUNT(*) FILTER (WHERE status = 'blocked')::text AS blocked_cards,
                  COALESCE(SUM(starting_balance_cents), 0)::text AS starting_value,
                  COALESCE(SUM(balance_cents), 0)::text AS remaining_value,
                  COALESCE((
                    SELECT -SUM(amount_cents)
                      FROM giftcard_transactions
                     WHERE kind = 'redemption'
                  ), 0)::text AS redeemed_value
             FROM giftcard_cards`,
        ),
        pool.query(
          `SELECT l.id, l.action, a.username AS admin_username,
                  c.card_number, l.details, l.created_at
             FROM giftcard_audit_log l
             JOIN giftcard_admins a ON a.id = l.admin_id
             LEFT JOIN giftcard_cards c ON c.id = l.card_id
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT 8`,
        ),
      ]);
      const totalsRow = totals.rows[0];
      response.json({
        totalCards: safeInteger(totalsRow.total_cards),
        activeCards: safeInteger(totalsRow.active_cards),
        blockedCards: safeInteger(totalsRow.blocked_cards),
        startingValueCents: safeInteger(totalsRow.starting_value),
        remainingValueCents: safeInteger(totalsRow.remaining_value),
        redeemedValueCents: safeInteger(totalsRow.redeemed_value),
        mockPartnerLabel: MOCK_PARTNER_LABEL,
        recentActivity: activity.rows.map((row) => ({
          id: Number(row.id),
          action: row.action,
          adminUsername: row.admin_username,
          cardNumber: row.card_number,
          details: row.details ?? {},
          createdAt: row.created_at.toISOString(),
        })),
      });
    }),
  );

  app.get(
    '/admin/cards',
    authenticated,
    handleAsync(async (request, response) => {
      const parsed = listSchema.safeParse(request.query);
      if (!parsed.success) {
        invalidBody(response);
        return;
      }
      const { q, status, offset, limit } = parsed.data;
      const search = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
      const values = [search, status ?? null, limit, offset];
      const [cardsResult, countResult] = await Promise.all([
        pool.query(
          `SELECT id, card_number, starting_balance_cents, balance_cents, status,
                  created_at, activated_at, expires_at, qr_reference
             FROM giftcard_cards
            WHERE ($1::text IS NULL OR card_number ILIKE $1 ESCAPE '\\')
              AND ($2::text IS NULL OR status = $2)
            ORDER BY created_at DESC, id DESC
            LIMIT $3 OFFSET $4`,
          values,
        ),
        pool.query(
          `SELECT COUNT(*)::text AS total
             FROM giftcard_cards
            WHERE ($1::text IS NULL OR card_number ILIKE $1 ESCAPE '\\')
              AND ($2::text IS NULL OR status = $2)`,
          [search, status ?? null],
        ),
      ]);
      response.json({
        cards: cardsResult.rows.map((row) => toGiftcard(row, request)),
        total: safeInteger(countResult.rows[0].total),
      });
    }),
  );

  app.get(
    '/admin/cards/export',
    authenticated,
    handleAsync(async (request, response) => {
      const parsed = listSchema.pick({ q: true, status: true }).safeParse(request.query);
      if (!parsed.success) {
        invalidBody(response);
        return;
      }
      const search = parsed.data.q
        ? `%${parsed.data.q.replace(/[\\%_]/g, '\\$&')}%`
        : null;
      const result = await pool.query(
        `SELECT card_number, starting_balance_cents, balance_cents, status,
                created_at, activated_at, expires_at
           FROM giftcard_cards
          WHERE ($1::text IS NULL OR card_number ILIKE $1 ESCAPE '\\')
            AND ($2::text IS NULL OR status = $2)
          ORDER BY created_at DESC, id DESC
          LIMIT 5000`,
        [search, parsed.data.status ?? null],
      );
      await logAdminAction(
        pool,
        requestAdmin(request),
        'cards_exported',
        null,
        { count: result.rowCount ?? 0 },
      );
      const rows = [
        ['Numéro', 'Valeur initiale EUR', 'Solde EUR', 'Statut', 'Créée le', 'Activée le', 'Expire le'],
        ...result.rows.map((row) => [
          row.card_number,
          (row.starting_balance_cents / 100).toFixed(2),
          (row.balance_cents / 100).toFixed(2),
          effectiveStatus(row.status, row.expires_at),
          row.created_at.toISOString(),
          row.activated_at?.toISOString() ?? '',
          row.expires_at?.toISOString() ?? '',
        ]),
      ];
      const csv = `\uFEFF${rows
        .map((row) => row.map(safeCsvCell).join(';'))
        .join('\r\n')}`;
      response
        .type('text/csv; charset=utf-8')
        .setHeader(
          'Content-Disposition',
          `attachment; filename="cartes-cadeaux-test-${new Date().toISOString().slice(0, 10)}.csv"`,
        )
        .send(csv);
    }),
  );

  app.post(
    '/admin/cards',
    authenticated,
    requireIssuer,
    handleAsync(async (request, response) => {
      const parsed = createCardSchema.safeParse(request.body);
      if (!parsed.success || !validateAmount(parsed.data.amountCents)) {
        invalidBody(response);
        return;
      }
      const expiry = validateExpiry(parsed.data.expiresAt);
      if (expiry === undefined) {
        response.status(400).json({ error: 'Date d’expiration invalide.' });
        return;
      }
      const created = await withTransaction(pool, (client) =>
        createGiftcardInTransaction(
          client,
          requestAdmin(request),
          request,
          parsed.data.amountCents,
          expiry,
          parsed.data.activateNow,
        ),
      );
      response.status(201).json({ ...created, mode: 'TEST' });
    }),
  );

  app.post(
    '/admin/cards/batch',
    authenticated,
    requireIssuer,
    handleAsync(async (request, response) => {
      const parsed = batchSchema.safeParse(request.body);
      if (!parsed.success || !validateAmount(parsed.data.amountCents)) {
        invalidBody(response);
        return;
      }
      const expiry = validateExpiry(parsed.data.expiresAt);
      if (expiry === undefined) {
        response.status(400).json({ error: 'Date d’expiration invalide.' });
        return;
      }
      const cards = await withTransaction(pool, async (client) => {
        const created: Awaited<ReturnType<typeof createGiftcardInTransaction>>[] = [];
        for (let index = 0; index < parsed.data.count; index += 1) {
          created.push(
            await createGiftcardInTransaction(
              client,
              requestAdmin(request),
              request,
              parsed.data.amountCents,
              expiry,
              parsed.data.activateNow,
            ),
          );
        }
        await insertAudit(
          client,
          requestAdmin(request),
          'card_batch_issued',
          null,
          { count: created.length, amountCents: parsed.data.amountCents },
        );
        return created;
      });
      response.status(201).json({ cards, mode: 'TEST' });
    }),
  );

  app.get(
    '/admin/cards/:id',
    authenticated,
    handleAsync(async (request, response) => {
      const cardId = giftcardIdSchema.safeParse(request.params.id);
      if (!cardId.success) {
        response.status(400).json({ error: 'Identifiant invalide.' });
        return;
      }
      const row = await getCardRow(pool, cardId.data);
      if (!row) {
        response.status(404).json({ error: 'Carte introuvable.' });
        return;
      }
      response.json(toGiftcard(row, request));
    }),
  );

  app.patch(
    '/admin/cards/:id/status',
    authenticated,
    requireIssuer,
    handleAsync(async (request, response) => {
      const cardId = giftcardIdSchema.safeParse(request.params.id);
      const parsed = statusSchema.safeParse(request.body);
      if (!cardId.success || !parsed.success) {
        invalidBody(response);
        return;
      }
      const updated = await withTransaction(pool, async (client) => {
        const currentResult = await client.query(
          `SELECT id, card_number, starting_balance_cents, balance_cents,
                  status, created_at, activated_at, expires_at, qr_reference
             FROM giftcard_cards
            WHERE id = $1
            FOR UPDATE`,
          [cardId.data],
        );
        const current = currentResult.rows[0];
        if (!current) return null;
        const currentStatus = effectiveStatus(current.status, current.expires_at);
        if (!permittedTransition(currentStatus, parsed.data.status)) {
          throw Object.assign(new Error('Transition de statut interdite.'), {
            statusCode: 409,
          });
        }
        const result = await client.query(
          `UPDATE giftcard_cards
              SET status = $1,
                  activated_at = CASE
                    WHEN $1 = 'active' THEN COALESCE(activated_at, NOW())
                    ELSE activated_at
                  END
            WHERE id = $2
          RETURNING id, card_number, starting_balance_cents, balance_cents,
                    status, created_at, activated_at, expires_at, qr_reference`,
          [parsed.data.status, cardId.data],
        );
        await insertAudit(
          client,
          requestAdmin(request),
          'card_status_changed',
          cardId.data,
          { from: currentStatus, to: parsed.data.status },
        );
        return result.rows[0];
      });
      if (!updated) {
        response.status(404).json({ error: 'Carte introuvable.' });
        return;
      }
      response.json(toGiftcard(updated, request));
    }),
  );

  app.get(
    '/admin/cards/:id/transactions',
    authenticated,
    handleAsync(async (request, response) => {
      const cardId = giftcardIdSchema.safeParse(request.params.id);
      if (!cardId.success) {
        response.status(400).json({ error: 'Identifiant invalide.' });
        return;
      }
      const exists = await pool.query(
        `SELECT 1 FROM giftcard_cards WHERE id = $1`,
        [cardId.data],
      );
      if (!exists.rowCount) {
        response.status(404).json({ error: 'Carte introuvable.' });
        return;
      }
      const result = await pool.query<GiftcardTransactionRow>(
        `SELECT t.id, t.kind, t.amount_cents, t.balance_after_cents,
                p.display_name AS partner_label, t.note, t.created_at
           FROM giftcard_transactions t
           LEFT JOIN giftcard_partners p ON p.code = t.partner_code
          WHERE t.card_id = $1
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 100`,
        [cardId.data],
      );
      response.json(result.rows.map(transactionResponse));
    }),
  );

  app.post(
    '/admin/cards/:id/redeem',
    authenticated,
    requireIssuer,
    handleAsync(async (request, response) => {
      const cardId = giftcardIdSchema.safeParse(request.params.id);
      const parsed = redeemSchema.safeParse(request.body);
      if (!cardId.success || !parsed.success) {
        invalidBody(response);
        return;
      }
      try {
        const transaction = await withTransaction(pool, async (client) => {
          const previous = await client.query<GiftcardTransactionRow & {
            card_id: string;
            idempotency_key: string | null;
          }>(
            `SELECT t.id, t.card_id, t.kind, t.amount_cents,
                    t.balance_after_cents, p.display_name AS partner_label,
                    t.note, t.created_at, t.idempotency_key
               FROM giftcard_transactions t
               LEFT JOIN giftcard_partners p ON p.code = t.partner_code
              WHERE t.idempotency_key = $1`,
            [parsed.data.idempotencyKey],
          );
          if (previous.rows[0]) {
            const existing = previous.rows[0];
            if (
              Number(existing.card_id) !== cardId.data ||
              -existing.amount_cents !== parsed.data.amountCents
            ) {
              throw Object.assign(new Error('Clé déjà utilisée.'), {
                statusCode: 409,
              });
            }
            return existing;
          }

          const locked = await client.query<{
            id: string;
            status: string;
            balance_cents: number;
            expires_at: Date | null;
          }>(
            `SELECT id, status, balance_cents, expires_at
               FROM giftcard_cards
              WHERE id = $1
              FOR UPDATE`,
            [cardId.data],
          );
          const card = locked.rows[0];
          if (!card) {
            throw Object.assign(new Error('Carte introuvable.'), {
              statusCode: 404,
            });
          }
          if (
            effectiveStatus(card.status, card.expires_at) !== 'active' ||
            card.balance_cents < parsed.data.amountCents
          ) {
            throw Object.assign(new Error('Carte inactive ou solde insuffisant.'), {
              statusCode: 409,
            });
          }

          const partner = await client.query<{ code: string }>(
            `SELECT code FROM giftcard_partners
              WHERE code = 'MOCK' AND is_mock = TRUE AND enabled = TRUE`,
          );
          if (!partner.rows[0]) {
            throw Object.assign(new Error('Partenaire fictif TEST désactivé.'), {
              statusCode: 409,
            });
          }

          const nextBalance = card.balance_cents - parsed.data.amountCents;
          const nextStatus = nextBalance === 0 ? 'spent' : 'active';
          await client.query(
            `UPDATE giftcard_cards
                SET balance_cents = $1, status = $2
              WHERE id = $3`,
            [nextBalance, nextStatus, cardId.data],
          );
          const inserted = await client.query<GiftcardTransactionRow>(
            `INSERT INTO giftcard_transactions
              (card_id, kind, amount_cents, balance_after_cents,
               partner_code, idempotency_key, note, created_by)
             VALUES ($1, 'redemption', $2, $3, 'MOCK', $4, $5, $6)
             RETURNING id, kind, amount_cents, balance_after_cents,
                       'Partenaire fictif — TEST'::text AS partner_label,
                       CASE WHEN $5::text IS NULL THEN 'Utilisation simulée' ELSE $5 END AS note,
                       created_at`,
            [
              cardId.data,
              -parsed.data.amountCents,
              nextBalance,
              parsed.data.idempotencyKey,
              parsed.data.note ?? null,
              requestAdmin(request).id,
            ],
          );
          await insertAudit(
            client,
            requestAdmin(request),
            'card_redeemed',
            cardId.data,
            {
              amountCents: parsed.data.amountCents,
              balanceAfterCents: nextBalance,
              partnerCode: 'MOCK',
            },
          );
          return inserted.rows[0];
        });
        response.json(transactionResponse(transaction));
      } catch (error) {
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          typeof error.statusCode === 'number'
            ? error.statusCode
            : undefined;
        if (statusCode) {
          response.status(statusCode).json({
            error:
              statusCode === 404
                ? 'Carte introuvable.'
                : error instanceof Error
                  ? error.message
                  : 'Opération impossible.',
          });
          return;
        }
        throw error;
      }
    }),
  );

  app.get(
    '/admin/partners',
    authenticated,
    handleAsync(async (_request, response) => {
      const result = await pool.query(
        `SELECT code, display_name, is_mock, enabled, disclaimer
           FROM giftcard_partners
          ORDER BY code`,
      );
      response.json(
        result.rows.map((row) => ({
          code: row.code,
          displayName: row.display_name,
          isMock: row.is_mock,
          enabled: row.enabled,
          disclaimer: row.disclaimer,
        })),
      );
    }),
  );

  app.patch(
    '/admin/partners/:code',
    authenticated,
    requireAdmin,
    handleAsync(async (request, response) => {
      const code = String(request.params.code).toUpperCase();
      const parsed = partnerSchema.safeParse(request.body);
      if (!/^[A-Z0-9_-]{2,32}$/.test(code) || !parsed.success) {
        invalidBody(response);
        return;
      }
      const result = await pool.query(
        `UPDATE giftcard_partners
            SET enabled = $1
          WHERE code = $2 AND is_mock = TRUE
        RETURNING code, display_name, is_mock, enabled, disclaimer`,
        [parsed.data.enabled, code],
      );
      const partner = result.rows[0];
      if (!partner) {
        response.status(404).json({ error: 'Partenaire fictif introuvable.' });
        return;
      }
      await logAdminAction(pool, requestAdmin(request), 'mock_partner_updated', null, {
        code: partner.code,
        enabled: partner.enabled,
      });
      response.json({
        code: partner.code,
        displayName: partner.display_name,
        isMock: partner.is_mock,
        enabled: partner.enabled,
        disclaimer: partner.disclaimer,
      });
    }),
  );

  app.get(
    '/admin/audit',
    authenticated,
    handleAsync(async (request, response) => {
      const limit = Math.min(
        100,
        Math.max(1, safeInteger(request.query.limit) || 50),
      );
      const result = await pool.query(
        `SELECT l.id, l.action, a.username AS admin_username,
                c.card_number, l.details, l.created_at
           FROM giftcard_audit_log l
           JOIN giftcard_admins a ON a.id = l.admin_id
           LEFT JOIN giftcard_cards c ON c.id = l.card_id
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT $1`,
        [limit],
      );
      response.json(
        result.rows.map((row) => ({
          id: Number(row.id),
          action: row.action,
          adminUsername: row.admin_username,
          cardNumber: row.card_number,
          details: row.details ?? {},
          createdAt: row.created_at.toISOString(),
        })),
      );
    }),
  );

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 409
    ) {
      response.status(409).json({ error: 'Transition de statut interdite.' });
      return;
    }
    response.status(503).json({ error: 'Service TEST temporairement indisponible.' });
  };
  app.use(errorHandler);
  return app;
}
