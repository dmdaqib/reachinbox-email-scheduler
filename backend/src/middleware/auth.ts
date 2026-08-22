import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../auth/token.js';
import { prisma } from '../lib/prisma.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const tokenData = verifyAuthToken(token);
    if (tokenData?.userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: tokenData.userId },
        });
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            googleId: user.googleId,
          };
          return next();
        }
      } catch (err) {
        console.error('Error verifying user token in requireAuth:', err);
      }
    }
  }

  return res.status(401).json({ message: 'Authentication required' });
}
