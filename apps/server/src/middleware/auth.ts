import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = session.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
