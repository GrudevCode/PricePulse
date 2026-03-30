/**
 * Legacy auth routes — replaced by Clerk.
 *
 * /register and /login are no longer used; all authentication is handled by
 * Clerk on the frontend.  The /refresh endpoint is kept temporarily so any
 * old sessions in local storage can drain gracefully, but it now returns 410.
 *
 * Safe to delete this file and the app.use('/api/auth', ...) line in index.ts
 * once you're confident no clients carry old JWT refresh tokens.
 */
import { Router, Request, Response } from 'express';

const router = Router();

const gone = (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'This endpoint has been removed. Please sign in with Clerk.',
  });
};

router.post('/register', gone);
router.post('/login',    gone);
router.post('/refresh',  gone);

export default router;
