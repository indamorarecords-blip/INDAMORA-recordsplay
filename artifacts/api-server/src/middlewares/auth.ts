import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { artistsTable, db } from "@workspace/db";

export const ADMIN_EMAIL = "indamorarecords@gmail.com";

declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      clerkIsAdmin?: boolean;
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  req.clerkUserId = userId;
  next();
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const { userId } = getAuth(req);
  if (userId) req.clerkUserId = userId;
  next();
};

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }

  if (!(await isAdminUser(userId))) {
    res.status(403).json({ error: "Accès administrateur refusé." });
    return;
  }

  req.clerkUserId = userId;
  req.clerkIsAdmin = true;
  next();
};

export const isAdminUser = async (userId: string): Promise<boolean> => {
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  const hasAdminRole = user.publicMetadata?.role === "admin";
  const isVerifiedOwner =
    primaryEmail?.emailAddress.toLowerCase() === ADMIN_EMAIL &&
    primaryEmail.verification?.status === "verified";
  return hasAdminRole || Boolean(isVerifiedOwner);
};

export const requireProfessionalProfile: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }

  if (await isAdminUser(userId)) {
    req.clerkUserId = userId;
    req.clerkIsAdmin = true;
    next();
    return;
  }

  const [profile] = await db
    .select({
      profileGroup: artistsTable.profileGroup,
      specialties: artistsTable.specialties,
    })
    .from(artistsTable)
    .where(eq(artistsTable.ownerId, userId))
    .limit(1);

  const hasStructuredActivity = Boolean(profile?.specialties.length);
  const canSubmit =
    profile?.profileGroup === "artists" ||
    profile?.profileGroup === "creations" ||
    profile?.specialties.some((activity) =>
      ["producteur", "danseur", "créateur", "vidéaste", "humoriste", "podcast"].some(
        (term) => activity.toLowerCase().includes(term),
      ),
    );

  if (!hasStructuredActivity || !canSubmit) {
    res.status(403).json({
      error: "Un profil professionnel avec une activité compatible est requis.",
    });
    return;
  }

  req.clerkUserId = userId;
  next();
};