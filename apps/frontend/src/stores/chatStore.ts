import { create } from 'zustand';
import type { AgentAnswer } from '@/api/types';

export type AgentId = 'reasoning' | 'tva' | 'classifier';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  agent?: AgentId;
  content: string;
  answer?: AgentAnswer;
  createdAt: number;
}

interface ChatState {
  agent: AgentId;
  messages: ChatMessage[];
  loading: boolean;
  setAgent: (a: AgentId) => void;
  addMessage: (m: ChatMessage) => void;
  /** Met à jour un message existant par son id (ex: accumulation streaming) */
  updateLastMessage: (id: string, patch: Partial<ChatMessage>) => void;
  setLoading: (l: boolean) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  agent: 'reasoning',
  messages: [],
  loading: false,
  setAgent: (agent) => set({ agent }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ messages: [] }),
}));
