export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  gitRepoPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  createdAt: Date;
}

export interface TreeNode {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  type: 'folder' | 'document';
  path: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  treeNodeId: string;
  title: string;
  currentContent: string | null;
  lastModifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface YjsUpdate {
  id: string;
  documentId: string;
  updateBlob: Buffer;
  createdAt: Date;
}
