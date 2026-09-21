import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const siteUrl = 'https://indamoraplay.com';
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/indamora-play/public/sitemap.xml',
);

const staticRoutes = [
  ['/', 'weekly', '1.0'],
  ['/indamora-records', 'monthly', '0.9'],
  ['/explorer', 'weekly', '0.8'],
  ['/repertoire', 'weekly', '0.9'],
  ['/presse', 'monthly', '0.6'],
  ['/pricing', 'monthly', '0.5'],
  ['/soutenir', 'monthly', '0.5'],
  ['/categorie/musique', 'weekly', '0.8'],
  ['/categorie/humour', 'weekly', '0.7'],
  ['/categorie/cinema', 'weekly', '0.7'],
  ['/categorie/podcasts', 'weekly', '0.7'],
  ['/categorie/autres-creations', 'weekly', '0.6'],
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function urlEntry(path, changefreq = 'weekly', priority = '0.6', lastmod) {
  const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : '';
  return `  <url>\n    <loc>${siteUrl}${escapeXml(path)}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to generate the public sitemap.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const [artistsResult, worksResult] = await Promise.all([
    pool.query(`
      SELECT id, created_at
      FROM artists
      WHERE profile_status = 'approved' AND is_published = 'true'
      ORDER BY id
    `),
    pool.query(`
      SELECT id, created_at
      FROM works
      ORDER BY id
    `),
  ]);

  const entries = staticRoutes.map(([path, changefreq, priority]) => urlEntry(path, changefreq, priority));
  const artistEntries = artistsResult.rows.map((artist) =>
    urlEntry(`/artists/${artist.id}`, 'weekly', '0.8', artist.created_at?.toISOString?.().slice(0, 10)),
  );
  const workEntries = worksResult.rows.map((work) =>
    urlEntry(`/oeuvres/${work.id}`, 'weekly', '0.7', work.created_at?.toISOString?.().slice(0, 10)),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...entries, ...artistEntries, ...workEntries].join('\n')}\n</urlset>\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');
  console.log(`Generated ${entries.length + artistEntries.length + workEntries.length} public sitemap URLs.`);
} finally {
  await pool.end();
}