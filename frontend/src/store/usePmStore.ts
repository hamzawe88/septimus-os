import { create } from 'zustand';

interface PmState {
  activeTab: 'dashboard' | 'kanban' | 'backlog' | 'table' | 'planning' | 'analytics' | 'reports';
  setActiveTab: (tab: 'dashboard' | 'kanban' | 'backlog' | 'table' | 'planning' | 'analytics' | 'reports') => void;
}

export const usePmStore = create<PmState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
