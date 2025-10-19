/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { SceneGraph, Scene, SceneId } from '../lib/sceneGraph';
import { GenerationProgress } from '../lib/videoGeneration';

export enum AppMode {
  LANDING = 'landing',
  DESIGNER = 'designer',
  PLAY = 'play',
}

interface GraphState {
  // Current mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  
  // Current graph
  currentGraphId: string | null;
  currentGraph: SceneGraph | null;
  setCurrentGraph: (graphId: string, graph: SceneGraph) => void;
  clearCurrentGraph: () => void;
  
  // Designer state
  selectedNodeId: SceneId | null;
  setSelectedNode: (nodeId: SceneId | null) => void;
  
  // Generation progress
  generationInProgress: boolean;
  generationProgress: Map<SceneId, GenerationProgress>;
  setGenerationInProgress: (inProgress: boolean) => void;
  updateGenerationProgress: (progress: GenerationProgress) => void;
  clearGenerationProgress: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  // Mode
  mode: AppMode.LANDING,
  setMode: (mode) => set({ mode }),
  
  // Graph
  currentGraphId: null,
  currentGraph: null,
  setCurrentGraph: (graphId, graph) =>
    set({ currentGraphId: graphId, currentGraph: graph }),
  clearCurrentGraph: () =>
    set({ currentGraphId: null, currentGraph: null, selectedNodeId: null }),
  
  // Designer
  selectedNodeId: null,
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  
  // Generation
  generationInProgress: false,
  generationProgress: new Map(),
  setGenerationInProgress: (inProgress) =>
    set({ generationInProgress: inProgress }),
  updateGenerationProgress: (progress) =>
    set((state) => {
      const newProgress = new Map(state.generationProgress);
      newProgress.set(progress.nodeId, progress);
      return { generationProgress: newProgress };
    }),
  clearGenerationProgress: () =>
    set({ generationProgress: new Map() }),
}));

