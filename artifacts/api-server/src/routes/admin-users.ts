import { clerkClient } from "@clerk/express";
import { db, artistsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetAdminUsersQueryParams, GetAdminUsersResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();
const pageSize = 50;

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");

  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Pagination invalide." });
    return;
  }

  const offset = query.data.offset ?? 0;
  const page = await clerkClient.users.getUserList({ limit: pageSize, offset });
  const ownerIds = page.data.map((user) => user.id);
  const profiles = ownerIds.length
    ? await db.select().from(artistsTable)
        .where(inArray(artistsTable.ownerId, ownerIds))
        .orderBy(artistsTable.id)
    : [];
  const profilesByOwner = new Map<string, typeof profiles>();
  for (const profile of profiles) {
    if (!profile.ownerId) continue;
    const owned = profilesByOwner.get(profile.ownerId) ?? [];
    owned.push(profile);
    profilesByOwner.set(profile.ownerId, owned);
  }

  const users = page.data.map((user) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
    phoneNumber: user.phoneNumbers.find((phone) => phone.id === user.primaryPhoneNumberId)?.phoneNumber
      ?? user.phoneNumbers[0]?.phoneNumber
      ?? null,
    createdAt: new Date(user.createdAt).toISOString(),
    profiles: (profilesByOwner.get(user.id) ?? []).map((profile) => ({
      id: profile.id,
      name: profile.name,
      category: profile.category,
      bio: profile.bio,
      location: profile.location,
      avatar: profile.avatar,
      worksCount: profile.worksCount,
      ownerId: profile.ownerId,
      profileGroup: profile.profileGroup,
      subcategory: profile.subcategory,
      country: profile.country,
      specialties: profile.specialties,
      website: profile.website,
      socialLinks: profile.socialLinks,
      professionalContact: profile.professionalContact,
      profileStatus: profile.profileStatus,
      isPublished: profile.isPublished === "true",
      createdAt: profile.createdAt.toISOString(),
    })),
  }));

  res.json(GetAdminUsersResponse.parse({
    users,
    totalCount: page.totalCount,
    offset,
    limit: pageSize,
  }));
});

export default router;