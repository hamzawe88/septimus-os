import { StateCreator } from 'zustand';
import { User } from '@/types';
import type { AppState } from '../useAppStore';

export interface AuthSlice {
  isLoggedIn: boolean;
  setIsLoggedIn: (status: boolean) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  userStatus: "online" | "away" | "busy" | "offline";
  setUserStatus: (status: "online" | "away" | "busy" | "offline") => void;
  customStatusText: string;
  setCustomStatusText: (text: string) => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
  isLoggedIn: false,
  setIsLoggedIn: (status) => set({ isLoggedIn: status }),
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  userStatus: "online",
  setUserStatus: (status) => set({ userStatus: status }),
  customStatusText: "",
  setCustomStatusText: (text) => set({ customStatusText: text }),
});
