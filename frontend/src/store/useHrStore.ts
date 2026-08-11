import { create } from 'zustand';

type HrTab = 'dashboard' | 'directory' | 'attendance' | 'leave' | 'performance' | 'recruitment' | 'analytics' | 'settings';

interface HrState {
  activeTab: HrTab;
  setActiveTab: (tab: HrTab) => void;
}

export const useHrStore = create<HrState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
