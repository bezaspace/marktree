import { Router } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workspace, workspaceMember } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createWorkspaceSchema, updateWorkspaceSchema } from '@marktree/shared';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { initGitRepo } from '../lib/git.js';

const router = Router();
const GIT_REPOS_DIR = process.env.GIT_REPOS_DIR || './data/repos';
mkdirSync(GIT_REPOS_DIR, { recursive: true });

// List user's workspaces
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const memberWorkspaces = await db
    .select()
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId));

  const workspaceIds = memberWorkspaces.map(m => m.workspaceId);
  if (workspaceIds.length === 0) {
    res.json([]);
    return;
  }

  const workspaces = await db
    .select()
    .from(workspace)
    .where(inArray(workspace.id, workspaceIds));

  res.json(workspaces);
});

// Get single workspace
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const wsId = req.params.id as string;

  const member = await db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, wsId), eq(workspaceMember.userId, userId)))
    .get();

  if (!member) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ws = await db.select().from(workspace).where(eq(workspace.id, wsId)).get();
  if (!ws) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(ws);
});

// Create workspace
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const id = randomUUID();
  const repoPath = join(GIT_REPOS_DIR, id);

  await db.insert(workspace).values({
    id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    ownerId: userId,
    gitRepoPath: repoPath,
  });

  await db.insert(workspaceMember).values({
    workspaceId: id,
    userId,
    role: 'owner',
  });

  mkdirSync(repoPath, { recursive: true });
  await initGitRepo(repoPath);

  const ws = await db.select().from(workspace).where(eq(workspace.id, id)).get();
  res.status(201).json(ws);
});

// Update workspace
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = updateWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const userId = req.user!.id;
  const wsId = req.params.id as string;

  const member = await db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, wsId), eq(workspaceMember.userId, userId)))
    .get();

  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  await db.update(workspace).set(updates).where(eq(workspace.id, wsId));
  const ws = await db.select().from(workspace).where(eq(workspace.id, wsId)).get();
  res.json(ws);
});

// Delete workspace
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const wsId = req.params.id as string;

  const member = await db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, wsId), eq(workspaceMember.userId, userId)))
    .get();

  if (!member || member.role !== 'owner') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.delete(workspace).where(eq(workspace.id, wsId));
  res.status(204).send();
});

export default router;
