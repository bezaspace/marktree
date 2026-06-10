import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { initDatabase } from './db/init.js';
import { sqlite } from './db/index.js';
import workspaceRoutes from './routes/workspaces.js';
import treeNodeRoutes from './routes/treeNodes.js';
import documentRoutes from './routes/documents.js';
import commentRoutes from './routes/comments.js';
import notificationRoutes from './routes/notifications.js';
import { setupWebSocket } from './websocket.js';

initDatabase(sqlite);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Better Auth handler - must come before express.json() for its routes
app.all('/api/auth/*', toNodeHandler(auth));

// Parse JSON for our own routes
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/tree-nodes', treeNodeRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);

const server = app.listen(PORT, () => {
  console.log(`Marktree server running on http://localhost:${PORT}`);
});

setupWebSocket(server);
