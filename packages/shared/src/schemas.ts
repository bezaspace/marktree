import { z } from 'zod';

// Workspace schemas
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

// TreeNode schemas
export const createTreeNodeSchema = z.object({
  workspaceId: z.string(),
  parentId: z.string().nullable(),
  name: z.string().min(1).max(255),
  type: z.enum(['folder', 'document']),
  sortOrder: z.number().int().default(0),
});

export const updateTreeNodeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

// Document schemas
export const createDocumentSchema = z.object({
  treeNodeId: z.string(),
  title: z.string().min(1).max(255),
});

export const updateDocumentSchema = z.object({
  content: z.string().optional(),
  title: z.string().min(1).max(255).optional(),
});

// Auth-related schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});
