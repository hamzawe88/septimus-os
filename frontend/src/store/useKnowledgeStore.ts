import { create } from 'zustand';

interface KnowledgeState {
  activeTab: 'workdocs' | 'knowledge_base' | 'drive';
  setActiveTab: (tab: 'workdocs' | 'knowledge_base' | 'drive') => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  activeTab: 'workdocs',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
