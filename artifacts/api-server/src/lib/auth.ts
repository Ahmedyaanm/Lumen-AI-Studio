import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & { userId: string };

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to use the build workspace." });
    return;
  }

  (req as AuthenticatedRequest).userId = userId;
  next();
}

export function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}