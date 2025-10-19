/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SceneGraphData, SceneId } from './sceneGraph';
import { log } from './logger';
import { Video } from '@google/genai';

/**
 * Stored graph with metadata
 */
export interface StoredGraph {
  id: string;
  name: string;
  created: string;
  updated: string;
  graph: SceneGraphData;
  videoObjects: Record<SceneId, Video>; // Serialized Video objects
  videoFiles: Record<SceneId, string>; // Paths to generated video files
  choiceVideos: Record<SceneId, Array<{ videoPath: string; targetNodeId: string; videoObject: Video }>>; // Multiple videos per choice node
  generationComplete: boolean;
}

const STORAGE_KEY = 'veoquest_graphs';

/**
 * Get all stored graphs
 */
export function getAllGraphs(): StoredGraph[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const graphs = JSON.parse(data) as StoredGraph[];
    log.debug('GraphStorage', 'Loaded graphs', { count: graphs.length });
    return graphs;
  } catch (error) {
    log.error('GraphStorage', 'Failed to load graphs', error as Error);
    return [];
  }
}

/**
 * Get a specific graph by ID
 */
export function getGraph(graphId: string): StoredGraph | null {
  const graphs = getAllGraphs();
  const graph = graphs.find(g => g.id === graphId);
  
  if (graph) {
    log.info('GraphStorage', 'Loaded graph', { graphId, name: graph.name });
  } else {
    log.warn('GraphStorage', 'Graph not found', { graphId });
  }
  
  return graph || null;
}

/**
 * Save or update a graph
 */
export function saveGraph(graph: StoredGraph): void {
  if (typeof window === 'undefined') return;
  
  try {
    const graphs = getAllGraphs();
    const existingIndex = graphs.findIndex(g => g.id === graph.id);
    
    graph.updated = new Date().toISOString();
    
    if (existingIndex >= 0) {
      graphs[existingIndex] = graph;
      log.info('GraphStorage', 'Updated graph', {
        graphId: graph.id,
        name: graph.name,
        nodeCount: Object.keys(graph.graph.nodes).length
      });
    } else {
      graphs.push(graph);
      log.info('GraphStorage', 'Created new graph', {
        graphId: graph.id,
        name: graph.name,
        nodeCount: Object.keys(graph.graph.nodes).length
      });
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs));
  } catch (error) {
    log.error('GraphStorage', 'Failed to save graph', error as Error, { graphId: graph.id });
    throw error;
  }
}

/**
 * Delete a graph
 */
export function deleteGraph(graphId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const graphs = getAllGraphs();
    const filtered = graphs.filter(g => g.id !== graphId);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    log.info('GraphStorage', 'Deleted graph', { graphId });
  } catch (error) {
    log.error('GraphStorage', 'Failed to delete graph', error as Error, { graphId });
    throw error;
  }
}

/**
 * Store a Video object for a node
 */
export function storeVideoObject(
  graphId: string,
  nodeId: SceneId,
  videoObject: Video
): void {
  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph ${graphId} not found`);
  }
  
  graph.videoObjects[nodeId] = videoObject;
  saveGraph(graph);
  
  log.debug('GraphStorage', 'Video object stored', {
    graphId,
    nodeId,
    uri: videoObject.uri
  });
}

/**
 * Get a stored Video object for a node
 */
export function getStoredVideoObject(
  graphId: string,
  nodeId: SceneId
): Video | null {
  const graph = getGraph(graphId);
  if (!graph) {
    log.warn('GraphStorage', 'Graph not found for video object', { graphId, nodeId });
    return null;
  }
  
  const videoObject = graph.videoObjects[nodeId];
  if (!videoObject) {
    log.warn('GraphStorage', 'Video object not found', { graphId, nodeId });
    return null;
  }
  
  return videoObject as Video;
}

/**
 * Store a video file path for a node
 */
export function storeVideoFile(
  graphId: string,
  nodeId: SceneId,
  filePath: string
): void {
  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph ${graphId} not found`);
  }
  
  graph.videoFiles[nodeId] = filePath;
  saveGraph(graph);
  
  log.debug('GraphStorage', 'Video file path stored', { graphId, nodeId, filePath });
}

/**
 * Get a video file path for a node
 */
export function getVideoFile(graphId: string, nodeId: SceneId): string | null {
  const graph = getGraph(graphId);
  if (!graph) return null;
  
  return graph.videoFiles[nodeId] || null;
}

/**
 * Create a new empty graph
 */
export function createNewGraph(name: string): StoredGraph {
  const graphId = `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const graph: StoredGraph = {
    id: graphId,
    name,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    graph: { nodes: {} },
    videoObjects: {},
    videoFiles: {},
    choiceVideos: {},
    generationComplete: false,
  };
  
  saveGraph(graph);
  log.info('GraphStorage', 'Created new graph', { graphId, name });
  
  return graph;
}

/**
 * Mark a graph as having complete video generation
 */
export function markGenerationComplete(graphId: string, complete: boolean): void {
  const graph = getGraph(graphId);
  if (!graph) return;
  
  graph.generationComplete = complete;
  saveGraph(graph);
  
  log.info('GraphStorage', 'Generation status updated', { graphId, complete });
}

/**
 * Store a choice video for a specific choice option
 */
export function storeChoiceVideo(
  graphId: string,
  nodeId: SceneId,
  choiceIndex: number,
  videoPath: string,
  targetNodeId: string,
  videoObject: Video
): void {
  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph ${graphId} not found`);
  }
  
  if (!graph.choiceVideos[nodeId]) {
    graph.choiceVideos[nodeId] = [];
  }
  
  graph.choiceVideos[nodeId][choiceIndex] = {
    videoPath,
    targetNodeId,
    videoObject,
  };
  
  saveGraph(graph);
  
  log.debug('GraphStorage', 'Choice video stored', {
    graphId,
    nodeId,
    choiceIndex,
    videoPath,
    targetNodeId,
  });
}

/**
 * Get choice videos for a node
 */
export function getChoiceVideos(
  graphId: string,
  nodeId: SceneId
): Array<{ videoPath: string; targetNodeId: string; videoObject: Video }> | null {
  const graph = getGraph(graphId);
  if (!graph) return null;
  
  return graph.choiceVideos[nodeId] || null;
}

