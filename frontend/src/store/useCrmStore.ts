import { create } from 'zustand';

interface CrmState {
  activeTab: 'dashboard' | 'leads' | 'forecast' | 'tickets';
  setActiveTab: (tab: 'dashboard' | 'leads' | 'forecast' | 'tickets') => void;
}

export const useCrmStore = create<CrmState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
