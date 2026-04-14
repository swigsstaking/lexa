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
  open: boolean;
  agent: AgentId;
  messages: ChatMessage[];
  loading: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setAgent: (a: AgentId) => void;
  addMessage: (m: ChatMessage) => void;
  setLoading: (l: boolean) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  open: false,
  agent: 'reasoning',
  messages: [],
  loading: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setAgent: (agent) => set({ agent }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ messages: [] }),
}));
