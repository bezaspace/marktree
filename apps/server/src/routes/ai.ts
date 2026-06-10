import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { document, treeNode, workspaceMember, aiConversation, aiMessage } from '../db/schema.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const router = Router();

const KILO_BASE_URL = process.env.KILO_BASE_URL || 'https://api.kilo.ai/api/gateway';
const KILO_API_KEY = process.env.KILO_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'stepfun/step-3.7-flash';

const kilo = createOpenAI({
  baseURL: KILO_BASE_URL,
  apiKey: KILO_API_KEY,
});

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

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function getOrCreateConversation(documentId: string, userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(aiConversation)
    .where(and(eq(aiConversation.documentId, documentId), eq(aiConversation.userId, userId)))
    .get();
  if (existing) return existing.id;

  const id = randomUUID();
  await db.insert(aiConversation).values({ id, documentId, userId });
  return id;
}

async function persistMessage(conversationId: string, role: string, content: string) {
  await db.insert(aiMessage).values({
    id: randomUUID(),
    conversationId,
    role: role as 'user' | 'assistant' | 'system',
    content,
  });
}

async function getPersistedMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(aiMessage)
    .where(eq(aiMessage.conversationId, conversationId))
    .orderBy(aiMessage.createdAt)
    .all();
  return rows.map((r) => ({ role: r.role as 'user' | 'assistant' | 'system', content: r.content }));
}

// Helper to build system prompt with document context
function buildSystemPrompt(context: {
  documentTitle: string;
  documentContent?: string;
  treeStructure?: string;
  selectedText?: string;
}): string {
  let prompt = `You are an AI writing assistant integrated into Marktree, a collaborative Markdown workspace. You help users write, edit, and improve Markdown documents. Respond in Markdown format when appropriate.\n\nCurrent document: "${context.documentTitle}"`;

  if (context.treeStructure) {
    prompt += `\n\nWorkspace folder structure:\n${context.treeStructure}`;
  }

  if (context.documentContent) {
    const truncated = context.documentContent.length > 12000
      ? context.documentContent.slice(0, 12000) + '\n\n[Document truncated for context]'
      : context.documentContent;
    prompt += `\n\nDocument content:\n${truncated}`;
  }

  if (context.selectedText) {
    prompt += `\n\nSelected text:\n${context.selectedText}`;
  }

  return prompt;
}

// Shared streaming handler for all AI endpoints
async function handleStream(
  res: any,
  messages: ChatMessage[],
  systemPrompt: string,
  onStart?: () => Promise<void>,
  onFinish?: (fullText: string) => Promise<void>,
) {
  if (!KILO_API_KEY) {
    res.status(503).json({ error: 'AI service not configured. Set KILO_API_KEY in environment.' });
    return;
  }

  try {
    const model = kilo.chat(AI_MODEL);
    const result = streamText({
      model,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (onStart) await onStart();

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
      res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}

`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}

`);
    res.end();

    if (onFinish) await onFinish(fullText);
  } catch (err: any) {
    console.error('AI streaming error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI streaming failed', details: err?.message || String(err) });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || String(err) })}

