if (
  process.env.GIFTCARD_MODE !== 'TEST' ||
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    'Le serveur cartes cadeaux refuse de démarrer hors de l’environnement de développement TEST.',
  );
}

const rawPort = process.env.PORT;
if (!rawPort || !/^[0-9]+$/.test(rawPort) || Number(rawPort) <= 0) {
  throw new Error('PORT doit être un port de service valide.');
}

const [{ createGiftcardApp }, { pool }] = await Promise.all([
  import('./api/app.js'),
  import('./db/pool.js'),
]);

await pool.query('SELECT 1');
const app = createGiftcardApp(pool);
const server = app.listen(Number(rawPort), '0.0.0.0', () => {
  process.stdout.write(`API cartes cadeaux TEST disponible sur le port ${rawPort}\n`);
});

function shutdown() {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 8_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export {};
