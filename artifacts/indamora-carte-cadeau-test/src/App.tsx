import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { Activity, ArrowRight, ArrowUpRight, BadgeCheck, Download, Eye, LogOut, Plus, Printer, Search, ShieldCheck, Ticket, X } from 'lucide-react';
import QRCode from 'qrcode';
import {
  getGetGiftcardAdminSessionQueryKey,
  getGetGiftcardDashboardQueryKey,
  getGetGiftcardHealthQueryKey,
  getGetGiftcardTransactionsQueryKey,
  getListGiftcardAuditQueryKey,
  getListGiftcardPartnersQueryKey,
  getListGiftcardsQueryKey,
  getExportGiftcardsCsvQueryKey,
  useCreateGiftcard,
  useCreateGiftcardBatch,
  useExportGiftcardsCsv,
  useGetGiftcardAdminSession,
  useGetGiftcardDashboard,
  useGetGiftcardHealth,
  useGetGiftcardTransactions,
  useListGiftcardAudit,
  useListGiftcardPartners,
  useListGiftcards,
  useLoginGiftcardAdmin,
  useLogoutGiftcardAdmin,
  useLookupGiftcardBalance,
  useRedeemGiftcard,
  useResolveGiftcardQr,
  useUpdateGiftcardPartner,
  useUpdateGiftcardStatus,
} from '@/generated/api/giftcardTestApi';
import { GiftcardStatus, type Giftcard, type GiftcardBalance, type GiftcardCreated, type GiftcardStatus as GiftcardStatusType, type GiftcardTransaction } from '@/generated/models';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const money = (cents: number, currency = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sans date d’expiration';
const dateTime = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const statusLabel: Record<GiftcardStatusType, string> = {
  issued: 'Émise', active: 'Active', blocked: 'Bloquée', cancelled: 'Annulée', spent: 'Épuisée', expired: 'Expirée',
};
const statuses: GiftcardStatusType[] = [GiftcardStatus.issued, GiftcardStatus.active, GiftcardStatus.blocked, GiftcardStatus.cancelled, GiftcardStatus.spent, GiftcardStatus.expired];

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return <div className="app-shell">
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-home">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">INDAMORA PLAY<small>CARTE CADEAU SOLIDAIRE</small></span>
      </Link>
      <nav className="nav-links" aria-label="Navigation principale">
        <Link className={`nav-link ${path === '/' ? 'active' : ''}`} href="/" data-testid="link-nav-accueil">Accueil</Link>
        <Link className={`nav-link ${path === '/solde' ? 'active' : ''}`} href="/solde" data-testid="link-nav-solde">Mon solde</Link>
        <Link className={`nav-link ${path === '/admin' ? 'active' : ''}`} href="/admin" data-testid="link-nav-admin">Administration</Link>
        <span className="test-pill" data-testid="status-test-mode">TEST</span>
      </nav>
    </header>
    {children}
    <footer className="disclaimer" data-testid="text-simulation-notice">
      ENVIRONNEMENT TEST INDAMORAPLAY · Valeurs, cartes et transactions entièrement simulées. Aucun paiement réel ni commerçant participant.
    </footer>
  </div>;
}

