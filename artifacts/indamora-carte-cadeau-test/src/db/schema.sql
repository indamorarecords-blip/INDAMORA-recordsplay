CREATE TABLE IF NOT EXISTS giftcard_admins (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 64),
  password_salt BYTEA NOT NULL,
  password_hash BYTEA NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'issuer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS giftcard_admin_sessions (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  admin_id BIGINT NOT NULL REFERENCES giftcard_admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS giftcard_admin_sessions_expiry_idx
  ON giftcard_admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS giftcard_cards (
  id BIGSERIAL PRIMARY KEY,
  card_number TEXT NOT NULL UNIQUE CHECK (length(card_number) BETWEEN 12 AND 24),
  pin_salt BYTEA NOT NULL,
  pin_hash BYTEA NOT NULL,
  qr_reference TEXT NOT NULL UNIQUE CHECK (qr_reference ~ '^[a-f0-9]{48}$'),
  starting_balance_cents INTEGER NOT NULL CHECK (starting_balance_cents BETWEEN 1000 AND 100000),
  balance_cents INTEGER NOT NULL CHECK (balance_cents BETWEEN 0 AND 100000),
  status TEXT NOT NULL CHECK (status IN ('issued', 'active', 'blocked', 'cancelled', 'spent', 'expired')),
  created_by BIGINT NOT NULL REFERENCES giftcard_admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CHECK (balance_cents <= starting_balance_cents)
);
CREATE INDEX IF NOT EXISTS giftcard_cards_status_created_idx
  ON giftcard_cards (status, created_at DESC);
CREATE INDEX IF NOT EXISTS giftcard_cards_number_idx
  ON giftcard_cards (card_number);

CREATE TABLE IF NOT EXISTS giftcard_partners (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{2,32}$'),
  display_name TEXT NOT NULL,
  is_mock BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disclaimer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT giftcard_partners_is_mock_check CHECK (is_mock IS TRUE)
);

CREATE TABLE IF NOT EXISTS giftcard_transactions (
  id BIGSERIAL PRIMARY KEY,
  card_id BIGINT NOT NULL REFERENCES giftcard_cards(id),
  kind TEXT NOT NULL CHECK (kind IN ('issue', 'redemption', 'adjustment')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents INTEGER NOT NULL CHECK (balance_after_cents >= 0),
  partner_code TEXT REFERENCES giftcard_partners(code),
  idempotency_key TEXT UNIQUE,
  note TEXT,
  created_by BIGINT REFERENCES giftcard_admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS giftcard_transactions_card_created_idx
  ON giftcard_transactions (card_id, created_at DESC);

CREATE TABLE IF NOT EXISTS giftcard_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES giftcard_admins(id),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  card_id BIGINT REFERENCES giftcard_cards(id),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS giftcard_audit_created_idx
  ON giftcard_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION giftcard_reject_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Giftcard transaction and audit records are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS giftcard_transactions_immutable
  ON giftcard_transactions;
CREATE TRIGGER giftcard_transactions_immutable
  BEFORE UPDATE OR DELETE ON giftcard_transactions
  FOR EACH ROW EXECUTE FUNCTION giftcard_reject_ledger_mutation();

DROP TRIGGER IF EXISTS giftcard_audit_immutable
  ON giftcard_audit_log;
CREATE TRIGGER giftcard_audit_immutable
  BEFORE UPDATE OR DELETE ON giftcard_audit_log
  FOR EACH ROW EXECUTE FUNCTION giftcard_reject_ledger_mutation();

INSERT INTO giftcard_partners (code, display_name, is_mock, enabled, disclaimer)
VALUES (
  'MOCK',
  'Partenaire fictif — TEST',
  TRUE,
  TRUE,
  'Simulation uniquement. Aucune enseigne réelle ni aucun paiement ne sont connectés.'
)
ON CONFLICT (code) DO NOTHING;
