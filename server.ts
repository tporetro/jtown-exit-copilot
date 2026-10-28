import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { runCoach, type CoachEvent } from './server/coach';
import { extractDocument, UnsupportedFileError } from './server/extract';
import type { AppState } from './src/lib/types';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const PASSCODE = process.env.APP_PASSCODE;

// Uploaded PDFs arrive base64-encoded in JSON; the API accepts up to 32 MB per request.
app.use(express.json({ limit: '32mb' }));

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}
const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: aiConfigured(), passcodeRequired: Boolean(PASSCODE) });
});

// Optional shared passcode so a deployed copy isn't an open AI proxy.
app.use('/api', (req, res, next) => {
  if (PASSCODE && req.header('x-app-passcode') !== PASSCODE) {
    res.status(401).json({ error: 'Passcode required' });
    return;
  }
  next();
});

const ChatBody = z.object({
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(20_000) })).min(1).max(200),
  // The browser owns the state; the shape is validated by the engine's defensive reads.
  state: z.custom<AppState>((v) => typeof v === 'object' && v !== null && 'profile' in v && 'tasks' in v),
});

app.post('/api/chat', async (req, res) => {
  const body = ChatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const emit = (e: CoachEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    await runCoach(getClient(), body.data.history, structuredClone(body.data.state), emit, abort.signal);
    emit({ type: 'done' });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('chat error', err);
      const message =
        err instanceof Anthropic.RateLimitError
          ? 'The AI service is busy — please try again in a moment.'
          : err instanceof Anthropic.AuthenticationError
            ? 'The server API key is invalid.'
            : err instanceof Anthropic.APIError
              ? `AI service error (${err.status}).`
              : err instanceof Error
                ? err.message
                : 'Something went wrong.';
      emit({ type: 'error', message });
    }
  } finally {
    res.end();
  }
});

const ExtractBody = z.object({
  fileName: z.string().max(300),
  mediaType: z.string().max(100),
  dataBase64: z.string().min(1),
  locations: z.array(z.string()).max(20),
});

app.post('/api/extract', async (req, res) => {
  const body = ExtractBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
    return;
  }
  try {
    const result = await extractDocument(getClient(), body.data, body.data.locations);
    res.json(result);
  } catch (err) {
    console.error('extract error', err);
    if (err instanceof UnsupportedFileError) res.status(415).json({ error: err.message });
    else if (err instanceof Anthropic.BadRequestError) res.status(400).json({ error: 'The AI could not read this file (too large or unsupported). Try a smaller PDF.' });
    else if (err instanceof Anthropic.APIError) res.status(502).json({ error: `AI service error (${err.status}).` });
    else res.status(500).json({ error: err instanceof Error ? err.message : 'Extraction failed' });
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JTown Exit Copilot running at http://localhost:${PORT}`);
    if (!aiConfigured()) console.warn('ANTHROPIC_API_KEY is not set — the coach and document reader are disabled.');
  });
}

start();
