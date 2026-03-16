import { create } from 'zustand';
import type { Task } from '@todo-app/shared';

interface UIState {
  /** Currently selected task (J/K keyboard nav — Story 6.1) */
  selectedTaskId: string | null;
  /** Active focus mode task (Story 2.2) */
  focusModeTaskId: string | null;
  /** Command palette open state (Story 6.1) */
  commandPaletteOpen: boolean;
  /** Current authenticated user ID */
  currentUserId: string | null;
  /** Whether the device is offline */
  isOffline: boolean;
  /** Whether a background sync is running */
  isSyncing: boolean;

  // Actions
  setSelectedTask: (id: string | null) => void;
  setFocusModeTask: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setCurrentUser: (userId: string | null) => void;
  setOffline: (offline: boolean) => void;
  setSyncing: (syncing: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTaskId: null,
  focusModeTaskId: null,
  commandPaletteOpen: false,
  currentUserId: null,
  isOffline: false,
  isSyncing: false,

  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setFocusModeTask: (id) => set({ focusModeTaskId: id }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setCurrentUser: (userId) => set({ currentUserId: userId }),
  setOffline: (offline) => set({ isOffline: offline }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
}));
