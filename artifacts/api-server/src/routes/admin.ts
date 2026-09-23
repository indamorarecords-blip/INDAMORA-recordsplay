import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
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

type AdminDirectoryStatus =
  | "all"
  | "no-profile"
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "unpublished";

type AdminDirectoryScope = "all" | "users" | "profiles" | "artists" | "professionals";
type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUserList>>["data"][number];

const directoryStatuses: AdminDirectoryStatus[] = [
  "all",
  "no-profile",
  "pending",
  "approved",
  "rejected",
  "published",
  "unpublished",
];
const directoryScopes: AdminDirectoryScope[] = [
  "all",
  "users",
  "profiles",
  "artists",
  "professionals",
];

function asIsoDate(value: Date | number | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function containsSearchTerm(values: Array<string | null | undefined>, search: string): boolean {
  if (!search) return true;
  const normalizedSearch = search.toLocaleLowerCase("fr-FR");
  return values.some((value) =>
    value?.toLocaleLowerCase("fr-FR").includes(normalizedSearch),
  );
}

async function getAllClerkUsers(): Promise<ClerkUser[]> {
  const users: ClerkUser[] = [];
  let offset = 0;
  const pageSize = 100;

  while (offset < 2000) {
    const page = await clerkClient.users.getUserList({ limit: pageSize, offset });
    users.push(...page.data);
    if (page.data.length < pageSize) break;
    offset += page.data.length;
  }

  return users;
}

function matchesProfileStatus(
  profile: { profileStatus: string; isPublished: string } | null,
  status: AdminDirectoryStatus,
): boolean {
  if (status === "all") return true;
  if (status === "no-profile") return profile === null;
  if (!profile) return false;
  if (status === "published") return profile.isPublished === "true";
  if (status === "unpublished") return profile.isPublished !== "true";
  return profile.profileStatus === status;
}

router.get("/admin/directory", requireAdmin, async (req, res): Promise<void> => {
  const requestedStatus = String(req.query.status ?? "all") as AdminDirectoryStatus;
  const requestedScope = String(req.query.scope ?? "all") as AdminDirectoryScope;
  const status = directoryStatuses.includes(requestedStatus) ? requestedStatus : "all";
  const scope = directoryScopes.includes(requestedScope) ? requestedScope : "all";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const [clerkUsers, profiles, works, submissions, profileAudits] = await Promise.all([
    getAllClerkUsers(),
    db.select().from(artistsTable).orderBy(desc(artistsTable.createdAt)),
    db.select().from(worksTable).orderBy(desc(worksTable.createdAt)),
    db.select().from(submissionsTable).orderBy(desc(submissionsTable.submittedAt)),
    db
      .select({
        entityId: adminAuditLogsTable.entityId,
        createdAt: adminAuditLogsTable.createdAt,
      })
      .from(adminAuditLogsTable)
      .where(eq(adminAuditLogsTable.entityType, "artist"))
      .orderBy(desc(adminAuditLogsTable.createdAt))
      .limit(1000),
  ]);

  const profileByOwnerId = new Map(
    profiles.filter((profile) => profile.ownerId).map((profile) => [profile.ownerId!, profile]),
  );
  const userById = new Map(clerkUsers.map((user) => [user.id, user]));
  const latestAuditByProfileId = new Map<string, Date>();
  for (const audit of profileAudits) {
    if (audit.entityId && !latestAuditByProfileId.has(audit.entityId)) {
      latestAuditByProfileId.set(audit.entityId, audit.createdAt);
    }
  }

  const userRows = clerkUsers
    .map((user) => {
      const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
      );
      const profile = profileByOwnerId.get(user.id) ?? null;
      const emailVerified = primaryEmail?.verification?.status === "verified";
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: primaryEmail?.emailAddress ?? null,
        createdAt: asIsoDate(user.createdAt)!,
        lastSignInAt: asIsoDate(user.lastSignInAt),
        emailVerified,
        hasProfile: Boolean(profile),
        profileId: profile?.id ?? null,
        activities: profile?.specialties ?? [],
        profileStatus: profile?.profileStatus ?? null,
        isPublished: profile?.isPublished === "true",
      };
    })
    .filter((user) => {
      const profile = user.profileId ? profiles.find((item) => item.id === user.profileId) ?? null : null;
      const userMatchesSearch = containsSearchTerm(
        [user.firstName, user.lastName, user.username, user.email, ...user.activities],
        search,
      );
      const profileMatchesScope =
        scope === "all" || scope === "users" || scope === "profiles"
          ? true
          : Boolean(profile && (scope === "artists" ? profile.profileGroup === "artists" : profile.profileGroup !== "artists"));
      return (
        (scope === "all" || scope === "users" || scope === "artists" || scope === "professionals") &&
        userMatchesSearch &&
        matchesProfileStatus(
          profile
            ? { profileStatus: profile.profileStatus, isPublished: profile.isPublished }
            : null,
          status,
        ) &&
        profileMatchesScope
      );
    });

  const profileRows = profiles
    .map((profile) => {
      const owner = profile.ownerId ? userById.get(profile.ownerId) : undefined;
      const primaryEmail = owner?.emailAddresses.find(
        (email) => email.id === owner.primaryEmailAddressId,
      );
      const profileWorks = works
        .filter((work) => work.artist.trim().toLocaleLowerCase("fr-FR") === profile.name.trim().toLocaleLowerCase("fr-FR"))
        .map((work) => ({
          id: work.id,
          title: work.title,
          artist: work.artist,
          category: work.category,
          status: "published",
          createdAt: work.createdAt.toISOString(),
        }));
      const profileSubmissions = submissions
        .filter((submission) =>
          profile.ownerId
            ? submission.ownerId === profile.ownerId
            : submission.artist.trim().toLocaleLowerCase("fr-FR") === profile.name.trim().toLocaleLowerCase("fr-FR"),
        )
        .map((submission) => ({
          id: submission.id,
          title: submission.title,
          category: submission.category,
          status: submission.status,
          submittedAt: submission.submittedAt.toISOString(),
        }));
      const updatedAt = latestAuditByProfileId.get(String(profile.id)) ?? profile.createdAt;
      return {
        id: profile.id,
        ownerId: profile.ownerId,
        firstName: owner?.firstName ?? null,
        lastName: owner?.lastName ?? null,
        email: primaryEmail?.emailAddress ?? null,
        name: profile.name,
        category: profile.category,
        subcategory: profile.subcategory,
        bio: profile.bio,
        location: profile.location,
        country: profile.country,
        phone: profile.professionalContact,
        avatar: profile.avatar,
        website: profile.website,
        socialLinks: profile.socialLinks,
        specialties: profile.specialties,
        profileGroup: profile.profileGroup,
        profileStatus: profile.profileStatus,
        isPublished: profile.isPublished === "true",
        createdAt: profile.createdAt.toISOString(),
        updatedAt: asIsoDate(updatedAt),
        publicPath:
          profile.profileStatus === "approved" && profile.isPublished === "true"
            ? `/artists/${profile.id}`
            : null,
        works: profileWorks,
        submissions: profileSubmissions,
      };
    })
    .filter((profile) => {
      const owner = profile.ownerId ? userById.get(profile.ownerId) : undefined;
      const matchesScope =
        scope === "all" ||
        scope === "profiles" ||
        (scope === "artists" ? profile.profileGroup === "artists" : scope === "professionals" ? profile.profileGroup !== "artists" : false);
      const matchesSearch = containsSearchTerm(
        [
          profile.firstName,
          profile.lastName,
          profile.email,
          profile.name,
          profile.category,
          profile.subcategory,
          profile.country,
          profile.location,
          profile.bio,
          ...profile.specialties,
          ...(owner?.username ? [owner.username] : []),
        ],
        search,
      );
      return (
        matchesScope &&
        matchesSearch &&
        matchesProfileStatus(
          { profileStatus: profile.profileStatus, isPublished: profile.isPublished ? "true" : "false" },
          status,
        )
      );
    });

  res.json({
    users: userRows,
    profiles: profileRows,
    summary: {
      users: clerkUsers.length,
      profiles: profiles.length,
      publishedProfiles: profiles.filter((profile) => profile.isPublished === "true").length,
      pendingProfiles: profiles.filter((profile) => profile.profileStatus === "pending").length,
      works: works.length,
    },
  });
});

