import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL doit être défini dans l’environnement de développement.',
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  application_name: 'indamora-giftcard-test',
});

pool.on('error', () => {
  // The request that caused an error is handled by the route-level error path.
});
