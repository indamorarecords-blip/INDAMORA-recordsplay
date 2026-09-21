import { Router, type IRouter } from "express";
import { and, desc, gte, sql } from "drizzle-orm";
import {
  artistsTable,
  adminAuditLogsTable,
  billingAccountsTable,
  db,
  pressRequestsTable,
  siteVisitsTable,
  submissionsTable,
  worksTable,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { requireAdmin } from "../middlewares/auth";
import { stripeApi } from "../stripeClient";

const router: IRouter = Router();

type ActivityItem = {
  type: string;
  label: string;
  createdAt: string;
};

type StripeSubscription = { status: string; created: number };
type StripeCheckoutSession = {
  created: number;
  amount_total: number | null;
  currency: string | null;
  payment_status: string;
  metadata?: Record<string, string>;
};

async function stripeOverview() {
  try {
    const [subscriptions, sessions] = await Promise.all([
      stripeApi<{ data: StripeSubscription[] }>("/v1/subscriptions?status=all&limit=100"),
      stripeApi<{ data: StripeCheckoutSession[] }>("/v1/checkout/sessions?limit=100"),
    ]);
    const donations = sessions.data.filter(
      (session) =>
        session.metadata?.kind === "donation" && session.payment_status === "paid",
    );
    return {
      connected: true,
      activeSubscriptions: subscriptions.data.filter(
        (item) => item.status === "active" || item.status === "trialing",
      ).length,
      canceledSubscriptions: subscriptions.data.filter(
        (item) => item.status === "canceled",
      ).length,
      donations: {
        count: donations.length,
        totalEur: donations.reduce(
          (total, session) =>
            session.currency === "eur" ? total + (session.amount_total ?? 0) / 100 : total,
          0,
        ),
      },
    };
  } catch {
    return {
      connected: false,
      activeSubscriptions: null,
      canceledSubscriptions: null,
      donations: { count: null, totalEur: null },
    };
  }
}

router.get("/admin/overview", requireAdmin, async (req, res): Promise<void> => {
  const requestedDays = Number(req.query.days ?? 7);
  const days = [1, 7, 30].includes(requestedDays) ? requestedDays : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    artistCount,
    publishedArtistCount,
    workCount,
    submissionCount,
    pendingSubmissionCount,
    pressRequestCount,
    linkedBillingAccountCount,
    visitCount,
    uniqueVisitorCount,
    topPages,
    recentSubmissions,
    recentArtists,
    recentWorks,
    recentPressRequests,
    stripe,
    auditLog,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(artistsTable),
    db
      .select({ value: sql<number>`count(*)` })
      .from(artistsTable)
      .where(and(sql`${artistsTable.profileStatus} = 'approved'`, sql`${artistsTable.isPublished} = 'true'`)),
    db.select({ value: sql<number>`count(*)` }).from(worksTable),
    db.select({ value: sql<number>`count(*)` }).from(submissionsTable),
    db
      .select({ value: sql<number>`count(*)` })
      .from(submissionsTable)
      .where(sql`${submissionsTable.status} = 'pending'`),
    db
      .select({ value: sql<number>`count(*)` })
      .from(pressRequestsTable)
      .where(sql`${pressRequestsTable.status} = 'pending'`),
    db.select({ value: sql<number>`count(*)` }).from(billingAccountsTable),
    db
      .select({ value: sql<number>`count(*)` })
      .from(siteVisitsTable)
      .where(gte(siteVisitsTable.createdAt, since)),
    db
      .select({ value: sql<number>`count(distinct ${siteVisitsTable.sessionHash})` })
      .from(siteVisitsTable)
      .where(gte(siteVisitsTable.createdAt, since)),
    db
      .select({ path: siteVisitsTable.path, visits: sql<number>`count(*)` })
      .from(siteVisitsTable)
      .where(gte(siteVisitsTable.createdAt, since))
      .groupBy(siteVisitsTable.path)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
    db
      .select({ label: submissionsTable.title, createdAt: submissionsTable.submittedAt })
      .from(submissionsTable)
      .orderBy(desc(submissionsTable.submittedAt))
      .limit(5),
    db
      .select({ label: artistsTable.name, createdAt: artistsTable.createdAt })
      .from(artistsTable)
      .orderBy(desc(artistsTable.createdAt))
      .limit(5),
    db
      .select({ label: worksTable.title, createdAt: worksTable.createdAt })
      .from(worksTable)
      .orderBy(desc(worksTable.createdAt))
      .limit(5),
    db
      .select({ label: pressRequestsTable.subject, createdAt: pressRequestsTable.createdAt })
      .from(pressRequestsTable)
      .orderBy(desc(pressRequestsTable.createdAt))
      .limit(5),
    stripeOverview(),
    db
      .select()
      .from(adminAuditLogsTable)
      .orderBy(desc(adminAuditLogsTable.createdAt))
      .limit(50),
  ]);

  let userCount: number | null = null;
  try {
    const users = await clerkClient.users.getUserList({ limit: 1 });
    userCount = users.totalCount ?? users.data.length;
  } catch {
    userCount = null;
  }

  const activity: ActivityItem[] = [
    ...recentSubmissions.map((item) => ({
      type: "submission",
      label: `Œuvre proposée : ${item.label}`,
      createdAt: item.createdAt.toISOString(),
    })),
    ...recentArtists.map((item) => ({
      type: "artist",
      label: `Profil artiste : ${item.label}`,
      createdAt: item.createdAt.toISOString(),
    })),
    ...recentWorks.map((item) => ({
      type: "work",
      label: `Œuvre publiée : ${item.label}`,
      createdAt: item.createdAt.toISOString(),
    })),
    ...recentPressRequests.map((item) => ({
      type: "press",
      label: `Demande presse : ${item.label}`,
      createdAt: item.createdAt.toISOString(),
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 10);

  res.json({
    periodDays: days,
    activity,
    visits: {
      count: Number(visitCount[0]?.value ?? 0),
      uniqueVisitors: Number(uniqueVisitorCount[0]?.value ?? 0),
      topPages: topPages.map((page) => ({ path: page.path, visits: Number(page.visits) })),
    },
    counts: {
      users: userCount,
      artists: Number(artistCount[0]?.value ?? 0),
      publishedArtists: Number(publishedArtistCount[0]?.value ?? 0),
      works: Number(workCount[0]?.value ?? 0),
      submissions: Number(submissionCount[0]?.value ?? 0),
      pendingSubmissions: Number(pendingSubmissionCount[0]?.value ?? 0),
      pendingPressRequests: Number(pressRequestCount[0]?.value ?? 0),
      linkedBillingAccounts: Number(linkedBillingAccountCount[0]?.value ?? 0),
    },
    stripe,
    auditLog: auditLog.map((entry) => ({
      id: entry.id,
      administratorId: entry.administratorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      targetLabel: entry.targetLabel,
      result: entry.result,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
});

export default router;