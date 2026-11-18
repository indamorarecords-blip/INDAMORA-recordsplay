import { clerkMiddleware } from '@clerk/express';
import type { Request, Response, NextFunction } from 'express';

export const authenticateClerk = clerkMiddleware();

export function requireClerkAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { getAuth } = require('@clerk/express');

  const auth = getAuth(req);

  if (!auth.isAuthenticated || !auth.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentification requise.',
    });
  }

  next();
}
