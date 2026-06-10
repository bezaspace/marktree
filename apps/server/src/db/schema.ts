import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Better Auth tables (auto-managed, but we define them for Drizzle)
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Marktree domain tables
export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: text('owner_id').notNull().references(() => user.id),
  gitRepoPath: text('git_repo_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const workspaceMember = sqliteTable('workspace_member', {
  workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  userId: text('user_id').notNull().references(() => user.id),
  role: text('role', { enum: ['owner', 'admin', 'editor', 'viewer'] }).notNull().default('editor'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const treeNode = sqliteTable('tree_node', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  type: text('type', { enum: ['folder', 'document'] }).notNull(),
  path: text('path').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const document = sqliteTable('document', {
  id: text('id').primaryKey(),
  treeNodeId: text('tree_node_id').notNull().references(() => treeNode.id),
  title: text('title').notNull(),
  currentContent: text('current_content'),
  lastModifiedAt: integer('last_modified_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const yjsUpdate = sqliteTable('yjs_update', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => document.id),
  updateBlob: blob('update_blob').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Relations
export const workspaceRelations = relations(workspace, ({ many, one }) => ({
  owner: one(user, { fields: [workspace.ownerId], references: [user.id] }),
  members: many(workspaceMember),
  treeNodes: many(treeNode),
}));

export const workspaceMemberRelations = relations(workspaceMember, ({ one }) => ({
  workspace: one(workspace, { fields: [workspaceMember.workspaceId], references: [workspace.id] }),
  user: one(user, { fields: [workspaceMember.userId], references: [user.id] }),
}));

export const treeNodeRelations = relations(treeNode, ({ one, many }) => ({
  workspace: one(workspace, { fields: [treeNode.workspaceId], references: [workspace.id] }),
  parent: one(treeNode, { fields: [treeNode.parentId], references: [treeNode.id] }),
  children: many(treeNode),
  document: one(document, { fields: [treeNode.id], references: [document.treeNodeId] }),
}));

export const documentRelations = relations(document, ({ one, many }) => ({
  treeNode: one(treeNode, { fields: [document.treeNodeId], references: [treeNode.id] }),
  yjsUpdates: many(yjsUpdate),
}));

export const yjsUpdateRelations = relations(yjsUpdate, ({ one }) => ({
  document: one(document, { fields: [yjsUpdate.documentId], references: [document.id] }),
}));

// Phase 4: Comments & Review
export const comment = sqliteTable('comment', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => document.id),
  authorId: text('author_id').notNull().references(() => user.id),
  content: text('content').notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  parentId: text('parent_id'), // for threaded replies
  anchorFrom: integer('anchor_from'), // absolute ProseMirror position
  anchorTo: integer('anchor_to'),
  yjsRelPosStart: text('yjs_rel_pos_start'), // JSON serialized Yjs relative position
  yjsRelPosEnd: text('yjs_rel_pos_end'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const notification = sqliteTable('notification', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  type: text('type', { enum: ['comment', 'mention', 'document_shared', 'version_restored'] }).notNull(),
  content: text('content').notNull(),
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  relatedDocumentId: text('related_document_id').references(() => document.id),
  relatedCommentId: text('related_comment_id').references(() => comment.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Phase 4 relations
export const commentRelations = relations(comment, ({ one, many }) => ({
  document: one(document, { fields: [comment.documentId], references: [document.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
  parent: one(comment, { fields: [comment.parentId], references: [comment.id] }),
  replies: many(comment),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
  relatedDocument: one(document, { fields: [notification.relatedDocumentId], references: [document.id] }),
  relatedComment: one(comment, { fields: [notification.relatedCommentId], references: [comment.id] }),
}));

// Phase 5: AI Integration
export const aiConversation = sqliteTable('ai_conversation', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => document.id),
  userId: text('user_id').notNull().references(() => user.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const aiMessage = sqliteTable('ai_message', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => aiConversation.id),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const aiConversationRelations = relations(aiConversation, ({ one, many }) => ({
  document: one(document, { fields: [aiConversation.documentId], references: [document.id] }),
  user: one(user, { fields: [aiConversation.userId], references: [user.id] }),
  messages: many(aiMessage),
}));

export const aiMessageRelations = relations(aiMessage, ({ one }) => ({
  conversation: one(aiConversation, { fields: [aiMessage.conversationId], references: [aiConversation.id] }),
}));
