import { StateCreator } from 'zustand';
import { Centrifuge } from 'centrifuge';
import { Channel, Message, Thread } from '@/types';
import type { AppState } from '../useAppStore';

export interface ChatSlice {
  // Chat/Channel Data
  channels: Channel[];
  setChannels: (channels: Channel[]) => void;
  activeChannelId: string;
  setActiveChannelId: (id: string) => void;
  activeDmId: string;
  setActiveDmId: (id: string) => void;
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  // Message Pagination
  hasMoreMessages: boolean;
  setHasMoreMessages: (has: boolean) => void;
  messageCursor: string | null; // 'before' cursor for loading older messages
  setMessageCursor: (cursor: string | null) => void;
  activeThread: Thread | null;
  setActiveThread: (thread: Thread | null) => void;

  // Presence
  onlineUsers: Record<string, boolean>;
  setOnlineUsers: (users: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;

  // WebSocket (Centrifuge)
  centrifuge: Centrifuge | null;
  setCentrifuge: (centrifuge: Centrifuge | null) => void;
}

export const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (set) => ({
  // Chat/Channel Data
  channels: [],
  setChannels: (channels) => set({ channels }),
  activeChannelId: "",
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  activeDmId: "",
  setActiveDmId: (id) => set({ activeDmId: id }),
  messages: [],
  setMessages: (messages) => set((state) => ({
    messages: typeof messages === 'function' ? messages(state.messages) : messages
  })),
  // Message Pagination
  hasMoreMessages: false,
  setHasMoreMessages: (has) => set({ hasMoreMessages: has }),
  messageCursor: null,
  setMessageCursor: (cursor) => set({ messageCursor: cursor }),
  activeThread: null,
  setActiveThread: (thread) => set({ activeThread: thread }),

  // Presence
  onlineUsers: {},
  setOnlineUsers: (users) => set((state) => ({
    onlineUsers: typeof users === 'function' ? users(state.onlineUsers) : users
  })),

  // WebSocket (Centrifuge)
  centrifuge: null,
  setCentrifuge: (centrifuge) => set({ centrifuge }),
});