function Home() {
  const health = useGetGiftcardHealth({ query: { queryKey: getGetGiftcardHealthQueryKey(), staleTime: 60000 } });
  return <Shell>
    <main>
      <section className="hero-wrap">
        <div className="hero-grid">
          <div className="animate-rise-in">
            <span className="eyebrow"><span className="test-pill">TEST</span> Une idée généreuse, en version test</span>
            <h1 className="hero-title">Offrir un peu<br /><em>de musique.</em></h1>
            <p className="hero-copy">La carte cadeau solidaire INDAMORA RECORDS est un module de démonstration pour émettre et consulter des cartes. Ici, tout est simulé — du solde aux transactions.</p>
            <div className="hero-actions">
              <Link href="/solde" className="btn btn-primary" data-testid="link-check-balance">Consulter une carte <ArrowRight size={15} /></Link>
              <Link href="/admin" className="btn btn-secondary" data-testid="link-admin-entry">Espace INDAMORA RECORDS</Link>
            </div>
            <div style={{ marginTop: 20, color: '#7b7d72', fontSize: 10 }} data-testid="status-api-health">
              {health.isLoading ? 'Vérification du service test…' : health.isError ? 'Service test temporairement indisponible' : 'Service test prêt · aucune opération réelle'}
            </div>
          </div>
          <div className="hero-art" aria-label="Illustration d’une carte cadeau de démonstration">
            <div className="hero-orbit" />
            <div className="gift-card-visual">
              <div className="gc-brand">INDAMORA RECORDS</div>
              <div className="fake-stamp">CARTE<br />SOLIDAIRE<br />TEST</div>
              <div className="gc-label">Un geste qui fait du bien</div>
              <div className="gc-value">25 €</div>
              <div className="gc-bottom">Votre culture · votre scène</div>
            </div>
            <span className="small-note">Visuel de démonstration uniquement</span>
          </div>
        </div>
      </section>
      <section className="intro-band">
        <div className="intro-inner"><strong>Écoutez les voix qui ont le goût du pays.</strong><p>Un concept de carte cadeau solidaire imaginé par INDAMORA RECORDS. Ce bac à sable sert uniquement à éprouver le parcours produit.</p></div>
      </section>
      <section className="content-section">
        <div className="section-head"><div><span className="eyebrow">Un parcours simple</span><h2>Du premier geste<br />à la vérification.</h2></div><p>Dans ce module isolé, les montants et échanges avec d’éventuels partenaires sont fictifs.</p></div>
        <div className="steps-grid">
          <article className="step"><span className="step-index">01 / OFFRIR</span><h3>Une valeur choisie</h3><p>Les cartes de test sont créées par l’équipe INDAMORA RECORDS. Aucun achat client n’est possible dans cet environnement.</p></article>
          <article className="step"><span className="step-index">02 / GARDER</span><h3>Un numéro, un PIN</h3><p>Chaque carte dispose d’un numéro et d’un code secret à six chiffres. Le PIN est communiqué une seule fois à la création.</p></article>
          <article className="step"><span className="step-index">03 / CONSULTER</span><h3>Un solde simulé</h3><p>Le détenteur peut vérifier le solde et l’activité récente avec les informations de sa carte.</p></article>
        </div>
        <div className="home-lookup"><div><h3>Vous avez une carte de test ?</h3><p>Le numéro et le PIN sont requis pour afficher son solde.</p></div><Link href="/solde" className="btn btn-primary" data-testid="link-home-lookup">Vérifier mon solde <ArrowRight size={14} /></Link></div>
      </section>
    </main>
  </Shell>;
}

function Solde() {
  const lookup = useLookupGiftcardBalance();
  const [cardNumber, setCardNumber] = useState('');
  const [pin, setPin] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookup.mutateAsync>> | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setResult(null);
    lookup.mutate({ data: { cardNumber: cardNumber.trim(), pin } }, { onSuccess: setResult });
  };
  return <Shell><main className="page-container">
    <span className="eyebrow">Espace détenteur · TEST</span><h1 className="page-title">Le solde de votre carte.</h1>
    <p className="page-subtitle">Saisissez le numéro de carte et son PIN à six chiffres pour consulter les données simulées. Ne partagez jamais votre PIN.</p>
    <div className="lookup-layout">
      <form className="panel panel-pad" onSubmit={submit} data-testid="form-balance-lookup">
        <h2 className="panel-title">Vérifier une carte</h2><p className="panel-copy">Vos informations ne sont pas enregistrées dans le navigateur.</p>
        <div className="form-stack">
          <div className="field"><label htmlFor="card-number">Numéro de carte</label><input id="card-number" autoComplete="off" value={cardNumber} onChange={e => setCardNumber(e.target.value)} minLength={12} maxLength={24} placeholder="Saisir le numéro indiqué sur la carte" required data-testid="input-card-number" /></div>
          <div className="field"><label htmlFor="card-pin">PIN à 6 chiffres</label><input id="card-pin" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="••••••" required data-testid="input-card-pin" /><span className="field-hint">Le PIN est visible uniquement lors de l’émission de la carte test.</span></div>
          {lookup.isError && <div className="alert" role="alert" data-testid="error-balance-lookup">Carte ou PIN non reconnu. Vérifiez les informations puis réessayez.</div>}
          <button className="btn btn-primary" disabled={lookup.isPending} type="submit" data-testid="button-submit-balance">{lookup.isPending ? 'Vérification…' : 'Afficher le solde'} <ArrowRight size={14} /></button>
        </div>
      </form>
      <section aria-live="polite">
        {lookup.isPending ? <div className="panel loading-lines" aria-label="Chargement"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : result ? <BalanceResult balance={result} /> :
          <div className="panel panel-pad" style={{ minHeight: 260, display: 'grid', alignContent: 'center', textAlign: 'center' }}>
            <div style={{ margin: '0 auto 16px', color: 'var(--teal)' }}><Ticket size={30} strokeWidth={1.5} /></div>
            <h2 className="panel-title">Votre récapitulatif apparaîtra ici</h2><p className="panel-copy" style={{ margin: 0 }}>Le solde et les mouvements s’affichent après vérification.</p>
          </div>}
      </section>
    </div>
  </main></Shell>;
}

