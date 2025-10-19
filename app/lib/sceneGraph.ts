/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { log } from './logger';

/**
 * Scene types matching the Python implementation
 */
export enum SceneType {
  ROOT = 'root',
  CHOICE = 'choice',
  EXTENSION = 'extension',
  END = 'end',
}

export type SceneId = string;

/**
 * Directed edge to another scene
 */
export interface Edge {
  target: SceneId;
  label?: string; // Required for CHOICE scenes; ignored otherwise
  prompt?: string; // Prompt for this choice's video (CHOICE scenes only)
}

/**
 * Scene node in the graph
 */
export interface Scene {
  id: SceneId;
  kind: SceneType;
  name?: string;
  edges: Edge[];

  // EXTENSION/ROOT specific properties
  segments?: number; // Number of 8s clips to stitch
  duration_per_segment_sec?: number; // Usually fixed at 8
  prompt?: string | null;
  inherit_prompt?: boolean;

  // Optional metadata
  notes?: string;
}

/**
 * Complete scene graph structure
 */
export interface SceneGraphData {
  nodes: Record<SceneId, Scene>;
}

/**
 * Scene graph with validation and path enumeration
 */
export class SceneGraph {
  nodes: Record<SceneId, Scene>;

  constructor(data: SceneGraphData) {
    this.nodes = data.nodes;
  }

  /**
   * Get the unique root node
   */
  root(): Scene {
    const roots = Object.values(this.nodes).filter(s => s.kind === SceneType.ROOT);
    if (roots.length !== 1) {
      throw new Error(`Graph must have exactly one root, found ${roots.length}.`);
    }
    return roots[0];
  }

  /**
   * Validate graph structure according to specification
   */
  validate(): void {
    log.info('SceneGraph', 'Starting validation', { nodeCount: Object.keys(this.nodes).length });

    try {
      const r = this.root();

      for (const s of Object.values(this.nodes)) {
        if (s.kind === SceneType.CHOICE) {
          if (!s.edges || s.edges.length === 0) {
            throw new Error(`CHOICE '${s.id}' (${s.name || 'unnamed'}) must have at least one option. Click the node, add choice options, and connect child nodes.`);
          }
          const missingLabels = s.edges.filter(e => !e.label).length;
          if (missingLabels > 0) {
            throw new Error(`CHOICE '${s.id}' (${s.name || 'unnamed'}) has ${missingLabels} edge(s) without labels. Edit the node and click 'Save Choice Options'.`);
          }
          const missingPrompts = s.edges.filter(e => !e.prompt).length;
          if (missingPrompts > 0) {
            throw new Error(`CHOICE '${s.id}' (${s.name || 'unnamed'}) has ${missingPrompts} edge(s) without prompts. Edit the node, add prompts, and click 'Save Choice Options'.`);
          }
          // Validate that each choice has exactly one child node
          const childCounts = new Map<string, number>();
          for (const edge of s.edges) {
            childCounts.set(edge.target, (childCounts.get(edge.target) || 0) + 1);
          }
          if (childCounts.size !== s.edges.length) {
            throw new Error(`CHOICE '${s.id}' must have unique children for each choice option.`);
          }
        } else if (s.kind === SceneType.END) {
          if (s.edges && s.edges.length > 0) {
            throw new Error(`END '${s.id}' must not have outgoing edges.`);
          }
        }
        // EXTENSION/ROOT can have 0..n edges
      }

      // Check reachability
      const reachable = new Set(this.dfsIds(r.id));
      const unreachable = Object.keys(this.nodes).filter(id => !reachable.has(id));
      if (unreachable.length > 0) {
        throw new Error(`Unreachable scenes: ${unreachable.join(', ')}`);
      }

      log.info('SceneGraph', 'Validation passed', { reachableNodes: reachable.size });
    } catch (error) {
      log.error('SceneGraph', 'Validation failed', error as Error);
      throw error;
    }
  }

  /**
   * DFS to find all reachable node IDs
   */
  private dfsIds(start: SceneId): Set<SceneId> {
    const seen = new Set<SceneId>();
    const stack = [start];

    while (stack.length > 0) {
      const sid = stack.pop()!;
      if (seen.has(sid)) continue;
      seen.add(sid);

      const node = this.nodes[sid];
      if (node && node.edges) {
        for (const e of node.edges) {
          stack.push(e.target);
        }
      }
    }

    return seen;
  }

  /**
   * Get parent nodes for a given node
   */
  getParents(nodeId: SceneId): Scene[] {
    const parents: Scene[] = [];
    for (const node of Object.values(this.nodes)) {
      if (node.edges?.some(e => e.target === nodeId)) {
        parents.push(node);
      }
    }
    return parents;
  }

  /**
   * Get the edge label from parent to child (for inherit_prompt)
   */
  getIncomingEdgeLabel(nodeId: SceneId): string | null {
    for (const node of Object.values(this.nodes)) {
      if (node.edges) {
        const edge = node.edges.find(e => e.target === nodeId);
        if (edge) {
          return edge.label || null;
        }
      }
    }
    return null;
  }

  /**
   * Enumerate all paths from root to end
   */
  enumeratePaths(): Array<Array<{ scene: Scene; choiceLabel?: string }>> {
    const start = this.root();
    const paths: Array<Array<{ scene: Scene; choiceLabel?: string }>> = [];

    const walk = (
      cur: Scene,
      path: Array<{ scene: Scene; choiceLabel?: string }>
    ): void => {
      if (cur.kind === SceneType.END || !cur.edges || cur.edges.length === 0) {
        paths.push([...path, { scene: cur }]);
        return;
      }

      for (const e of cur.edges) {
        const nxt = this.nodes[e.target];
        if (nxt) {
          walk(nxt, [...path, { scene: cur, choiceLabel: e.label }]);
        }
      }
    };

    walk(start, []);
    return paths;
  }

  /**
   * Calculate total render time for a path
   */
  totalRenderTimeSec(path: Array<{ scene: Scene; choiceLabel?: string }>): number {
    let total = 0;
    for (const { scene } of path) {
      if (scene.kind === SceneType.ROOT || scene.kind === SceneType.EXTENSION) {
        const segments = scene.segments || 1;
        const duration = scene.duration_per_segment_sec || 8;
        total += segments * duration;
      }
    }
    return total;
  }

  /**
   * Convert to JSON-serializable format
   */
  toJSON(): SceneGraphData {
    return { nodes: this.nodes };
  }

  /**
   * Create from JSON data
   */
  static fromJSON(data: SceneGraphData): SceneGraph {
    return new SceneGraph(data);
  }
}

