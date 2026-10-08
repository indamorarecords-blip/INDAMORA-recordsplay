import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { normalizeUsername, derivePasswordHash } from '../src/api/security.js';
import { pool } from '../src/db/pool.js';

if (
  process.env.GIFTCARD_MODE !== 'TEST' ||
  process.env.NODE_ENV === 'production'
) {
  throw new Error('La création d’un compte est désactivée hors du mode TEST local.');
}

if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
  throw new Error(
    'Exécutez cette commande dans le terminal interactif Replit pour saisir le mot de passe sans l’afficher.',
  );
}

function askHidden(prompt: string): Promise<string> {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Saisie interrompue.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

const readline = createInterface({ input: stdin, output: stdout });
const username = normalizeUsername(
  await readline.question('Nom du compte administrateur TEST : '),
);
readline.close();

if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
  throw new Error('Le nom doit contenir 3 à 64 lettres, chiffres, points ou tirets.');
}

const password = await askHidden('Mot de passe (12 caractères minimum) : ');
const confirmation = await askHidden('Confirmez le mot de passe : ');
if (password.length < 12 || password !== confirmation) {
  throw new Error('Mot de passe trop court ou confirmation différente.');
}

const { salt, hash } = await derivePasswordHash(password);
await pool.query(
  `INSERT INTO giftcard_admins
    (username, password_salt, password_hash, role)
   VALUES ($1, $2, $3, 'admin')`,
  [username, salt, hash],
);

stdout.write(`Compte administrateur TEST créé : ${username}\n`);
stdout.write('Le mot de passe n’a pas été enregistré en clair.\n');
await pool.end();