function BalanceResult({ balance }: { balance: GiftcardBalance }) {
  const qr = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('ref') ?? '';
  const resolved = useResolveGiftcardQr(qr, { query: { queryKey: ['customer-qr', qr], enabled: Boolean(qr) } });
  return <div className="result-card" data-testid="card-balance-result">
    <div className="result-label">Solde disponible · {balance.currency}</div>
    <div className="result-amount" data-testid="text-current-balance">{money(balance.balanceCents, balance.currency)}</div>
    <div className="result-meta">
      <div><b>Carte</b>{balance.cardNumber}</div><div><b>État</b><span className={`status-chip status-${balance.status}`}>{statusLabel[balance.status]}</span></div><div><b>Expire le</b>{date(balance.expiresAt)}</div>
    </div>
    {resolved.data && <div className="field-hint" style={{ marginTop: 12, color: '#dbe7df' }} data-testid="text-qr-reference-card">Référence reconnue : {resolved.data.cardNumber}</div>}
    <div className="transaction-list">
      <div className="result-label">Activité récente</div>
      {!balance.recentTransactions.length ? <div className="transaction-row"><span>Aucun mouvement pour le moment</span><span>—</span></div> : balance.recentTransactions.map(tx => <TransactionRow key={tx.id} transaction={tx} light />)}
    </div>
    <div style={{ fontSize: 9, color: '#c9d9ce', marginTop: 15 }}>Activité et valeur de démonstration · aucun paiement réel.</div>
  </div>;
}

function TransactionRow({ transaction, light = false }: { transaction: GiftcardTransaction; light?: boolean }) {
  const negative = transaction.kind === 'redemption';
  return <div className="transaction-row" data-testid={`row-transaction-${transaction.id}`}>
    <span>{transaction.kind === 'redemption' ? 'Utilisation simulée' : transaction.kind === 'issue' ? 'Émission' : 'Ajustement'}<small>{dateTime(transaction.createdAt)}{transaction.partnerLabel ? ` · ${transaction.partnerLabel}` : ''}</small></span>
    <span className="amount-mono" style={{ color: light ? '#fff4dc' : negative ? '#9b4a32' : 'var(--teal)' }}>{negative ? '−' : '+'}{money(transaction.amountCents)}</span>
  </div>;
}

function isUnauthorizedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 401
  );
}

function Admin() {
  const session = useGetGiftcardAdminSession({ query: { queryKey: getGetGiftcardAdminSessionQueryKey(), retry: false } });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const queryClient = useQueryClient();
  const login = useLoginGiftcardAdmin({ mutation: { onSuccess: () => { setLoginMessage(''); queryClient.invalidateQueries({ queryKey: getGetGiftcardAdminSessionQueryKey() }); } } });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ data: { username: username.trim(), password } }, { onError: () => setLoginMessage('Connexion impossible. Vérifiez les identifiants ou initialisez le compte administrateur de test avec le script fourni au terminal.') });
  };
  if (session.isLoading) return <Shell><div className="login-wrap"><div className="login-card"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 14 }} /></div></div></Shell>;
  if (session.data) return <AdminDashboard username={session.data.username} />;
  return <Shell><main className="login-wrap">
    <form className="login-card" onSubmit={submit} data-testid="form-admin-login">
      <span className="test-pill">ADMIN · TEST</span><h1>Accès équipe.</h1>
      <p>Administration réservée à INDAMORA RECORDS. Aucun compte ne peut être créé depuis cette interface.</p>
      <div className="form-stack">
        <div className="field"><label htmlFor="admin-user">Identifiant</label><input id="admin-user" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required data-testid="input-admin-username" /></div>
        <div className="field"><label htmlFor="admin-password">Mot de passe</label><input id="admin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required data-testid="input-admin-password" /></div>
        {(loginMessage || login.isError) && <div className="alert" role="alert" data-testid="error-admin-login">{loginMessage || 'Connexion refusée. Vérifiez votre accès administrateur de test.'}</div>}
        <button className="btn btn-primary" type="submit" disabled={login.isPending} data-testid="button-admin-login">{login.isPending ? 'Connexion…' : 'Ouvrir l’administration'} <ArrowRight size={14} /></button>
      </div>
      <div className="notice" data-testid="text-admin-setup-hint">Première connexion ? Créez le compte TEST dans le terminal avec <code>GIFTCARD_MODE=TEST pnpm --filter @workspace/indamora-carte-cadeau-test run create-test-admin</code>. Il n’existe pas d’inscription publique.</div>
      {session.isError && !isUnauthorizedError(session.error) && <p style={{ fontSize: 10, color: '#777', marginTop: 14 }} data-testid="status-admin-session">Session admin indisponible · réessayez après vérification du service test.</p>}
    </form>
  </main></Shell>;
}

