/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SceneId } from './sceneGraph';
import { log } from './logger';

/**
 * Saved game state for a playthrough
 */
export interface SaveGame {
  id: string;
  graphId: string;
  slotName: string;
  currentNodeId: SceneId;
  currentSceneName: string;
  choiceHistory: Array<{ nodeId: SceneId; choice: string }>;
  created: string;
  updated: string;
  playTimeSec: number;
}

const STORAGE_KEY = 'veoquest_saves';

/**
 * Get all save games
 */
export function getAllSaveGames(): SaveGame[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const saves = JSON.parse(data) as SaveGame[];
    log.debug('SaveGameStorage', 'Loaded save games', { count: saves.length });
    return saves;
  } catch (error) {
    log.error('SaveGameStorage', 'Failed to load save games', error as Error);
    return [];
  }
}

/**
 * Get save games for a specific graph
 */
export function getSaveGamesForGraph(graphId: string): SaveGame[] {
  const saves = getAllSaveGames();
  return saves.filter(s => s.graphId === graphId);
}

/**
 * Get a specific save game by ID
 */
export function getSaveGame(saveId: string): SaveGame | null {
  const saves = getAllSaveGames();
  const save = saves.find(s => s.id === saveId);
  
  if (save) {
    log.info('SaveGameStorage', 'Loaded save game', {
      saveId,
      graphId: save.graphId,
      currentNode: save.currentNodeId
    });
  }
  
  return save || null;
}

/**
 * Create a new save game
 */
export function createSaveGame(
  graphId: string,
  slotName: string,
  currentNodeId: SceneId,
  currentSceneName: string
): SaveGame {
  const saveId = `save_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const saveGame: SaveGame = {
    id: saveId,
    graphId,
    slotName,
    currentNodeId,
    currentSceneName,
    choiceHistory: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    playTimeSec: 0,
  };
  
  const saves = getAllSaveGames();
  saves.push(saveGame);
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  }
  
  log.info('SaveGameStorage', 'Created save game', {
    saveId,
    graphId,
    slotName,
    currentNode: currentNodeId
  });
  
  return saveGame;
}

/**
 * Update an existing save game
 */
export function updateSaveGame(save: SaveGame): void {
  if (typeof window === 'undefined') return;
  
  try {
    const saves = getAllSaveGames();
    const index = saves.findIndex(s => s.id === save.id);
    
    save.updated = new Date().toISOString();
    
    if (index >= 0) {
      saves[index] = save;
    } else {
      saves.push(save);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    
    log.debug('SaveGameStorage', 'Updated save game', {
      saveId: save.id,
      currentNode: save.currentNodeId,
      playTime: save.playTimeSec
    });
  } catch (error) {
    log.error('SaveGameStorage', 'Failed to update save game', error as Error, {
      saveId: save.id
    });
    throw error;
  }
}

/**
 * Delete a save game
 */
export function deleteSaveGame(saveId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const saves = getAllSaveGames();
    const filtered = saves.filter(s => s.id !== saveId);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    log.info('SaveGameStorage', 'Deleted save game', { saveId });
  } catch (error) {
    log.error('SaveGameStorage', 'Failed to delete save game', error as Error, { saveId });
    throw error;
  }
}

/**
 * Get the most recent save game
 */
export function getMostRecentSaveGame(): SaveGame | null {
  const saves = getAllSaveGames();
  if (saves.length === 0) return null;
  
  saves.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  return saves[0];
}

/**
 * Add a choice to the history
 */
export function recordChoice(
  saveId: string,
  nodeId: SceneId,
  choice: string
): void {
  const save = getSaveGame(saveId);
  if (!save) return;
  
  save.choiceHistory.push({ nodeId, choice });
  updateSaveGame(save);
  
  log.info('SaveGameStorage', 'Recorded choice', {
    saveId,
    nodeId,
    choice,
    historyLength: save.choiceHistory.length
  });
}

