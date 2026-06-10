import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { document, treeNode, workspaceMember } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createDocumentSchema, updateDocumentSchema } from '@marktree/shared';
import { randomUUID } from 'crypto';

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

// List documents for a tree node
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const treeNodeId = req.query.treeNodeId as string;
  if (!treeNodeId) {
    res.status(400).json({ error: 'treeNodeId required' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Tree node not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const docs = await db.select().from(document).where(eq(document.treeNodeId, treeNodeId));
  res.json(docs);
});

// Get document
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = req.params.id as string;

  const doc = await db
    .select()
    .from(document)
    .where(eq(document.id, docId))
    .get();

  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.json(doc);
});

// Create document
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = createDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const node = await db.select().from(treeNode).where(eq(treeNode.id, parsed.data.treeNodeId)).get();
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
  await db.insert(document).values({
    id,
    treeNodeId: parsed.data.treeNodeId,
    title: parsed.data.title,
    currentContent: '',
  });

  const doc = await db.select().from(document).where(eq(document.id, id)).get();
  res.status(201).json(doc);
});

// Update document
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = updateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const docId = req.params.id as string;

  const doc = await db.select().from(document).where(eq(document.id, docId)).get();
  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'editor');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.content !== undefined) {
    updates.currentContent = parsed.data.content;
    updates.lastModifiedAt = new Date();
  }
  if (parsed.data.title) updates.title = parsed.data.title;

  await db.update(document).set(updates).where(eq(document.id, docId));
  const updated = await db.select().from(document).where(eq(document.id, docId)).get();
  res.json(updated);
});

// Delete document
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = req.params.id as string;

  const doc = await db.select().from(document).where(eq(document.id, docId)).get();
  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const node = await db.select().from(treeNode).where(eq(treeNode.id, doc.treeNodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'editor');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.delete(document).where(eq(document.id, docId));
  res.status(204).send();
});

export default router;