function AdminDashboard({ username }: { username: string }) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuedCards, setIssuedCards] = useState<GiftcardCreated[]>([]);
  const [printCard, setPrintCard] = useState<GiftcardCreated | null>(null);
  const [redeemCard, setRedeemCard] = useState<Giftcard | null>(null);
  const params = useMemo(() => ({ q: search.trim() || undefined, status: statusFilter ? statusFilter as GiftcardStatusType : undefined, offset: 0, limit: 40 }), [search, statusFilter]);
  const dashboard = useGetGiftcardDashboard({ query: { queryKey: getGetGiftcardDashboardQueryKey() } });
  const cards = useListGiftcards(params, { query: { queryKey: getListGiftcardsQueryKey(params) } });
  const partners = useListGiftcardPartners({ query: { queryKey: getListGiftcardPartnersQueryKey() } });
  const audit = useListGiftcardAudit({ limit: 8 }, { query: { queryKey: getListGiftcardAuditQueryKey({ limit: 8 }) } });
  const logout = useLogoutGiftcardAdmin({ mutation: { onSuccess: () => { queryClientInvalidate(); setLocation('/admin'); } } });
  const create = useCreateGiftcard();
  const batch = useCreateGiftcardBatch();
  const statusMutation = useUpdateGiftcardStatus();
  const redeemMutation = useRedeemGiftcard();
  const partnerMutation = useUpdateGiftcardPartner();
  const csv = useExportGiftcardsCsv({ q: search.trim() || undefined, status: statusFilter ? statusFilter as GiftcardStatusType : undefined }, { query: { enabled: false, queryKey: getExportGiftcardsCsvQueryKey({ q: search.trim() || undefined, status: statusFilter ? statusFilter as GiftcardStatusType : undefined }) } });
  const queryClient = useQueryClient();
  function queryClientInvalidate() {
    void queryClient.invalidateQueries({ queryKey: getGetGiftcardAdminSessionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetGiftcardDashboardQueryKey() });
  }
  const refreshManagement = () => {
    void queryClient.invalidateQueries({ queryKey: getGetGiftcardDashboardQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListGiftcardsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListGiftcardAuditQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListGiftcardPartnersQueryKey() });
  };
  const [flash, setFlash] = useState('');
  const doExport = async () => {
    try {
      const result = await csv.refetch();
      if (result.data) {
        const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'cartes-test-indamora.csv'; anchor.click();
        URL.revokeObjectURL(url);
        setFlash('Export téléchargé. Les PIN ne figurent pas dans le fichier.');
      }
    } catch { setFlash('Export indisponible. Réessayez dans un instant.'); }
  };
  const markStatus = (card: Giftcard, next: GiftcardStatusType) => statusMutation.mutate({ id: card.id, data: { status: next } }, { onSuccess: refreshManagement, onError: () => setFlash('Modification impossible. Réessayez.') });
  const saveIssue = (amountCents: number, count: number, expiresAt: string, activateNow: boolean) => {
    const data = { amountCents, expiresAt: expiresAt || null, activateNow };
    if (count > 1) batch.mutate({ data: { ...data, count } }, { onSuccess: response => { setIssuedCards(response.cards); setIssueOpen(false); refreshManagement(); }, onError: () => setFlash('Émission groupée impossible. Vérifiez le montant et réessayez.') });
    else create.mutate({ data }, { onSuccess: response => { setIssuedCards([response]); setIssueOpen(false); refreshManagement(); }, onError: () => setFlash('Émission impossible. Vérifiez le montant et réessayez.') });
  };
  const doRedeem = (amountCents: number, note: string) => {
    if (!redeemCard) return;
    redeemMutation.mutate({ id: redeemCard.id, data: { amountCents, idempotencyKey: crypto.randomUUID(), note: note || undefined } }, { onSuccess: () => { setRedeemCard(null); refreshManagement(); setFlash('Rachat simulé enregistré. Aucun paiement réel.'); }, onError: () => setFlash('Opération refusée. Vérifiez le solde de cette carte.') });
  };
  const doPartner = (code: string, enabled: boolean) => partnerMutation.mutate({ code, data: { enabled } }, { onSuccess: refreshManagement, onError: () => setFlash('État du partenaire test non modifié.') });
  return <Shell>
    <div className="admin-layout">
      <aside className="admin-rail" aria-label="Navigation administration">
        <div className="rail-heading">Espace gestion</div>
        <a href="#dashboard" className={`rail-link ${location === '/admin' ? 'active' : ''}`} onClick={() => setLocation('/admin')} data-testid="link-admin-dashboard"><Activity size={15} /> Vue d’ensemble</a>
        <a href="#cards" className="rail-link" onClick={() => document.getElementById('cards')?.scrollIntoView({ behavior: 'smooth' })} data-testid="link-admin-cards"><Ticket size={15} /> Cartes test</a>
        <a href="#partners" className="rail-link" onClick={() => document.getElementById('partners')?.scrollIntoView({ behavior: 'smooth' })} data-testid="link-admin-partners"><BadgeCheck size={15} /> Partenaires test</a>
        <a href="#audit" className="rail-link" onClick={() => document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth' })} data-testid="link-admin-audit"><ShieldCheck size={15} /> Journal d’activité</a>
        <div className="rail-foot">INDAMORA RECORDS<br />ENVIRONNEMENT ISOLÉ · TEST</div>
      </aside>
      <main className="admin-main" id="dashboard">
        <div className="admin-topline">
          <div><span className="eyebrow">Tableau de gestion · TEST</span><h1>Bonjour, {username}.</h1><p>Vos cartes et opérations simulées, réunies au même endroit.</p></div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-small" onClick={doExport} disabled={csv.isFetching} data-testid="button-export-csv"><Download size={14} />{csv.isFetching ? 'Préparation…' : 'Exporter CSV'}</button>
            <button className="btn btn-primary btn-small" onClick={() => setIssueOpen(true)} data-testid="button-new-giftcard"><Plus size={15} /> Émettre des cartes</button>
            <button className="icon-btn" onClick={() => logout.mutate()} disabled={logout.isPending} aria-label="Se déconnecter" data-testid="button-admin-logout"><LogOut size={15} /></button>
          </div>
        </div>
        {flash && <div className="notice" role="status" data-testid="status-admin-message">{flash}<button className="icon-btn" style={{ float: 'right' }} aria-label="Fermer le message" onClick={() => setFlash('')} data-testid="button-dismiss-message"><X size={12} /></button></div>}
        {dashboard.isLoading ? <div className="stats-grid">{[1,2,3,4].map(i => <div key={i} className="stat-card"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 18, width: '65%' }} /></div>)}</div> : dashboard.isError ? <div className="alert" role="alert" data-testid="error-dashboard">Le tableau de bord est indisponible. Actualisez la page pour réessayer.</div> : dashboard.data && <div className="stats-grid" data-testid="group-dashboard-stats">
          <Stat label="Cartes émises" value={dashboard.data.totalCards.toLocaleString('fr-FR')} hint={`${dashboard.data.activeCards} actives`} />
          <Stat label="Valeur initiale" value={money(dashboard.data.startingValueCents)} hint="Cumul des émissions test" />
          <Stat label="Solde restant" value={money(dashboard.data.remainingValueCents)} hint={`${dashboard.data.blockedCards} bloquées`} />
          <Stat label="Utilisé en simulation" value={money(dashboard.data.redeemedValueCents)} hint="Aucun paiement réel" />
        </div>}
        <div className="admin-columns">
          <section className="panel" id="cards">
            <div className="section-card-head"><div><h3>Cartes émises</h3><div className="field-hint" style={{ marginTop: 5 }}>Recherche, état, impression et actions de simulation</div></div><button className="icon-btn" onClick={refreshManagement} aria-label="Actualiser les cartes" data-testid="button-refresh-cards">Actualiser</button></div>
            <div className="table-tools">
              <div className="tool-group"><label className="sr-only" htmlFor="search-cards">Rechercher une carte</label><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Search size={14} /><input id="search-cards" className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Numéro de carte…" data-testid="input-search-cards" /></span>
                <label className="sr-only" htmlFor="filter-status">Filtrer par état</label><select id="filter-status" className="select-compact" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="select-card-status"><option value="">Tous les états</option>{statuses.map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}</select></div>
            </div>
            {cards.isLoading ? <div className="loading-lines"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : cards.isError ? <div className="error-state" data-testid="error-card-list">Liste indisponible. Réessayez après actualisation.</div> : !cards.data?.cards.length ? <div className="empty-state" data-testid="empty-card-list">Aucune carte ne correspond à ces critères.<br />Émettez une carte de test pour commencer.</div> : <div className="table-wrap"><table className="cards-table"><thead><tr><th>Carte</th><th>Montant</th><th>Solde</th><th>État</th><th>Créée</th><th>Actions</th></tr></thead><tbody>
              {cards.data.cards.map(card => <AdminCardRow key={card.id} card={card} onStatus={markStatus} onRedeem={() => setRedeemCard(card)} pending={statusMutation.isPending} />)}
            </tbody></table></div>}
            {cards.data && <div className="field-hint" style={{ padding: '12px 16px' }} data-testid="text-card-total">{cards.data.total} carte{cards.data.total !== 1 ? 's' : ''} au total · liste limitée à 40 résultats</div>}
          </section>
          <div>
            <section className="panel section-card" id="partners">
              <div className="section-card-head"><div><h3>Partenaires de test</h3><div className="field-hint" style={{ marginTop: 5 }}>Connexions simulées uniquement</div></div></div>
              <div className="section-card-body">
                {partners.isLoading ? <div className="skeleton" /> : partners.isError ? <div className="error-state" data-testid="error-partners">Partenaires indisponibles.</div> : !partners.data?.length ? <div className="empty-state">Aucun partenaire simulé configuré.</div> : partners.data.map(partner => <div className="partner-row" key={partner.code} data-testid={`row-partner-${partner.code}`}><div><strong>{partner.displayName}</strong><div className="field-hint">{partner.disclaimer}</div><div className="field-hint" style={{ color: 'var(--coral)' }}>Partenaire fictif · TEST</div></div><button role="switch" aria-checked={partner.enabled} aria-label={`${partner.enabled ? 'Désactiver' : 'Activer'} ${partner.displayName}`} className="toggle" onClick={() => doPartner(partner.code, !partner.enabled)} data-testid={`toggle-partner-${partner.code}`} /></div>)}
              </div>
            </section>
            <section className="panel section-card" id="audit">
              <div className="section-card-head"><div><h3>Journal d’activité</h3><div className="field-hint" style={{ marginTop: 5 }}>Actions administrateur récentes</div></div></div>
              <div className="section-card-body">
                {audit.isLoading ? <div className="skeleton" /> : audit.isError ? <div className="error-state" data-testid="error-audit">Journal indisponible.</div> : !audit.data?.length ? <div className="empty-state" data-testid="empty-audit">Aucune activité enregistrée.</div> : audit.data.map(item => <div className="audit-row" key={item.id} data-testid={`row-audit-${item.id}`}><span>{humanAction(item.action)}{item.cardNumber && <small>{item.cardNumber}</small>}<small>{item.adminUsername} · {dateTime(item.createdAt)}</small></span><Eye size={13} color="#7d8e82" /></div>)}
              </div>
            </section>
            <div className="notice" data-testid="text-admin-simulation-note">Toutes les opérations et partenaires de cet espace sont fictifs. Aucun règlement ni commerçant réel n’est impliqué.</div>
          </div>
        </div>
      </main>
    </div>
    {issueOpen && <IssueModal onClose={() => setIssueOpen(false)} onSubmit={saveIssue} pending={create.isPending || batch.isPending} />}
    {issuedCards.length > 0 && <IssuedModal items={issuedCards} onClose={() => setIssuedCards([])} onPrint={setPrintCard} />}
    {redeemCard && <RedeemModal card={redeemCard} onClose={() => setRedeemCard(null)} onSubmit={doRedeem} pending={redeemMutation.isPending} />}
    {printCard && <PrintModal item={printCard} onClose={() => setPrintCard(null)} />}
  </Shell>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="stat-card" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function AdminCardRow({ card, onStatus, onRedeem, pending }: { card: Giftcard; onStatus: (card: Giftcard, status: GiftcardStatusType) => void; onRedeem: () => void; pending: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const transactions = useGetGiftcardTransactions(card.id, { query: { enabled: expanded, queryKey: getGetGiftcardTransactionsQueryKey(card.id) } });
  return <>
    <tr data-testid={`row-card-${card.id}`}>
      <td><button className="icon-btn card-num" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} data-testid={`button-transactions-${card.id}`}>{card.cardNumber}</button></td>
      <td>{money(card.startingBalanceCents)}</td><td>{money(card.balanceCents)}</td>
      <td><span className={`status-chip status-${card.status}`} data-testid={`status-card-${card.id}`}>{statusLabel[card.status]}</span></td>
      <td>{date(card.createdAt)}</td>
      <td><div className="row-actions">
        <select aria-label={`Changer l’état de la carte ${card.cardNumber}`} className="select-compact" value={card.status} disabled={pending} onChange={e => onStatus(card, e.target.value as GiftcardStatusType)} data-testid={`select-status-${card.id}`}>{statuses.map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}</select>
        <button className="icon-btn" onClick={onRedeem} disabled={pending || card.status !== GiftcardStatus.active} title="Simuler une utilisation" data-testid={`button-redeem-${card.id}`}><ArrowUpRight size={13} /></button>
      </div></td>
    </tr>
    {expanded && <tr><td colSpan={6}><div style={{ padding: '5px 0' }}>{transactions.isLoading ? 'Chargement…' : transactions.isError ? 'Transactions indisponibles.' : !transactions.data?.length ? 'Aucune transaction.' : transactions.data.map(tx => <TransactionRow key={tx.id} transaction={tx} />)}</div></td></tr>}
  </>;
}

