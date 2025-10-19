/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SceneGraph, Scene, SceneType, SceneId } from './sceneGraph';
import { log } from './logger';
import { Video } from '@google/genai';

/**
 * Video generation status for a node
 */
export enum GenerationStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  COMPLETE = 'complete',
  ERROR = 'error',
}

/**
 * Progress update for a node
 */
export interface GenerationProgress {
  nodeId: SceneId;
  status: GenerationStatus;
  progress: number; // 0-100
  error?: string;
  videoUri?: string;
}

/**
 * Callback for progress updates
 */
export type ProgressCallback = (progress: GenerationProgress) => void;

/**
 * Node generation state
 */
interface NodeState {
  nodeId: SceneId;
  status: GenerationStatus;
  videoObject?: Video;
  videoBlob?: Blob;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Video generation orchestrator with dependency management
 */
export class VideoGenerationOrchestrator {
  private graph: SceneGraph;
  private nodeStates: Map<SceneId, NodeState>;
  private onProgress: ProgressCallback;
  
  constructor(graph: SceneGraph, onProgress: ProgressCallback) {
    this.graph = graph;
    this.nodeStates = new Map();
    this.onProgress = onProgress;
    
    // Initialize all nodes as pending (video nodes: ROOT, EXTENSION, and CHOICE)
    for (const node of Object.values(graph.nodes)) {
      if (node.kind === SceneType.ROOT || node.kind === SceneType.EXTENSION || node.kind === SceneType.CHOICE) {
        this.nodeStates.set(node.id, {
          nodeId: node.id,
          status: GenerationStatus.PENDING,
        });
      }
    }
  }
  
  /**
   * Get nodes that are ready to generate (parents complete)
   */
  private getReadyNodes(): Scene[] {
    const ready: Scene[] = [];
    
    for (const [nodeId, state] of this.nodeStates.entries()) {
      if (state.status !== GenerationStatus.PENDING) continue;
      
      const node = this.graph.nodes[nodeId];
      if (!node) continue;
      
      // Check if all parents are complete
      const parents = this.graph.getParents(nodeId);
      const videoParents = parents.filter(
        p => p.kind === SceneType.ROOT || p.kind === SceneType.EXTENSION || p.kind === SceneType.CHOICE
      );
      
      const allParentsComplete = videoParents.every(parent => {
        const parentState = this.nodeStates.get(parent.id);
        return parentState?.status === GenerationStatus.COMPLETE;
      });
      
      if (videoParents.length === 0 || allParentsComplete) {
        ready.push(node);
      }
    }
    
    return ready;
  }
  
  /**
   * Get child nodes of a parent
   */
  private getChildren(parentId: SceneId): Scene[] {
    const parent = this.graph.nodes[parentId];
    if (!parent || !parent.edges) return [];
    
    return parent.edges
      .map(e => this.graph.nodes[e.target])
      .filter(node => node && (node.kind === SceneType.ROOT || node.kind === SceneType.EXTENSION || node.kind === SceneType.CHOICE));
  }
  
  /**
   * Update node state and notify progress
   */
  private updateNodeState(nodeId: SceneId, update: Partial<NodeState>): void {
    const state = this.nodeStates.get(nodeId);
    if (!state) return;
    
    Object.assign(state, update);
    this.nodeStates.set(nodeId, state);
    
    // Calculate progress percentage
    let progress = 0;
    if (state.status === GenerationStatus.PENDING) progress = 0;
    else if (state.status === GenerationStatus.GENERATING) progress = 50;
    else if (state.status === GenerationStatus.COMPLETE) progress = 100;
    else if (state.status === GenerationStatus.ERROR) progress = 0;
    
    this.onProgress({
      nodeId,
      status: state.status,
      progress,
      error: state.error,
      videoUri: state.videoObject?.uri,
    });
  }
  
