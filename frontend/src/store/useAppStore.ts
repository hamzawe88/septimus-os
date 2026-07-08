import { create } from 'zustand';

import { Centrifuge } from 'centrifuge';
import { User, Channel, Message, Thread, Task, Workflow, Notification } from '@/types';

interface AppState {
  // Auth
  isLoggedIn: boolean;
  setIsLoggedIn: (status: boolean) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  userStatus: "online" | "away" | "busy" | "offline";
  setUserStatus: (status: "online" | "away" | "busy" | "offline") => void;
  customStatusText: string;
  setCustomStatusText: (text: string) => void;

  // View state
  currentView: string; // 'chat' | 'kanban' | 'reports'
  setCurrentView: (view: string) => void;

  // Global UI State
  isEntityModalOpen: boolean;
  setIsEntityModalOpen: (open: boolean) => void;
  isNewChannelModalOpen: boolean;
  setIsNewChannelModalOpen: (open: boolean) => void;
  isNewDmModalOpen: boolean;
  setIsNewDmModalOpen: (open: boolean) => void;
  isDocumentModalOpen: boolean;
  setIsDocumentModalOpen: (open: boolean) => void;
  isRagSidebarOpen: boolean;
  setIsRagSidebarOpen: (open: boolean) => void;
  isGlobalSearchOpen: boolean;
  setIsGlobalSearchOpen: (open: boolean) => void;
  isThreadsListOpen: boolean;
  setIsThreadsListOpen: (open: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isCatchUpModalOpen: boolean;
  setIsCatchUpModalOpen: (open: boolean) => void;

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

  // Kanban PM Data
  projectId: string;
  setProjectId: (id: string) => void;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  // Task Pagination
  taskPage: number;
  setTaskPage: (page: number) => void;
  taskTotal: number;
  setTaskTotal: (total: number) => void;
  taskLimit: number;

  // Workflows
  workflows: Workflow[];
  setWorkflows: (workflows: Workflow[] | ((prev: Workflow[]) => Workflow[])) => void;

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

export const useAppStore = create<AppState>((set) => ({
  // Auth
  isLoggedIn: false,
  setIsLoggedIn: (status) => set({ isLoggedIn: status }),
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  userStatus: "online",
  setUserStatus: (status) => set({ userStatus: status }),
  customStatusText: "",
  setCustomStatusText: (text) => set({ customStatusText: text }),

  // View state
  currentView: 'chat',
  setCurrentView: (view) => set({ currentView: view }),

  // Global UI State
  isEntityModalOpen: false,
  setIsEntityModalOpen: (open) => set({ isEntityModalOpen: open }),
  isNewChannelModalOpen: false,
  setIsNewChannelModalOpen: (open) => set({ isNewChannelModalOpen: open }),
  isNewDmModalOpen: false,
  setIsNewDmModalOpen: (open) => set({ isNewDmModalOpen: open }),
  isDocumentModalOpen: false,
  setIsDocumentModalOpen: (open) => set({ isDocumentModalOpen: open }),
  isRagSidebarOpen: false,
  setIsRagSidebarOpen: (open) => set({ isRagSidebarOpen: open }),
  isGlobalSearchOpen: false,
  setIsGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
  isThreadsListOpen: false,
  setIsThreadsListOpen: (open) => set(() => {
    if (open) {
      return { isThreadsListOpen: true, isRagSidebarOpen: false, activeThread: null };
    }
    return { isThreadsListOpen: false };
  }),
  isSidebarOpen: true,
  setIsSidebarOpen: (open) => set({ isSidebarOpen: open }),
  isCatchUpModalOpen: false,
  setIsCatchUpModalOpen: (open) => set({ isCatchUpModalOpen: open }),

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

  // Kanban PM Data
  projectId: "",
  setProjectId: (id) => set({ projectId: id }),
  tasks: [],
  setTasks: (tasks) => set((state) => ({
    tasks: typeof tasks === 'function' ? tasks(state.tasks) : tasks
  })),
  // Task Pagination
  taskPage: 1,
  setTaskPage: (page) => set({ taskPage: page }),
  taskTotal: 0,
  setTaskTotal: (total) => set({ taskTotal: total }),
  taskLimit: 50,

  // Workflows
  workflows: [],
  setWorkflows: (workflows) => set((state) => ({
    workflows: typeof workflows === 'function' ? workflows(state.workflows) : workflows
  })),

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
}));
