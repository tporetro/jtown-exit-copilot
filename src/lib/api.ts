import type { AppState } from './types';

export type View = 'overview' | 'locations' | 'roadmap' | 'documents' | 'learn';

export type CoachEvent =
  | { type: 'text'; text: string }
  | { type: 'state'; state: AppState }
  | { type: 'view'; view: View }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface Health {
  ok: boolean;
  aiConfigured: boolean;
  passcodeRequired: boolean;
}

const PASS_KEY = 'jtown-exit:passcode';

export function getPasscode(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setPasscode(code: string) {
  try {
    localStorage.setItem(PASS_KEY, code);
  } catch {
    /* session-only */
  }
}

export class PasscodeError extends Error {}

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-app-passcode': getPasscode() };
}

export async function fetchHealth(): Promise<Health> {
  const r = await fetch('/api/health');
  return r.json();
}

export async function checkPasscode(code: string): Promise<boolean> {
  const r = await fetch('/api/auth-check', { headers: { 'x-app-passcode': code } });
  return r.ok;
}

async function errorFrom(r: Response): Promise<Error> {
  if (r.status === 401) return new PasscodeError('Passcode required');
  try {
    const body = await r.json();
    return new Error(body.error || `Request failed (${r.status})`);
  } catch {
    return new Error(`Request failed (${r.status})`);
  }
}

// Streams the coach's reply. Server-sent events arrive as `data: {...}` lines.
export async function streamChat(
  history: { role: 'user' | 'assistant'; text: string }[],
  state: AppState,
  onEvent: (e: CoachEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const r = await fetch('/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ history, state }), signal });
  if (!r.ok || !r.body) throw await errorFrom(r);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)) as CoachEvent);
    }
  }
}

export interface Extraction {
  kind: 'tax_return' | 'profit_and_loss' | 'bank_statement' | 'lease' | 'membership_report' | 'payroll_report' | 'balance_sheet' | 'other';
  period: string;
  location_name: string | null;
  summary: string;
  proposed_updates: { field: string; location: string | null; value: string; evidence: string }[];
  add_back_candidates: { description: string; amount: number }[];
  red_flags: string[];
}

export async function extractDocument(file: File, locations: string[]): Promise<Extraction> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const mediaType = file.type || (file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/octet-stream');
  const r = await fetch('/api/extract', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fileName: file.name, mediaType, dataBase64, locations }),
  });
  if (!r.ok) throw await errorFrom(r);
  return r.json();
}