  /**
   * Generate a single node (placeholder - will be called from API route)
   */
  async generateNode(
    node: Scene,
    generateVideoFn: (
      node: Scene,
      parentVideoObject?: Video,
      incomingEdgeLabel?: string
    ) => Promise<{ blob: Blob; video: Video }>
  ): Promise<void> {
    const nodeId = node.id;
    
    log.video(nodeId, 'GENERATION_START', {
      kind: node.kind,
      prompt: node.prompt,
      segments: node.segments,
    });
    
    try {
      this.updateNodeState(nodeId, {
        status: GenerationStatus.GENERATING,
        startTime: Date.now(),
      });
      
      // Get parent video object if this is an extension or choice
      let parentVideoObject: Video | undefined;
      let incomingEdgeLabel: string | undefined;
      
      if (node.kind === SceneType.EXTENSION || node.kind === SceneType.CHOICE) {
        const parents = this.graph.getParents(nodeId);
        const videoParent = parents.find(
          p => p.kind === SceneType.ROOT || p.kind === SceneType.EXTENSION || p.kind === SceneType.CHOICE
        );
        
        if (videoParent) {
          const parentState = this.nodeStates.get(videoParent.id);
          parentVideoObject = parentState?.videoObject;
          
          if (!parentVideoObject) {
            throw new Error(`Parent video object not found for ${nodeId}`);
          }
          
          log.video(nodeId, 'USING_PARENT_VIDEO', {
            parentId: videoParent.id,
            parentUri: parentVideoObject.uri || 'unknown',
          });
        }
        
        // Get incoming edge label for inherit_prompt (EXTENSION only)
        if (node.kind === SceneType.EXTENSION) {
          incomingEdgeLabel = this.graph.getIncomingEdgeLabel(nodeId) || undefined;
        }
      }
      
      // Generate video
      const result = await generateVideoFn(node, parentVideoObject, incomingEdgeLabel);
      
      this.updateNodeState(nodeId, {
        status: GenerationStatus.COMPLETE,
        videoObject: result.video,
        videoBlob: result.blob,
        endTime: Date.now(),
      });
      
      const duration = ((Date.now() - (this.nodeStates.get(nodeId)?.startTime || 0)) / 1000).toFixed(1);
      log.video(nodeId, 'GENERATION_COMPLETE', {
        duration: `${duration}s`,
        videoUri: result.video.uri,
        blobSize: `${(result.blob.size / 1024 / 1024).toFixed(2)}MB`,
      });
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('VideoGeneration', 'Generation failed', error as Error, { nodeId });
      
      this.updateNodeState(nodeId, {
        status: GenerationStatus.ERROR,
        error: errorMsg,
      });
      
      throw error;
    }
  }
  
  /**
   * Start cascade generation
   */
  async startCascadeGeneration(
    generateVideoFn: (
      node: Scene,
      parentVideoObject?: Video,
      incomingEdgeLabel?: string
    ) => Promise<{ blob: Blob; video: Video }>
  ): Promise<Map<SceneId, NodeState>> {
    log.info('VideoGeneration', 'Starting cascade generation', {
      totalNodes: this.nodeStates.size,
    });
    
    const activeGenerations = new Set<Promise<void>>();
    
    const processNode = async (node: Scene): Promise<void> => {
      await this.generateNode(node, generateVideoFn);
      
      // Get children and start their generation
      const children = this.getChildren(node.id);
      log.video(node.id, 'PARENT_COMPLETE', {
        childrenToStart: children.map(c => c.id),
      });
      
      for (const child of children) {
        const childReady = this.getReadyNodes().find(n => n.id === child.id);
        if (childReady) {
          const childPromise = processNode(childReady);
          activeGenerations.add(childPromise);
          childPromise.finally(() => activeGenerations.delete(childPromise));
        }
      }
    };
    
    // Start with ready nodes (typically just root)
    const initialReady = this.getReadyNodes();
    log.info('VideoGeneration', 'Initial ready nodes', {
      nodes: initialReady.map(n => n.id),
    });
    
    for (const node of initialReady) {
      const promise = processNode(node);
      activeGenerations.add(promise);
      promise.finally(() => activeGenerations.delete(promise));
    }
    
    // Wait for all generations to complete
    while (activeGenerations.size > 0) {
      log.info('Concurrent', 'Active generations', {
        activeNodes: Array.from(activeGenerations).length,
      });
      await Promise.race(Array.from(activeGenerations));
    }
    
    log.info('VideoGeneration', 'Cascade generation complete', {
      completedNodes: Array.from(this.nodeStates.values()).filter(
        s => s.status === GenerationStatus.COMPLETE
      ).length,
      errorNodes: Array.from(this.nodeStates.values()).filter(
        s => s.status === GenerationStatus.ERROR
      ).length,
    });
    
    return this.nodeStates;
  }
  
  /**
   * Get current state of all nodes
   */
  getNodeStates(): Map<SceneId, NodeState> {
    return new Map(this.nodeStates);
  }
  
  /**
   * Get state of a specific node
   */
  getNodeState(nodeId: SceneId): NodeState | undefined {
    return this.nodeStates.get(nodeId);
  }
}

