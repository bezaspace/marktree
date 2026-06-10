import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notification } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = Router();

// List notifications for current user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const unreadOnly = req.query.unread === 'true';

  const conditions = [eq(notification.userId, userId)];
  if (unreadOnly) {
    conditions.push(eq(notification.read, false));
  }

  const notifications = await db
    .select()
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(limit)
    .all();

  res.json(notifications);
});

// Get unread count
router.get('/unread-count', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await db
    .select({ count: db.$count(notification) })
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.read, false)))
    .get();

  res.json({ count: result?.count || 0 });
});

// Mark a notification as read
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const notifId = req.params.id as string;

  const existing = await db.select().from(notification).where(eq(notification.id, notifId)).get();
  if (!existing) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  if (existing.userId !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.update(notification).set({ read: true }).where(eq(notification.id, notifId));
  res.json({ success: true });
});

// Mark all notifications as read
router.post('/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  await db
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.userId, userId), eq(notification.read, false)));
  res.json({ success: true });
});

// Create notification (internal helper, not exposed directly)
export async function createNotification({
  userId,
  type,
  content,
  relatedDocumentId,
  relatedCommentId,
}: {
  userId: string;
  type: 'comment' | 'mention' | 'document_shared' | 'version_restored';
  content: string;
  relatedDocumentId?: string;
  relatedCommentId?: string;
}): Promise<void> {
  await db.insert(notification).values({
    id: randomUUID(),
    userId,
    type,
    content,
    relatedDocumentId: relatedDocumentId || null,
    relatedCommentId: relatedCommentId || null,
  });
}

export default router;
