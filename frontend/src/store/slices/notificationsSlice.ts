import { StateCreator } from 'zustand';
import { Notification } from '@/types';
import type { AppState } from '../useAppStore';

export interface NotificationsSlice {
  // Notifications
  notifications: Notification[];
  setNotifications: (notifications: Notification[] | ((prev: Notification[]) => Notification[])) => void;

  // Floating Chat System
  floatingChats: { id: string, name: string }[];
  setFloatingChats: (chats: { id: string, name: string }[] | ((prev: { id: string, name: string }[]) => { id: string, name: string }[])) => void;
  addFloatingChat: (chat: { id: string, name: string }) => void;
  removeFloatingChat: (id: string) => void;
  unreadDMs: Record<string, { count: number, name: string }>;
  setUnreadDMs: (dms: Record<string, { count: number, name: string }> | ((prev: Record<string, { count: number, name: string }>) => Record<string, { count: number, name: string }>)) => void;
}

export const createNotificationsSlice: StateCreator<AppState, [], [], NotificationsSlice> = (set) => ({
  // Notifications
  notifications: [
    {
      id: "notif_1",
      message: "Welcome to Septimus OS. Notification server activated successfully.",
      messageKey: "notifications.welcome",
      createdAt: new Date().toISOString(),
      isRead: false
    },
    {
      id: "notif_2",
      message: "SSL Certificate (HTTPS) issued and running successfully.",
      messageKey: "notifications.ssl_success",
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      isRead: false
    }
  ],
  setNotifications: (notifications) => set((state) => ({
    notifications: typeof notifications === 'function' ? notifications(state.notifications) : notifications
  })),

  // Floating Chat System
  floatingChats: [],
  setFloatingChats: (chats) => set((state) => ({
    floatingChats: typeof chats === 'function' ? chats(state.floatingChats) : chats
  })),
  addFloatingChat: (chat) => set((state) => {
    if (state.floatingChats.find(c => c.id === chat.id)) return state;
    return { floatingChats: [...state.floatingChats, chat].slice(-3) }; // Max 3 floating chats
  }),
  removeFloatingChat: (id) => set((state) => ({
    floatingChats: state.floatingChats.filter(c => c.id !== id)
  })),
  unreadDMs: {
    "mock-id-1": { count: 3, name: "Design Lead" }
  },
  setUnreadDMs: (dms) => set((state) => ({
    unreadDMs: typeof dms === 'function' ? dms(state.unreadDMs) : dms
  })),
});
