import { create } from 'zustand';

interface AutomationState {
  activeTab: 'workflows' | 'automations' | 'entity_creator';
  setActiveTab: (tab: 'workflows' | 'automations' | 'entity_creator') => void;
}

export const useAutomationStore = create<AutomationState>((set) => ({
  activeTab: 'workflows',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
