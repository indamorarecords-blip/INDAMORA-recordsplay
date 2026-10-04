import { useMemo, useState } from 'react';
import { getGetAdminAnalyticsQueryKey, useGetAdminAnalytics } from '@workspace/api-client-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
const nf = new Intl.NumberFormat('fr-FR');
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const countryName = (code: string | null) => {
  if (!code) return 'Inconnu';
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};
const presets = [{ id: 'today', label: 'Aujourd’hui', days: 0 }, { id: '7', label: '7 jours', days: 6 }, { id: '30', label: '30 jours', days: 29 }];

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="display mt-2 text-4xl font-bold" data-testid={testId}>{nf.format(value)}</p>
    </div>
  );
}

export function AdminTraffic() {
  const today = parisToday();
  const min = shift(today, -89);
  const [preset, setPreset] = useState('7');
  const [custom, setCustom] = useState({ start: shift(today, -6), end: today });
  const range = useMemo(() => {
    if (preset === 'custom') return custom;
    return { start: shift(today, -(presets.find((p) => p.id === preset)?.days ?? 6)), end: today };
  }, [preset, custom, today]);
  const valid = range.start >= min && range.end <= today && range.start <= range.end && /^\d{4}-\d{2}-\d{2}$/.test(range.start) && /^\d{4}-\d{2}-\d{2}$/.test(range.end);
  const params = { start: range.start, end: range.end };
  const q = useGetAdminAnalytics(params, { query: { queryKey: getGetAdminAnalyticsQueryKey(params), enabled: valid, staleTime: 60_000, refetchInterval: 120_000 } });
  const r = q.data;
  const maxPage = Math.max(1, ...(r?.pages.map((p) => p.pageviews) ?? []));
  const dateInput = 'rounded-xl border border-input bg-card px-3 py-2 text-sm';

  return (
    <section className="mt-12" aria-labelledby="admin-traffic-title">
      <h2 id="admin-traffic-title" className="display text-3xl font-bold">Statistiques de trafic</h2>
      <p className="mt-2 text-sm text-muted-foreground">Pages publiques uniquement, fuseau Europe/Paris, conservation 90 jours.</p>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <button key={p.id} type="button" onClick={() => setPreset(p.id)} aria-pressed={preset === p.id} data-testid={`button-traffic-${p.id}`}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${preset === p.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{p.label}</button>
        ))}
        <button type="button" onClick={() => { setCustom(range); setPreset('custom'); }} aria-pressed={preset === 'custom'} data-testid="button-traffic-custom"
          className={`rounded-full border px-4 py-2 text-sm font-semibold ${preset === 'custom' ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>Période libre</button>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Du <input type="date" className={`${dateInput} ml-1`} min={min} max={custom.end || today} value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} data-testid="input-traffic-start" /></label>
            <label className="text-xs font-semibold text-muted-foreground">au <input type="date" className={`${dateInput} ml-1`} min={custom.start || min} max={today} value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} data-testid="input-traffic-end" /></label>
          </div>
        )}
      </div>

      {!valid ? (
        <p className="mt-6 rounded-2xl border border-destructive/25 bg-card p-5 text-sm" role="alert">Période invalide : choisissez des dates comprises entre le {fmtDay(min)} et aujourd’hui (90 derniers jours, début avant fin).</p>
      ) : q.isLoading ? (
        <div className="mt-6 space-y-3" aria-label="Chargement des statistiques">
          <div className="grid gap-3 sm:grid-cols-2"><div className="skeleton h-24 rounded-2xl" /><div className="skeleton h-24 rounded-2xl" /></div>
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : q.error || !r ? (
        <div className="mt-6 rounded-2xl border border-destructive/25 bg-card p-6" role="alert">
          <p className="font-semibold">Impossible de charger les statistiques.</p>
          <button type="button" onClick={() => void q.refetch()} className="mt-3 text-sm font-bold text-primary underline" data-testid="button-traffic-retry">Réessayer</button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <p className="text-xs text-muted-foreground" data-testid="text-traffic-range">Du {fmtDay(r.start)} au {fmtDay(r.end)} ({r.timezone}){q.isFetching ? ' · actualisation…' : ''}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Visiteurs distincts sur la période (estimation)" value={r.visitors} testId="text-traffic-visitors" />
            <Stat label="Pages vues" value={r.pageviews} testId="text-traffic-pageviews" />
          </div>
          <p className="text-xs text-muted-foreground">Les visiteurs distincts de la période sont comptés une seule fois sur toute la période : ce total n’est pas la somme des visiteurs quotidiens.</p>

          {r.pageviews === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-muted-foreground" data-testid="text-traffic-empty">
              Aucune visite enregistrée sur cette période.{' '}
              {r.firstCollectedAt ? `Collecte active depuis le ${new Date(r.firstCollectedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.` : 'La collecte n’a pas encore enregistré de visite.'}
            </p>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-bold">Évolution du trafic</h3>
                <p className="text-xs text-muted-foreground">Visiteurs par jour (axe à partir de zéro).</p>
                <div className="mt-4 h-64" role="img" aria-label="Courbe des visiteurs par jour ; données détaillées dans le tableau ci-dessous">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={r.daily} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} tick={{ fontSize: 11 }} />
                      <YAxis type="number" domain={[0, (max: number) => Math.max(1, max)]} allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(d) => fmtDay(String(d))} formatter={(v) => [nf.format(Number(v)), 'Visiteurs']} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Line type="linear" dataKey="visitors" stroke="#61A9BD" strokeWidth={2.5} dot={r.daily.length <= 31} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-primary">Données quotidiennes (tableau)</summary>
                  <div className="mt-3 max-h-72 overflow-auto">
                    <table className="w-full text-sm" data-testid="table-traffic-daily">
                      <caption className="sr-only">Visiteurs et pages vues par jour</caption>
                      <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Jour</th><th className="py-1 text-right">Visiteurs</th><th className="py-1 text-right">Pages vues</th></tr></thead>
                      <tbody>{r.daily.map((d) => <tr key={d.date} className="border-t border-border"><td className="py-1">{fmtDay(d.date)}</td><td className="py-1 text-right">{nf.format(d.visitors)}</td><td className="py-1 text-right">{nf.format(d.pageviews)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="font-bold">Pays</h3>
                  {r.geoipStatus !== 'ready' && (
                    <p className="mt-2 rounded-xl bg-muted p-3 text-xs" role="status" data-testid="text-traffic-geoip-warning">
                      {r.geoipStatus === 'stale' ? 'La base de géolocalisation n’est plus à jour : les pays peuvent être moins fiables.' : 'La base de géolocalisation est indisponible : les pays sont affichés comme inconnus.'}
                    </p>
                  )}
                  {r.countries.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucun pays.</p> : (
                    <table className="mt-3 w-full text-sm" data-testid="table-traffic-countries">
                      <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Pays</th><th className="py-1 text-right">Visiteurs</th><th className="py-1 text-right">Pages vues</th></tr></thead>
                      <tbody>{r.countries.map((c) => <tr key={c.country ?? 'inconnu'} className="border-t border-border"><td className="py-1">{countryName(c.country)}</td><td className="py-1 text-right">{nf.format(c.visitors)}</td><td className="py-1 text-right">{nf.format(c.pageviews)}</td></tr>)}</tbody>
                    </table>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">Pays estimé à partir de l’adresse réseau, sans localisation précise. « Inconnu » : pays non déterminé.{r.geoipRelease ? ` Base du mois : ${r.geoipRelease}.` : ''}</p>
                  <p className="mt-1 text-xs"><a href="https://db-ip.com" rel="noreferrer" referrerPolicy="no-referrer" target="_blank" className="font-semibold text-primary underline" data-testid="link-dbip">IP Geolocation by DB-IP</a></p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="font-bold">Top 20 des pages</h3>
                  <ol className="mt-3 space-y-2" data-testid="list-traffic-pages">
                    {r.pages.slice(0, 20).map((p) => (
                      <li key={p.path} className="text-sm">
                        <div className="flex justify-between gap-3"><span className="min-w-0 break-all font-mono text-xs">{p.path}</span><span className="shrink-0 text-xs text-muted-foreground">{nf.format(p.pageviews)} vues · {nf.format(p.visitors)} vis.</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-secondary" style={{ width: `${(p.pageviews / maxPage) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <aside className="mt-6 rounded-2xl border border-border bg-muted p-5 text-xs leading-relaxed text-muted-foreground" data-testid="text-traffic-notes">
        <p className="font-semibold text-foreground">Comment lire ces chiffres</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Les visiteurs uniques sont des estimations, fondées sur des empreintes pseudonymes du réseau et du navigateur. Un changement d’adresse IP, un appareil ou un réseau partagé peuvent modifier les comptes.</li>
          <li>Les signaux DNT et GPC ainsi que les robots évidents sont exclus.</li>
          <li>Les requêtes internes ou sans adresse IP publique transmise par le proxy ne sont pas comptabilisées.</li>
          <li>Seuls les chemins des pages publiques sont enregistrés, sans termes de recherche.</li>
          <li>Conservation de 90 jours ; aucun historique avant l’activation de la collecte{r?.firstCollectedAt ? ` (première collecte : ${new Date(r.firstCollectedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })})` : ''}.</li>
          <li>Aucun cookie n’est ajouté.</li>
        </ul>
      </aside>
    </section>
  );
}