function IssueModal({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: (amount: number, count: number, expiresAt: string, activate: boolean) => void; pending: boolean }) {
  const [amount, setAmount] = useState('25');
  const [count, setCount] = useState('1');
  const [custom, setCustom] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [activate, setActivate] = useState(true);
  const supported = ['10', '20', '25', '50', '100'];
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(Math.round(Number(amount) * 100), Number(count), expiry ? new Date(`${expiry}T23:59:59`).toISOString() : '', activate); };
  return <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="issue-title" data-testid="form-create-giftcard">
    <div className="modal-head"><div><span className="eyebrow">Émission administrateur · TEST</span><h2 id="issue-title">Créer des cartes cadeau</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer" data-testid="button-close-create"><X size={16} /></button></div>
    <div className="modal-content">
      <div className="form-stack">
        <div className="field"><label htmlFor="issue-amount">Montant par carte</label><select id="issue-amount" value={custom ? 'custom' : amount} onChange={e => { if (e.target.value === 'custom') setCustom(true); else { setCustom(false); setAmount(e.target.value); } }} data-testid="select-issue-denomination">{supported.map(a => <option key={a} value={a}>{a} €</option>)}<option value="custom">Montant personnalisé</option></select></div>
        {custom && <div className="field"><label htmlFor="custom-amount">Montant personnalisé (€)</label><input id="custom-amount" type="number" min="10" max="1000" step=".01" value={amount} onChange={e => setAmount(e.target.value)} required data-testid="input-custom-amount" /><span className="field-hint">Montant disponible uniquement depuis l’administration. Plage de test : 10 € à 1 000 €.</span></div>}
        <div className="field"><label htmlFor="issue-count">Nombre de cartes</label><input id="issue-count" type="number" min="1" max="50" value={count} onChange={e => setCount(e.target.value)} required data-testid="input-issue-count" /></div>
        <div className="field"><label htmlFor="issue-expiry">Date d’expiration (facultative)</label><input id="issue-expiry" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} data-testid="input-issue-expiry" /></div>
        <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 11 }}><input type="checkbox" checked={activate} onChange={e => setActivate(e.target.checked)} data-testid="checkbox-activate-now" /> Activer immédiatement les cartes</label>
        <div className="one-time-warning">Un PIN à six chiffres sera généré pour chaque carte. Il sera affiché uniquement dans la réponse de création et ne sera pas conservé dans le navigateur.</div>
      </div>
    </div>
    <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-create">Annuler</button><button className="btn btn-primary" type="submit" disabled={pending} data-testid="button-confirm-create">{pending ? 'Émission…' : `Émettre ${count} carte${Number(count) > 1 ? 's' : ''}`}</button></div>
  </form></div>;
}

