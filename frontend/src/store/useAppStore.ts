import { create } from 'zustand';

import { AuthSlice, createAuthSlice } from './slices/authSlice';
import { UiSlice, createUiSlice } from './slices/uiSlice';
import { ChatSlice, createChatSlice } from './slices/chatSlice';
import { PmSlice, createPmSlice } from './slices/pmSlice';
import { NotificationsSlice, createNotificationsSlice } from './slices/notificationsSlice';

// The global app store is composed from focused slices (auth / UI / chat /
// PM / notifications). Each slice lives in ./slices and receives a `set`
// typed to the full AppState, so cross-slice actions (e.g. opening the
// threads list also clears the active thread) stay type-safe.
export type AppState = AuthSlice & UiSlice & ChatSlice & PmSlice & NotificationsSlice;

export const useAppStore = create<AppState>()((...args) => ({
  ...createAuthSlice(...args),
  ...createUiSlice(...args),
  ...createChatSlice(...args),
  ...createPmSlice(...args),
  ...createNotificationsSlice(...args),
}));
