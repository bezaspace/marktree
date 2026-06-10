import { type Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { db } from './db/index.js';
import { yjsUpdate, document, treeNode, workspaceMember } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auth } from './lib/auth.js';
import { URL } from 'url';
import { randomUUID } from 'crypto';

interface DocumentRoom {
  ydoc: Y.Doc;
  clients: Set<WebSocket>;
  cleanup: () => void;
}

const rooms = new Map<string, DocumentRoom>();

function getRoom(docId: string): DocumentRoom {
  let room = rooms.get(docId);
  if (!room) {
    const ydoc = new Y.Doc();
    const persistUpdate = (update: Uint8Array) => {
      db.insert(yjsUpdate).values({
        id: randomUUID(),
        documentId: docId,
        updateBlob: Buffer.from(update),
        createdAt: new Date(),
      }).run();
    };
    ydoc.on('update', persistUpdate);

    room = {
      ydoc,
      clients: new Set(),
      cleanup: () => {
        ydoc.off('update', persistUpdate);
        ydoc.destroy();
      },
    };
    rooms.set(docId, room);

    // Load persisted updates from SQLite
    const updates = db
      .select()
      .from(yjsUpdate)
      .where(eq(yjsUpdate.documentId, docId))
      .all();

    for (const row of updates) {
      try {
        Y.applyUpdate(ydoc, new Uint8Array(row.updateBlob as ArrayBuffer));
      } catch {
        // skip corrupted update
      }
    }
  }
  return room;
}

function broadcast(room: DocumentRoom, sender: WebSocket, update: Uint8Array) {
  for (const client of room.clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(update);
    }
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const documentId = url.searchParams.get('documentId');
      if (!documentId) {
        ws.close(1008, 'documentId required');
        return;
      }

      // Auth: extract session token from cookie header
      const cookieHeader = req.headers.cookie || '';
      const sessionToken = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('better-auth.session-token='))
        ?.split('=')[1];

      if (!sessionToken) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      // Validate session with Better Auth
      const headers = new Headers();
      headers.set('cookie', `better-auth.session-token=${sessionToken}`);
      const session = await auth.api.getSession({ headers });
      if (!session?.user) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      // Check document access
      const doc = await db
        .select()
        .from(document)
        .where(eq(document.id, documentId))
        .get();
      if (!doc) {
        ws.close(1008, 'Document not found');
        return;
      }

      const node = await db
        .select()
        .from(treeNode)
        .where(eq(treeNode.id, doc.treeNodeId))
        .get();
      if (!node) {
        ws.close(1008, 'Tree node not found');
        return;
      }

      const member = await db
        .select()
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.workspaceId, node.workspaceId),
            eq(workspaceMember.userId, session.user.id)
          )
        )
        .get();

      if (!member) {
        ws.close(1008, 'Forbidden');
        return;
      }

      const room = getRoom(documentId);
      room.clients.add(ws);

      // Send full document state to new client
      const state = Y.encodeStateAsUpdate(room.ydoc);
      ws.send(state);

      ws.on('message', (data) => {
        try {
          const update = new Uint8Array(data as ArrayBuffer);
          Y.applyUpdate(room.ydoc, update);
          broadcast(room, ws, update);
        } catch {
          // ignore invalid update
        }
      });

      ws.on('close', () => {
        room.clients.delete(ws);
        if (room.clients.size === 0) {
          setTimeout(() => {
            if (room.clients.size === 0) {
              rooms.get(documentId)?.cleanup();
              rooms.delete(documentId);
            }
          }, 300_000); // 5 min TTL
        }
      });
    } catch {
      ws.close(1011, 'Internal error');
    }
  });

  return wss;
}
