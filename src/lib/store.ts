// Browser-side persistence. Stephanie's data lives in her own browser
// (localStorage); the server is stateless. Export/import gives her a backup and
// a way to move to another device.

import { useCallback, useEffect, useState } from 'react';
import type { AppState } from './types';
import { initialState } from '../data/roadmap';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  hidden?: boolean; // kickoff prompts the app sends on her behalf
  error?: boolean;
}

const STATE_KEY = 'jtown-exit:state';
const CHAT_KEY = 'jtown-exit:chat';

function load<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback();
  } catch {
    return fallback();
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the app keeps working for this session.
  }
}

export function usePersistentState() {
  const [state, setState] = useState<AppState>(() => load(STATE_KEY, initialState));
  const [chat, setChat] = useState<ChatMessage[]>(() => load(CHAT_KEY, () => []));

  useEffect(() => save(STATE_KEY, state), [state]);
  useEffect(() => save(CHAT_KEY, chat), [chat]);

  const reset = useCallback((next: AppState, nextChat: ChatMessage[] = []) => {
    setState(next);
    setChat(nextChat);
  }, []);

  return { state, setState, chat, setChat, reset };
}

export function exportBackup(state: AppState, chat: ChatMessage[]) {
  const blob = new Blob([JSON.stringify({ state, chat, exportedAt: new Date().toISOString() }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jtown-exit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readBackup(file: File): Promise<{ state: AppState; chat: ChatMessage[] }> {
  const data = JSON.parse(await file.text());
  if (!data?.state?.profile || !Array.isArray(data?.state?.tasks)) throw new Error('This is not a JTown Exit Copilot backup file.');
  return { state: data.state, chat: Array.isArray(data.chat) ? data.chat : [] };
}

export const newId = () => Math.random().toString(36).slice(2, 10);
