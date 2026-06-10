import { Router } from 'express';
import { eq, and, desc, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { comment, document, treeNode, workspaceMember, user } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createCommentSchema, updateCommentSchema } from '@marktree/shared';
import { randomUUID } from 'crypto';
import { createNotification } from './notifications.js';

const router = Router();

async function checkAccess(userId: string, workspaceId: string, minRole: string): Promise<boolean> {
  const member = await db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .get();
  if (!member) return false;
  const roles = ['viewer', 'editor', 'admin', 'owner'];
  return roles.indexOf(member.role) >= roles.indexOf(minRole);
}

// List comments for a document
router.get('/document/:documentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = req.params.documentId as string;

  const doc = await db.select().from(document).where(eq(document.id, docId)).get();
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Tree node not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Get all top-level comments
  const comments = await db
    .select({
      id: comment.id,
      documentId: comment.documentId,
      authorId: comment.authorId,
      content: comment.content,
      resolved: comment.resolved,
      parentId: comment.parentId,
      anchorFrom: comment.anchorFrom,
      anchorTo: comment.anchorTo,
      yjsRelPosStart: comment.yjsRelPosStart,
      yjsRelPosEnd: comment.yjsRelPosEnd,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      authorName: user.name,
    })
    .from(comment)
    .leftJoin(user, eq(comment.authorId, user.id))
    .where(and(eq(comment.documentId, docId), isNull(comment.parentId)))
    .orderBy(desc(comment.createdAt))
    .all();

  if (comments.length === 0) {
    res.json([]);
    return;
  }

  // Get all replies for this document
  const parentIds = comments.map(c => c.id);
  let allReplies: typeof comments = [];
  if (parentIds.length > 0) {
    allReplies = await db
      .select({
        id: comment.id,
        documentId: comment.documentId,
        authorId: comment.authorId,
        content: comment.content,
        resolved: comment.resolved,
        parentId: comment.parentId,
        anchorFrom: comment.anchorFrom,
        anchorTo: comment.anchorTo,
        yjsRelPosStart: comment.yjsRelPosStart,
        yjsRelPosEnd: comment.yjsRelPosEnd,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        authorName: user.name,
      })
      .from(comment)
      .leftJoin(user, eq(comment.authorId, user.id))
      .where(and(eq(comment.documentId, docId), inArray(comment.parentId, parentIds)))
      .orderBy(desc(comment.createdAt))
      .all();
  }

  const replyMap = new Map<string, typeof allReplies>();
  for (const r of allReplies) {
    if (r.parentId) {
      if (!replyMap.has(r.parentId)) replyMap.set(r.parentId, []);
      replyMap.get(r.parentId)!.push(r);
    }
  }

  const result = comments.map(c => ({
    ...c,
    replies: replyMap.get(c.id) || [],
  }));

  res.json(result);
});

// Create a comment
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const doc = await db.select().from(document).where(eq(document.id, parsed.data.documentId)).get();
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Tree node not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'editor');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const id = randomUUID();
  await db.insert(comment).values({
    id,
    documentId: parsed.data.documentId,
    authorId: userId,
    content: parsed.data.content,
    parentId: parsed.data.parentId || null,
    anchorFrom: parsed.data.anchorFrom ?? null,
    anchorTo: parsed.data.anchorTo ?? null,
    yjsRelPosStart: parsed.data.yjsRelPosStart || null,
    yjsRelPosEnd: parsed.data.yjsRelPosEnd || null,
  });

  // Create notifications for mentions and document collaborators
  try {
    const doc = await db.select().from(document).where(eq(document.id, parsed.data.documentId)).get();
    if (doc) {
      const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
      if (node) {
        const members = await db
          .select()
          .from(workspaceMember)
          .where(eq(workspaceMember.workspaceId, node.workspaceId))
          .all();
        for (const member of members) {
          if (member.userId !== userId) {
            await createNotification({
              userId: member.userId,
              type: 'comment',
              content: `New comment on "${doc.title}"`,
              relatedDocumentId: doc.id,
              relatedCommentId: id,
            });
          }
        }
      }
    }
  } catch {
    // notification creation is best-effort
  }

  const created = await db
    .select({
      id: comment.id,
      documentId: comment.documentId,
      authorId: comment.authorId,
      content: comment.content,
      resolved: comment.resolved,
      parentId: comment.parentId,
      anchorFrom: comment.anchorFrom,
      anchorTo: comment.anchorTo,
      yjsRelPosStart: comment.yjsRelPosStart,
      yjsRelPosEnd: comment.yjsRelPosEnd,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      authorName: user.name,
    })
    .from(comment)
    .leftJoin(user, eq(comment.authorId, user.id))
    .where(eq(comment.id, id))
    .get();

  res.status(201).json(created);
});

// Update a comment (resolve/unresolve or edit)
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = updateCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const commentId = req.params.id as string;

  const existing = await db.select().from(comment).where(eq(comment.id, commentId)).get();
  if (!existing) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  if (parsed.data.content !== undefined && existing.authorId !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const doc = await db.select().from(document).where(eq(document.id, existing.documentId)).get();
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Tree node not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'editor');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.resolved !== undefined) updates.resolved = parsed.data.resolved;

  await db.update(comment).set(updates).where(eq(comment.id, commentId));

  const updated = await db
    .select({
      id: comment.id,
      documentId: comment.documentId,
      authorId: comment.authorId,
      content: comment.content,
      resolved: comment.resolved,
      parentId: comment.parentId,
      anchorFrom: comment.anchorFrom,
      anchorTo: comment.anchorTo,
      yjsRelPosStart: comment.yjsRelPosStart,
      yjsRelPosEnd: comment.yjsRelPosEnd,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      authorName: user.name,
    })
    .from(comment)
    .leftJoin(user, eq(comment.authorId, user.id))
    .where(eq(comment.id, commentId))
    .get();

  res.json(updated);
});

// Delete a comment
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const commentId = req.params.id as string;

  const existing = await db.select().from(comment).where(eq(comment.id, commentId)).get();
  if (!existing) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  if (existing.authorId !== userId) {
    const doc = await db.select().from(document).where(eq(document.id, existing.documentId)).get();
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
    if (!node) {
      res.status(404).json({ error: 'Tree node not found' });
      return;
    }
    const member = await db
      .select()
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, node.workspaceId), eq(workspaceMember.userId, userId)))
      .get();
    if (!member || !['admin', 'owner'].includes(member.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  await db.delete(comment).where(eq(comment.parentId, commentId));
  await db.delete(comment).where(eq(comment.id, commentId));

  res.status(204).send();
});

export default router;
