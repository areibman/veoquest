/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { SceneId } from '../lib/sceneGraph';
import { SaveGame } from '../lib/saveGameStorage';

interface PlayState {
  // Current save game
  currentSaveId: string | null;
  currentSave: SaveGame | null;
  setCurrentSave: (save: SaveGame) => void;
  clearCurrentSave: () => void;
  
  // Current playback state
  currentNodeId: SceneId | null;
  setCurrentNode: (nodeId: SceneId) => void;
  
  // Video history for back navigation
  nodeHistory: SceneId[];
  pushToHistory: (nodeId: SceneId) => void;
  popFromHistory: () => SceneId | null;
  clearHistory: () => void;
  
  // Playback controls
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  
  // Play time tracking
  sessionStartTime: number | null;
  startSession: () => void;
  endSession: () => void;
}

export const usePlayStore = create<PlayState>((set, get) => ({
  // Save game
  currentSaveId: null,
  currentSave: null,
  setCurrentSave: (save) =>
    set({
      currentSaveId: save.id,
      currentSave: save,
      currentNodeId: save.currentNodeId,
    }),
  clearCurrentSave: () =>
    set({
      currentSaveId: null,
      currentSave: null,
      currentNodeId: null,
      nodeHistory: [],
    }),
  
  // Current node
  currentNodeId: null,
  setCurrentNode: (nodeId) => set({ currentNodeId: nodeId }),
  
  // History
  nodeHistory: [],
  pushToHistory: (nodeId) =>
    set((state) => ({
      nodeHistory: [...state.nodeHistory, nodeId],
    })),
  popFromHistory: () => {
    const history = get().nodeHistory;
    if (history.length === 0) return null;
    
    const lastNode = history[history.length - 1];
    set({ nodeHistory: history.slice(0, -1) });
    return lastNode;
  },
  clearHistory: () => set({ nodeHistory: [] }),
  
  // Playback
  isPaused: false,
  setPaused: (paused) => set({ isPaused: paused }),
  
  // Session time
  sessionStartTime: null,
  startSession: () => set({ sessionStartTime: Date.now() }),
  endSession: () => set({ sessionStartTime: null }),
}));

