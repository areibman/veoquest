/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { SceneType, SceneGraph, Scene } from '@/lib/sceneGraph';
import {
  getGraph,
  saveGraph,
  createNewGraph,
  StoredGraph,
  markGenerationComplete,
  storeVideoObject,
  storeVideoFile,
  storeChoiceVideo,
} from '@/lib/graphStorage';
import { log } from '@/lib/logger';
import SceneNode from '@/components/SceneNode';
import NodeEditor from '@/components/NodeEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Save, Play, Plus, Loader2 } from 'lucide-react';

const nodeTypes = {
  sceneNode: SceneNode,
};

export default function Designer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const graphId = searchParams?.get('graphId');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [graphName, setGraphName] = useState('Untitled Game');
  const [currentGraphId, setCurrentGraphId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load existing graph if graphId is provided
  useEffect(() => {
    if (graphId) {
      const storedGraph = getGraph(graphId);
      if (storedGraph) {
        setCurrentGraphId(storedGraph.id);
        setGraphName(storedGraph.name);
        loadGraphToFlow(storedGraph);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId]);

  const loadGraphToFlow = (storedGraph: StoredGraph) => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    Object.values(storedGraph.graph.nodes).forEach((scene, index) => {
      flowNodes.push({
        id: scene.id,
        type: 'sceneNode',
        position: { x: 100 + index * 250, y: 100 + (index % 3) * 150 },
        data: scene,
      });

      scene.edges?.forEach((edge, edgeIndex) => {
        flowEdges.push({
          id: `${scene.id}-${edge.target}-${edgeIndex}`,
          source: scene.id,
          target: edge.target,
          label: edge.label,
        });
      });
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        ...connection,
        id: `${connection.source}-${connection.target}-${Date.now()}`,
      } as Edge;
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const addNode = (type: SceneType) => {
    const nodeId = `${type}_${Date.now()}`;
    const newNode: Node = {
      id: nodeId,
      type: 'sceneNode',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        id: nodeId,
        kind: type,
        name: `New ${type} node`,
        edges: [],
        segments: type === SceneType.ROOT || type === SceneType.EXTENSION ? 1 : undefined,
        duration_per_segment_sec: 8,
        prompt: type === SceneType.ROOT ? '' : null,
        inherit_prompt: type === SceneType.EXTENSION,
      } as Scene,
    };
    setNodes((nds) => [...nds, newNode]);
    log.info('Designer', 'Added node', { nodeId, type });
  };

  const handleSaveGraph = () => {
    try {
      // Convert flow to scene graph
      const sceneNodes: Record<string, Scene> = {};
      
      nodes.forEach((node) => {
        const scene = node.data as Scene;
        
        let nodeEdges;
        
        if (scene.kind === SceneType.CHOICE) {
          // For choice nodes: use scene.edges (which has labels/prompts),
          // but update targets from ReactFlow edges
          const reactFlowEdges = edges.filter((e) => e.source === node.id);
          
          if (scene.edges && scene.edges.length > 0) {
            // Match scene.edges with ReactFlow edges by index
            nodeEdges = scene.edges.map((sceneEdge, index) => {
              const reactFlowEdge = reactFlowEdges[index];
              return {
                target: reactFlowEdge?.target || sceneEdge.target || '',
                label: sceneEdge.label || '',
                prompt: sceneEdge.prompt || '',
              };
            });
          } else {
            // No saved choice options yet
            nodeEdges = reactFlowEdges.map((e) => ({
              target: e.target,
              label: e.label as string || '',
              prompt: '',
            }));
          }
        } else {
          // For other nodes, just use ReactFlow edges
          nodeEdges = edges
            .filter((e) => e.source === node.id)
            .map((e) => ({
              target: e.target,
              label: e.label as string | undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              prompt: (e as any).prompt as string | undefined,
            }));
        }
        
        sceneNodes[node.id] = {
          ...scene,
          edges: nodeEdges,
        };
      });

      const graph: SceneGraph = new SceneGraph({ nodes: sceneNodes });
      
      // Validate
      graph.validate();
      setValidationError(null);

      // Save
      let storedGraph: StoredGraph;
      if (currentGraphId) {
        const existing = getGraph(currentGraphId);
        if (existing) {
          storedGraph = {
            ...existing,
            name: graphName,
            graph: graph.toJSON(),
          };
        } else {
          throw new Error('Graph not found');
        }
      } else {
        storedGraph = createNewGraph(graphName);
        storedGraph.graph = graph.toJSON();
        setCurrentGraphId(storedGraph.id);
      }

      saveGraph(storedGraph);
      log.info('Designer', 'Graph saved', { graphId: storedGraph.id, nodeCount: nodes.length });
      alert('Graph saved successfully!');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Validation failed';
      setValidationError(errorMsg);
      log.error('Designer', 'Save failed', error as Error);
      alert(`Error: ${errorMsg}`);
    }
  };

  const updateNodeStatus = useCallback((nodeId: string, status: string, error?: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                generationStatus: status,
                generationError: error,
              },
            }
          : n
      )
    );
  }, [setNodes]);

  const handleStartGeneration = async () => {
    if (!currentGraphId) {
      alert('Please save the graph first');
      return;
    }
    
    try {
      // Validate graph
      const sceneNodes: Record<string, Scene> = {};
      nodes.forEach((node) => {
        const scene = node.data as Scene;
        
        let nodeEdges;
        
        if (scene.kind === SceneType.CHOICE) {
          // For choice nodes: use scene.edges (which has labels/prompts),
          // but update targets from ReactFlow edges
          const reactFlowEdges = edges.filter((e) => e.source === node.id);
          
          if (scene.edges && scene.edges.length > 0) {
            // Match scene.edges with ReactFlow edges by index
            nodeEdges = scene.edges.map((sceneEdge, index) => {
              const reactFlowEdge = reactFlowEdges[index];
              return {
                target: reactFlowEdge?.target || sceneEdge.target || '',
                label: sceneEdge.label || '',
                prompt: sceneEdge.prompt || '',
              };
            });
          } else {
            // No saved choice options yet
            nodeEdges = reactFlowEdges.map((e) => ({
              target: e.target,
              label: e.label as string || '',
              prompt: '',
            }));
          }
        } else {
          // For other nodes, just use ReactFlow edges
          nodeEdges = edges
            .filter((e) => e.source === node.id)
            .map((e) => ({
              target: e.target,
              label: e.label as string | undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              prompt: (e as any).prompt as string | undefined,
            }));
        }
        
        sceneNodes[node.id] = { ...scene, edges: nodeEdges };
      });
      
      const graph = new SceneGraph({ nodes: sceneNodes });
      graph.validate();
      
      setIsGenerating(true);
      setValidationError(null);
      
      // Initialize all video nodes as pending
      nodes.forEach((node) => {
        const scene = node.data as Scene;
        if (scene.kind === SceneType.ROOT || scene.kind === SceneType.EXTENSION) {
          updateNodeStatus(node.id, 'pending');
        }
      });

      // Start generation with SSE
      const abortController = new AbortController();
      
      const response = await fetch('/api/generate-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graphId: currentGraphId,
          graph: graph.toJSON(),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (!data) continue;
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.nodeId && parsed.status) {
                // Update node status
                const status = parsed.status === 'complete' ? 'complete' :
                              parsed.status === 'error' ? 'error' :
                              parsed.status === 'generating' ? 'generating' : 'pending';
                updateNodeStatus(parsed.nodeId, status, parsed.error);
              } else if (parsed.videoPath && parsed.videoObject && parsed.nodeId) {
                // Video saved event - store in localStorage
                if (parsed.choiceIndex !== undefined) {
                  // This is a choice video
                  log.info('Designer', 'Storing choice video metadata', {
                    nodeId: parsed.nodeId,
                    choiceIndex: parsed.choiceIndex,
                    path: parsed.videoPath,
                    targetNodeId: parsed.targetNodeId,
                  });
                  storeChoiceVideo(
                    currentGraphId,
                    parsed.nodeId,
                    parsed.choiceIndex,
                    parsed.videoPath,
                    parsed.targetNodeId,
                    parsed.videoObject
                  );
                } else {
                  // Regular video (ROOT/EXTENSION)
                  log.info('Designer', 'Storing video metadata', {
                    nodeId: parsed.nodeId,
                    path: parsed.videoPath,
                  });
                  storeVideoFile(currentGraphId, parsed.nodeId, parsed.videoPath);
                  storeVideoObject(currentGraphId, parsed.nodeId, parsed.videoObject);
                }
              } else if (parsed.completedNodes !== undefined) {
                // Generation complete
                log.info('Designer', 'Generation complete', parsed);
                setIsGenerating(false);
                markGenerationComplete(currentGraphId, true);
                alert('Video generation complete! You can now play the game.');
              } else if (parsed.error) {
                // Error event from server
                log.error('Designer', 'Generation error from server', new Error(parsed.error), {
                  rawError: parsed.error,
                  fullData: parsed,
                });
                setIsGenerating(false);
                setValidationError(parsed.error);
              }
            } catch (e) {
              log.warn('Designer', 'Failed to parse SSE data', { line, error: e });
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Validation failed';
      setValidationError(errorMsg);
      setIsGenerating(false);
      alert(`Error: ${errorMsg}`);
    }
  };


  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Input
              value={graphName}
              onChange={(e) => setGraphName(e.target.value)}
              className="w-64"
              placeholder="Game Name"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveGraph} variant="default">
              <Save className="h-4 w-4 mr-2" />
              Save Graph
            </Button>
            <Button
              onClick={handleStartGeneration}
              disabled={!currentGraphId || isGenerating}
              variant="default"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Create Game
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b bg-muted/50 p-2 flex gap-2">
        <Button
          onClick={() => addNode(SceneType.ROOT)}
          variant="secondary"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Root Scene
        </Button>
        <Button
          onClick={() => addNode(SceneType.EXTENSION)}
          variant="secondary"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Extension Scene
        </Button>
        <Button
          onClick={() => addNode(SceneType.CHOICE)}
          variant="secondary"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Choice Scene
        </Button>
        <Button
          onClick={() => addNode(SceneType.END)}
          variant="secondary"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          End Scene
        </Button>
      </div>

      {validationError && (
        <Alert variant="destructive" className="mx-4 mt-4">
          <AlertDescription>
            <strong>Validation Error:</strong> {validationError}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* ReactFlow Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>

        {/* Node Editor Sidebar */}
        {selectedNode && (
          <Card className="w-96 border-l rounded-none">
            <CardContent className="p-6">
              <NodeEditor
                node={selectedNode}
                onUpdate={(updatedNode) => {
                  setNodes((nds) =>
                    nds.map((n) => (n.id === updatedNode.id ? updatedNode : n))
                  );
                  setSelectedNode(updatedNode);
                }}
                onClose={() => setSelectedNode(null)}
              />
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
