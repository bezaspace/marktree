import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { document, treeNode, workspaceMember, workspace } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createDocumentSchema, updateDocumentSchema } from '@marktree/shared';
import { randomUUID } from 'crypto';
import { writeAndCommit, getHistory, getDiff, getContentAtCommit } from '../lib/git.js';

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

// Save document + create Git commit
router.post('/:id/save', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = req.params.id as string;
  const { content } = req.body as { content?: string };

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

  const ws = await db.select().from(workspace).where(eq(workspace.id, node.workspaceId)).get();
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  // Persist to SQLite
  await db
    .update(document)
    .set({ currentContent: content ?? '', lastModifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(document.id, docId));

  // Git commit
  const user = req.user!;
  const commitHash = await writeAndCommit(
    ws.gitRepoPath,
    `${node.path}.md`,
    content ?? '',
    `Update "${doc.title}" via web`,
    { name: user.name || 'Unknown', email: user.email || 'unknown@marktree.local' }
  );

  res.json({ commitHash });
});

// Get document version history
router.get('/:id/history', requireAuth, async (req: AuthenticatedRequest, res) => {
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

  const hasAccess = await checkAccess(userId, node.workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ws = await db.select().from(workspace).where(eq(workspace.id, node.workspaceId)).get();
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const history = await getHistory(ws.gitRepoPath, `${node.path}.md`);
  res.json(history);
});

// Diff between two commits
router.get('/:id/diff', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = req.params.id as string;
  const fromHash = req.query.from as string;
  const toHash = req.query.to as string;

  if (!fromHash || !toHash) {
    res.status(400).json({ error: 'from and to query params required' });
    return;
  }

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

  const hasAccess = await checkAccess(userId, node.workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ws = await db.select().from(workspace).where(eq(workspace.id, node.workspaceId)).get();
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const diff = await getDiff(ws.gitRepoPath, `${node.path}.md`, fromHash, toHash);
  res.json({ diff });
});

// Get content at a specific commit
router.get('/:id/content-at', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = req.params.id as string;
  const commitHash = req.query.commit as string;

  if (!commitHash) {
    res.status(400).json({ error: 'commit query param required' });
    return;
  }

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

  const hasAccess = await checkAccess(userId, node.workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ws = await db.select().from(workspace).where(eq(workspace.id, node.workspaceId)).get();
  if (!ws) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const content = await getContentAtCommit(ws.gitRepoPath, `${node.path}.md`, commitHash);
  if (content === null) {
    res.status(404).json({ error: 'Content not found at commit' });
    return;
  }

  res.json({ content });
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