`);
      res.end();
    }
  }
}

// POST /api/ai/chat - General chat with document context
router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { documentId, messages, context } = req.body as {
    documentId: string;
    messages: ChatMessage[];
    context?: {
      documentTitle?: string;
      documentContent?: string;
      treeStructure?: string;
      selectedText?: string;
    };
  };

  const doc = await db.select().from(document).where(eq(document.id, documentId)).get();
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

  const conversationId = await getOrCreateConversation(documentId, userId);
  const systemPrompt = buildSystemPrompt({
    documentTitle: context?.documentTitle || doc.title,
    documentContent: context?.documentContent || doc.currentContent || undefined,
    treeStructure: context?.treeStructure,
    selectedText: context?.selectedText,
  });

  // Persist the latest user message
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  if (lastUserMessage) {
    await persistMessage(conversationId, 'user', lastUserMessage.content);
  }

  // Merge persisted history with current messages for context
  const persisted = await getPersistedMessages(conversationId);
  const merged = [...persisted, ...messages];

  await handleStream(
    res,
    merged,
    systemPrompt,
    undefined,
    async (fullText) => {
      await persistMessage(conversationId, 'assistant', fullText);
    },
  );
});

// POST /api/ai/slash - Slash command processing
router.post('/slash', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { documentId, command, context } = req.body as {
    documentId: string;
    command: string;
    context?: {
      documentTitle?: string;
      documentContent?: string;
      treeStructure?: string;
    };
  };

  const doc = await db.select().from(document).where(eq(document.id, documentId)).get();
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

  const commandPrompts: Record<string, string> = {
    summarize: 'Summarize the following document in a concise paragraph.',
    expand: 'Expand the following text with more detail and depth.',
    simplify: 'Simplify the following text to make it easier to understand. Use plain language.',
    'fix-grammar': 'Fix grammar, spelling, and punctuation in the following text. Preserve the original meaning and tone.',
    translate: 'Translate the following text to English (if not already English) or improve its clarity.',
    'generate-toc': 'Generate a Markdown table of contents for the following document. Output only the TOC in Markdown list format.',
  };

  const instruction = commandPrompts[command] || `Process this document with the command: ${command}`;
  const content = context?.documentContent || doc.currentContent || '';

  const systemPrompt = buildSystemPrompt({
    documentTitle: context?.documentTitle || doc.title,
    documentContent: content,
    treeStructure: context?.treeStructure,
  });

  const messages: ChatMessage[] = [
    { role: 'user', content: `${instruction}\n\n${content}` },
  ];

  await handleStream(res, messages, systemPrompt);
});

// POST /api/ai/inline - Inline editing with selected text
router.post('/inline', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { documentId, selectedText, instruction, context } = req.body as {
    documentId: string;
    selectedText: string;
    instruction: string;
    context?: {
      documentTitle?: string;
      documentContent?: string;
      treeStructure?: string;
    };
  };

  const doc = await db.select().from(document).where(eq(document.id, documentId)).get();
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

  const systemPrompt = buildSystemPrompt({
    documentTitle: context?.documentTitle || doc.title,
    documentContent: context?.documentContent || doc.currentContent || undefined,
    treeStructure: context?.treeStructure,
    selectedText,
  });

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `Selected text:\n"""\n${selectedText}\n"""\n\nInstruction: ${instruction}\n\nPlease provide only the rewritten text, without explanations or markdown code fences unless the original text contains code.`,
    },
  ];

  await handleStream(res, messages, systemPrompt);
});

// GET /api/ai/messages/:documentId - Get chat history
router.get('/messages/:documentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const documentId = req.params.documentId as string;

  const doc = await db.select().from(document).where(eq(document.id, documentId)).get();
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

  const conversation = await db
    .select()
    .from(aiConversation)
    .where(and(eq(aiConversation.documentId, documentId), eq(aiConversation.userId, userId)))
    .get();

  if (!conversation) {
    res.json([]);
    return;
  }

  const messages = await db
    .select()
    .from(aiMessage)
    .where(eq(aiMessage.conversationId, conversation.id))
    .orderBy(aiMessage.createdAt)
    .all();

  res.json(messages);
});

// DELETE /api/ai/messages/:documentId - Clear chat history
router.delete('/messages/:documentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const documentId = req.params.documentId as string;

  const doc = await db.select().from(document).where(eq(document.id, documentId)).get();
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

  const conversation = await db
    .select()
    .from(aiConversation)
    .where(and(eq(aiConversation.documentId, documentId), eq(aiConversation.userId, userId)))
    .get();

  if (conversation) {
    await db.delete(aiMessage).where(eq(aiMessage.conversationId, conversation.id));
    await db.delete(aiConversation).where(eq(aiConversation.id, conversation.id));
  }

  res.json({ success: true });
});

export default router;