router.patch("/admin/profiles/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const requestedStatus = req.body?.profileStatus;
  const requestedPublished = req.body?.isPublished;
  const validStatuses = ["pending", "approved", "rejected"];

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Identifiant de profil invalide." });
    return;
  }
  if (
    (requestedStatus !== undefined && !validStatuses.includes(requestedStatus)) ||
    (requestedPublished !== undefined && typeof requestedPublished !== "boolean") ||
    (requestedStatus === undefined && requestedPublished === undefined)
  ) {
    res.status(400).json({ error: "Statut de profil invalide." });
    return;
  }

  const [existing] = await db.select().from(artistsTable).where(eq(artistsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Profil introuvable." });
    return;
  }

  const nextStatus = requestedStatus ?? existing.profileStatus;
  let nextPublished = requestedPublished ?? existing.isPublished === "true";
  if (nextStatus !== "approved") nextPublished = false;

  const [updated] = await db
    .update(artistsTable)
    .set({
      profileStatus: nextStatus,
      isPublished: String(nextPublished),
    })
    .where(eq(artistsTable.id, id))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Impossible de mettre à jour le statut du profil." });
    return;
  }

  const action =
    nextStatus === "rejected"
      ? "profile.rejected"
      : nextPublished
        ? "profile.published"
        : nextStatus === "approved"
          ? "profile.approved"
          : "profile.unpublished";
  const [audit] = await db
    .insert(adminAuditLogsTable)
    .values({
      administratorId: req.clerkUserId!,
      action,
      entityType: "artist",
      entityId: String(updated.id),
      targetLabel: updated.name,
      result: "success",
    })
    .returning({ createdAt: adminAuditLogsTable.createdAt });

  res.json({
    id: updated.id,
    profileStatus: updated.profileStatus,
    isPublished: updated.isPublished === "true",
    updatedAt: (audit?.createdAt ?? new Date()).toISOString(),
  });
});

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