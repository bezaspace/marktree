import { Router } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { treeNode, workspaceMember, document } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createTreeNodeSchema, updateTreeNodeSchema } from '@marktree/shared';
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

// List tree nodes for a workspace
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId required' });
    return;
  }

  const hasAccess = await checkAccess(userId, workspaceId, 'viewer');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const nodes = await db
    .select()
    .from(treeNode)
    .where(eq(treeNode.workspaceId, workspaceId));

  res.json(nodes);
});

// Create tree node
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = createTreeNodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const hasAccess = await checkAccess(userId, parsed.data.workspaceId, 'editor');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const id = randomUUID();
  const parentPath = parsed.data.parentId
    ? (await db.select().from(treeNode).where(eq(treeNode.id, parsed.data.parentId)).get())?.path || ''
    : '';
  const path = parentPath ? `${parentPath}/${parsed.data.name}` : parsed.data.name;

  await db.insert(treeNode).values({
    id,
    workspaceId: parsed.data.workspaceId,
    parentId: parsed.data.parentId,
    name: parsed.data.name,
    type: parsed.data.type,
    path,
    sortOrder: parsed.data.sortOrder,
  });

  const node = await db.select().from(treeNode).where(eq(treeNode.id, id)).get();
  res.status(201).json(node);
});

// Update tree node
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = updateTreeNodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const nodeId = req.params.id as string;
  const node = await db.select().from(treeNode).where(eq(treeNode.id, nodeId)).get();
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
  if (parsed.data.name) {
    updates.name = parsed.data.name;
    const parentPath = node.parentId
      ? (await db.select().from(treeNode).where(eq(treeNode.id, node.parentId)).get())?.path || ''
      : '';
    updates.path = parentPath ? `${parentPath}/${parsed.data.name}` : parsed.data.name;
  }
  if (parsed.data.parentId !== undefined) updates.parentId = parsed.data.parentId;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

  await db.update(treeNode).set(updates).where(eq(treeNode.id, nodeId));
  const updated = await db.select().from(treeNode).where(eq(treeNode.id, nodeId)).get();
  res.json(updated);
});

// Delete tree node (recursive for folders, cascade for documents)
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const nodeId = req.params.id as string;
  const node = await db.select().from(treeNode).where(eq(treeNode.id, nodeId)).get();
  if (!node) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const hasAccess = await checkAccess(userId, node.workspaceId, 'editor');
  if (!hasAccess) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Recursively collect all descendant node IDs
  const idsToDelete: string[] = [];
  async function collectDescendants(id: string) {
    idsToDelete.push(id);
    const children = await db.select().from(treeNode).where(eq(treeNode.parentId, id));
    for (const child of children) {
      await collectDescendants(child.id);
    }
  }
  await collectDescendants(nodeId);

  // Delete associated documents for document-type nodes
  const docNodeIds = idsToDelete.filter(async (id) => {
    const n = await db.select().from(treeNode).where(eq(treeNode.id, id)).get();
    return n?.type === 'document';
  });

  // Simpler: just delete all documents whose treeNodeId is in idsToDelete
  if (idsToDelete.length > 0) {
    await db.delete(document).where(inArray(document.treeNodeId, idsToDelete));
  }

  // Delete all tree nodes
  for (const id of idsToDelete) {
    await db.delete(treeNode).where(eq(treeNode.id, id));
  }

  res.status(204).send();
});

export default router;
