import { create } from 'zustand';

interface FinanceState {
  activeTab: 'dashboard' | 'invoices' | 'expenses' | 'vat';
  setActiveTab: (tab: 'dashboard' | 'invoices' | 'expenses' | 'vat') => void;
}

export const useFinanceStore = create<FinanceState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
