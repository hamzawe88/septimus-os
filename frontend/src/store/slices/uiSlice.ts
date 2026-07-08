import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';

export interface UiSlice {
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
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
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
  // Opening the threads list also closes the RAG sidebar and clears any active thread
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
});
