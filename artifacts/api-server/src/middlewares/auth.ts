import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

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
  return Boolean(
    primaryEmail &&
      primaryEmail.emailAddress.toLowerCase() === ADMIN_EMAIL &&
      primaryEmail.verification?.status === "verified",
  );
};