function IssuedModal({ items, onClose, onPrint }: { items: GiftcardCreated[]; onClose: () => void; onPrint: (card: GiftcardCreated) => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="issued-title" data-testid="dialog-issued-cards">
    <div className="modal-head"><div><span className="eyebrow">Réponse ponctuelle · TEST</span><h2 id="issued-title">{items.length > 1 ? `${items.length} cartes émises` : 'Carte émise'}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Fermer les PIN" data-testid="button-close-issued"><X size={16} /></button></div>
    <div className="modal-content"><div className="one-time-warning">Copiez ou imprimez ces informations maintenant. Après fermeture, les PIN ne seront plus affichés et ne peuvent pas être récupérés ici.</div>
      <div className="created-list">{items.map(item => <div className="created-item" key={item.card.id} data-testid={`item-issued-card-${item.card.id}`}><span>{item.card.cardNumber}<br /><span style={{ color: '#777' }}>{money(item.card.startingBalanceCents)} · {statusLabel[item.card.status]}</span></span><span>PIN&nbsp; <strong>{item.pin}</strong><br /><button className="icon-btn" style={{ marginTop: 6 }} onClick={() => onPrint(item)} data-testid={`button-print-card-${item.card.id}`}><Printer size={12} /> Imprimer</button></span></div>)}</div>
    </div>
    <div className="modal-actions"><button className="btn btn-primary" onClick={onClose} data-testid="button-dismiss-issued">J’ai noté les PIN</button></div>
  </section></div>;
}

function PrintModal({ item, onClose }: { item: GiftcardCreated; onClose: () => void }) {
  const [qrSrc, setQrSrc] = useState('');
  useEffect(() => { let alive = true; QRCode.toDataURL(item.card.qrUrl, { width: 300, margin: 1, color: { dark: '#253d39', light: '#fffaf0' } }).then(src => { if (alive) setQrSrc(src); }).catch(() => setQrSrc('')); return () => { alive = false; }; }, [item.card.qrUrl]);
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="print-title">
    <div className="modal-head"><div><span className="eyebrow">Impression · 85,60 × 53,98 mm</span><h2 id="print-title">Recto et verso</h2></div><button className="icon-btn" onClick={onClose} aria-label="Fermer l’aperçu" data-testid="button-close-print"><X size={16} /></button></div>
    <div className="modal-content"><div className="print-pair">
      <article className="print-card print-front" data-testid="print-card-front"><div className="print-brand">INDAMORA RECORDS</div><div className="print-title">Carte cadeau solidaire · TEST</div><div className="print-value">{money(item.card.startingBalanceCents)}</div><div style={{ position: 'absolute', bottom: '5mm', left: '7mm', font: '6pt var(--app-font-mono)', zIndex: 1 }}>Une attention à partager</div></article>
      <article className="print-card print-back" data-testid="print-card-back"><div className="print-brand">INDAMORA · TEST</div><div className="print-number" style={{ marginTop: '4mm' }}>N° {item.card.cardNumber}</div><div className="print-pin">PIN : <strong>{item.pin}</strong></div><div className="print-qr" aria-label="QR code de référence">{qrSrc && <img src={qrSrc} alt="QR code de référence aléatoire" style={{ width: '100%', height: '100%' }} />}</div><div className="print-terms">Carte de test sans valeur monétaire réelle. Les partenaires et transactions sont simulés. QR : référence uniquement, aucun solde encodé. Gardez votre PIN confidentiel.</div></article>
    </div></div>
    <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-print">Fermer</button><button className="btn btn-primary" onClick={() => window.print()} disabled={!qrSrc} data-testid="button-print"><Printer size={14} /> Imprimer les deux faces</button></div>
  </section></div>;
}

function RedeemModal({ card, onClose, onSubmit, pending }: { card: Giftcard; onClose: () => void; onSubmit: (amount: number, note: string) => void; pending: boolean }) {
  const [amount, setAmount] = useState((Math.min(card.balanceCents, 1000) / 100).toFixed(2));
  const [note, setNote] = useState('');
  return <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={e => { e.preventDefault(); onSubmit(Math.round(Number(amount) * 100), note); }} role="dialog" aria-modal="true" aria-labelledby="redeem-title" data-testid="form-redeem-card">
    <div className="modal-head"><div><span className="eyebrow">Opération simulée · TEST</span><h2 id="redeem-title">Simuler une utilisation</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer" data-testid="button-close-redeem"><X size={16} /></button></div>
    <div className="modal-content"><p className="panel-copy">Carte {card.cardNumber} · solde disponible {money(card.balanceCents)}. Cette action ne déclenche aucun paiement.</p>
      <div className="form-stack"><div className="field"><label htmlFor="redeem-amount">Montant simulé (€)</label><input id="redeem-amount" type="number" min=".01" max={(card.balanceCents / 100).toFixed(2)} step=".01" value={amount} onChange={e => setAmount(e.target.value)} required data-testid="input-redeem-amount" /></div>
      <div className="field"><label htmlFor="redeem-note">Note (facultative)</label><input id="redeem-note" maxLength={160} value={note} onChange={e => setNote(e.target.value)} placeholder="Description de la simulation" data-testid="input-redeem-note" /></div></div>
    </div><div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={onClose} data-testid="button-cancel-redeem">Annuler</button><button className="btn btn-coral" type="submit" disabled={pending} data-testid="button-confirm-redeem">{pending ? 'Simulation…' : 'Confirmer la simulation'}</button></div>
  </form></div>;
}

function humanAction(action: string) {
  const labels: Record<string, string> = { card_created: 'Carte émise', batch_created: 'Lot émis', status_changed: 'État modifié', redeemed: 'Utilisation simulée', partner_updated: 'Partenaire test modifié', login: 'Connexion admin' };
  return labels[action] ?? action.replaceAll('_', ' ');
}

function NotFound() {
  return <Shell><main className="page-container"><span className="eyebrow">Erreur 404 · TEST</span><h1 className="page-title">Cette page n’existe pas.</h1><Link className="btn btn-primary" href="/" data-testid="link-not-found-home">Retour à l’accueil</Link></main></Shell>;
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/solde" component={Solde} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

export default App;
