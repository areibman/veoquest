'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  type XYPosition,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeDragHandler,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FileJson,
  Flag,
  Loader2,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  applyBlueprintToDatabase,
  cloneDatabase,
  createId,
  estimateScenarioCost,
  generateBlueprintFromPrompt,
  getScenarioChoices,
  getScenarioNodes,
  nowIso,
  scenarioToBlueprint,
  updateScenarioValidation,
  validateBlueprint,
  validateScenarioGraph,
} from '@/lib/veoquestCore';
import { generateScenarioMedia, listGenerationJobs } from '@/lib/fakeVeo31';
import {
  Choice,
  PromptBlueprintInput,
  Scenario,
  ScenarioBlueprint,
  StoryNode,
  VeoQuestDatabase,
} from '@/lib/veoquestModels';
import {
  createEmptyScenarioDraft,
  loadDatabase,
  saveDatabase,
} from '@/lib/veoquestStorage';

type EditorMode = 'graph' | 'prompt' | 'json';

const DEFAULT_PROMPT_INPUT: PromptBlueprintInput = {
  title: 'Jungle Expedition',
  prompt: 'A documentary scout follows a river into a jungle ruin where every route reveals a different secret about the lost expedition.',
  genre: 'jungle expedition',
  audience: 'general viewers',
  tone: 'adventurous and suspenseful',
  branchDepth: 3,
  decisionPoints: 3,
  endings: 3,
  targetRuntimeMinutes: 5,
  contentRating: 'PG',
  constraints: 'Keep choices short. Avoid gore. Make each ending visually distinct.',
};

function deriveNodeStatus(node: StoryNode): StoryNode['status'] {
  if (node.isEnding) return 'ending';
  if (!node.prompt.trim()) return 'no-prompt';
  if (node.clipId) return 'generated';
  return 'ready-to-generate';
}

function nodeTone(node: StoryNode, selected: boolean): string {
  if (selected) return 'border-zinc-950 ring-2 ring-zinc-950';
  if (node.isEnding) return 'border-rose-300 bg-rose-50';
  if (node.clipId) return 'border-emerald-300 bg-emerald-50';
  if (!node.prompt.trim()) return 'border-amber-300 bg-amber-50';
  return 'border-sky-300 bg-sky-50';
}

function statusLabel(node: StoryNode): string {
  if (node.isEnding) return 'ending';
  if (node.clipId) return 'generated';
  if (!node.prompt.trim()) return 'no prompt';
  return 'ready';
}

function updateNodeInDb(db: VeoQuestDatabase, nodeId: string, patch: Partial<StoryNode>): VeoQuestDatabase {
  const next = cloneDatabase(db);
  const node = next.nodes[nodeId];
  if (!node) return next;
  next.nodes[nodeId] = {
    ...node,
    ...patch,
  };
  next.nodes[nodeId].status = deriveNodeStatus(next.nodes[nodeId]);
  const scenario = next.scenarios[node.scenarioId];
  if (scenario) {
    scenario.updatedAt = nowIso();
  }
  return updateScenarioValidation(next, node.scenarioId);
}

function updateScenarioInDb(db: VeoQuestDatabase, scenarioId: string, patch: Partial<Scenario>): VeoQuestDatabase {
  const next = cloneDatabase(db);
  const scenario = next.scenarios[scenarioId];
  if (!scenario) return next;
  next.scenarios[scenarioId] = {
    ...scenario,
    ...patch,
    updatedAt: nowIso(),
  };
  return updateScenarioValidation(next, scenarioId);
}

function orderChoices(choices: Choice[]): Choice[] {
  return [...choices].sort((left, right) => left.displayOrder - right.displayOrder);
}

function DesignerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedScenarioId = searchParams?.get('scenarioId') || searchParams?.get('graphId');
  const requestedMode = searchParams?.get('mode') === 'prompt' ? 'prompt' : 'graph';

  const [db, setDb] = useState<VeoQuestDatabase | null>(null);
  const [scenarioId, setScenarioId] = useState<string>('');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [mode, setMode] = useState<EditorMode>(requestedMode);
  const [promptInput, setPromptInput] = useState<PromptBlueprintInput>(DEFAULT_PROMPT_INPUT);
  const [blueprintText, setBlueprintText] = useState('');
  const [blueprintReportText, setBlueprintReportText] = useState('');
  const [generationApproved, setGenerationApproved] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, XYPosition>>({});

  useEffect(() => {
    let loaded = loadDatabase();
    let activeScenarioId = requestedScenarioId || '';
    if (!activeScenarioId || !loaded.scenarios[activeScenarioId]) {
      const draft = createEmptyScenarioDraft(loaded);
      loaded = draft.db;
      activeScenarioId = draft.scenarioId;
    }
    setDb(loaded);
    setScenarioId(activeScenarioId);
    const scenario = loaded.scenarios[activeScenarioId];
    setSelectedNodeId(scenario?.rootNodeId || '');
  }, [requestedScenarioId]);

  const scenario = db && scenarioId ? db.scenarios[scenarioId] : null;
  const nodes = useMemo(() => (db && scenario ? getScenarioNodes(db, scenario.id) : []), [db, scenario]);
  const choices = useMemo(() => (db && scenario ? getScenarioChoices(db, scenario.id) : []), [db, scenario]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null;
  const validation = useMemo(() => (db && scenario ? validateScenarioGraph(db, scenario.id) : null), [db, scenario]);
  const playtestValidation = useMemo(() => (db && scenario ? validateScenarioGraph(db, scenario.id, { requireClips: true }) : null), [db, scenario]);
  const estimate = useMemo(() => (db && scenario ? estimateScenarioCost(db, scenario.id) : null), [db, scenario]);
  const jobs = useMemo(() => (db && scenario ? listGenerationJobs(db, scenario.id).slice(-6).reverse() : []), [db, scenario]);

  const commit = (next: VeoQuestDatabase) => {
    saveDatabase(next);
    setDb(next);
  };

  const addNode = (ending = false) => {
    if (!db || !scenario) return;
    const next = cloneDatabase(db);
    const createdAt = nowIso();
    const nodeId = createId('node', `${scenario.id}:${nodes.length}:${createdAt}`);
    const node: StoryNode = {
      id: nodeId,
      scenarioId: scenario.id,
      title: ending ? 'New Ending' : 'New Scene',
      description: '',
      prompt: ending ? 'Resolve this branch with a clear final image.' : 'Describe the next cinematic story beat.',
      position: { x: 120 + (nodes.length % 4) * 220, y: 120 + Math.floor(nodes.length / 4) * 190 },
      choiceIds: [],
      isEnding: ending,
      generationType: nodes.length === 0 ? 'create' : 'extend',
      status: ending ? 'ending' : 'ready-to-generate',
    };
    next.nodes[nodeId] = node;
    next.scenarios[scenario.id].nodeIds.push(nodeId);
    const validated = updateScenarioValidation(next, scenario.id);
    commit(validated);
    setSelectedNodeId(nodeId);
  };

  const duplicateNode = () => {
    if (!db || !scenario || !selectedNode) return;
    const next = cloneDatabase(db);
    const nodeId = createId('node', `${selectedNode.id}:copy:${Date.now()}`);
    next.nodes[nodeId] = {
      ...selectedNode,
      id: nodeId,
      title: `${selectedNode.title} Copy`,
      clipId: undefined,
      choiceIds: [],
      position: {
        x: selectedNode.position.x + 40,
        y: selectedNode.position.y + 50,
      },
      status: selectedNode.isEnding ? 'ending' : 'ready-to-generate',
    };
    next.scenarios[scenario.id].nodeIds.push(nodeId);
    commit(updateScenarioValidation(next, scenario.id));
    setSelectedNodeId(nodeId);
  };

  const deleteNode = () => {
    if (!db || !scenario || !selectedNode || scenario.nodeIds.length <= 1) return;
    const next = cloneDatabase(db);
    const removedChoiceIds = new Set(
      scenario.choiceIds.filter((choiceId) => {
        const choice = next.choices[choiceId];
        return choice?.sourceNodeId === selectedNode.id || choice?.targetNodeId === selectedNode.id;
      })
    );
    delete next.nodes[selectedNode.id];
    for (const choiceId of removedChoiceIds) {
      delete next.choices[choiceId];
    }
    next.scenarios[scenario.id].nodeIds = scenario.nodeIds.filter((nodeId) => nodeId !== selectedNode.id);
    next.scenarios[scenario.id].choiceIds = scenario.choiceIds.filter((choiceId) => !removedChoiceIds.has(choiceId));
    if (next.scenarios[scenario.id].rootNodeId === selectedNode.id) {
      next.scenarios[scenario.id].rootNodeId = next.scenarios[scenario.id].nodeIds[0];
    }
    for (const nodeId of next.scenarios[scenario.id].nodeIds) {
      next.nodes[nodeId].choiceIds = next.nodes[nodeId].choiceIds.filter((choiceId) => !removedChoiceIds.has(choiceId));
    }
    const validated = updateScenarioValidation(next, scenario.id);
    commit(validated);
    setSelectedNodeId(validated.scenarios[scenario.id].rootNodeId);
  };

  const addChoice = () => {
    if (!db || !scenario || !selectedNode || selectedNode.isEnding) return;
    const next = cloneDatabase(db);
    let targetNode = nodes.find((node) => node.id !== selectedNode.id && node.isEnding);
    if (!targetNode) {
      const targetId = createId('node', `${scenario.id}:auto-ending:${Date.now()}`);
      targetNode = {
        id: targetId,
        scenarioId: scenario.id,
        title: 'New Ending',
        description: '',
        prompt: 'Resolve this branch with a clear final image.',
        position: { x: selectedNode.position.x + 240, y: selectedNode.position.y + 170 },
        choiceIds: [],
        isEnding: true,
        generationType: 'extend',
        status: 'ending',
      };
      next.nodes[targetId] = targetNode;
      next.scenarios[scenario.id].nodeIds.push(targetId);
    }

    const choiceId = createId('choice', `${selectedNode.id}:${Date.now()}`);
    const choice: Choice = {
      id: choiceId,
      scenarioId: scenario.id,
      sourceNodeId: selectedNode.id,
      targetNodeId: targetNode.id,
      label: 'New choice',
      description: '',
      displayOrder: selectedNode.choiceIds.length,
    };
    next.choices[choiceId] = choice;
    next.scenarios[scenario.id].choiceIds.push(choiceId);
    next.nodes[selectedNode.id].choiceIds.push(choiceId);
    commit(updateScenarioValidation(next, scenario.id));
  };

  const updateChoice = (choiceId: string, patch: Partial<Choice>) => {
    if (!db || !scenario) return;
    const next = cloneDatabase(db);
    const choice = next.choices[choiceId];
    if (!choice) return;
    next.choices[choiceId] = {
      ...choice,
      ...patch,
    };
    commit(updateScenarioValidation(next, scenario.id));
  };

  const removeChoice = (choiceId: string) => {
    if (!db || !scenario) return;
    const next = cloneDatabase(db);
    const choice = next.choices[choiceId];
    if (!choice) return;
    delete next.choices[choiceId];
    next.scenarios[scenario.id].choiceIds = next.scenarios[scenario.id].choiceIds.filter((id) => id !== choiceId);
    if (next.nodes[choice.sourceNodeId]) {
      next.nodes[choice.sourceNodeId].choiceIds = next.nodes[choice.sourceNodeId].choiceIds.filter((id) => id !== choiceId);
    }
    commit(updateScenarioValidation(next, scenario.id));
  };

  const moveSelectedNode = (deltaX: number, deltaY: number) => {
    if (!db || !selectedNode) return;
    commit(updateNodeInDb(db, selectedNode.id, {
      position: {
        x: Math.max(0, selectedNode.position.x + deltaX),
        y: Math.max(0, selectedNode.position.y + deltaY),
      },
    }));
  };

  const setRootNode = () => {
    if (!db || !scenario || !selectedNode) return;
    commit(updateScenarioInDb(db, scenario.id, { rootNodeId: selectedNode.id }));
  };

  const toggleEnding = () => {
    if (!db || !scenario || !selectedNode) return;
    const next = updateNodeInDb(db, selectedNode.id, { isEnding: !selectedNode.isEnding });
    if (!selectedNode.isEnding) {
      const outgoing = new Set(selectedNode.choiceIds);
      for (const choiceId of outgoing) {
        delete next.choices[choiceId];
      }
      next.nodes[selectedNode.id].choiceIds = [];
      next.scenarios[scenario.id].choiceIds = next.scenarios[scenario.id].choiceIds.filter((choiceId) => !outgoing.has(choiceId));
    }
    commit(updateScenarioValidation(next, scenario.id));
  };

  const exportBlueprint = () => {
    if (!db || !scenario) return;
    const blueprint = scenarioToBlueprint(db, scenario.id);
    setBlueprintText(JSON.stringify(blueprint, null, 2));
    setBlueprintReportText(`Valid blueprint. ${blueprint.estimatedCost.clipCount} clips, ${blueprint.estimatedCost.generationJobs} fake jobs.`);
    setMode('json');
  };

  const generatePromptBlueprint = () => {
    try {
      const blueprint = generateBlueprintFromPrompt(promptInput);
      const report = validateBlueprint(blueprint);
      setBlueprintText(JSON.stringify(blueprint, null, 2));
      setBlueprintReportText(report.valid
        ? `Valid blueprint. ${report.estimatedCost.clipCount} clips, ${report.estimatedCost.generationJobs} fake jobs.`
        : report.errors.map((item) => item.message).join('\n'));
      setError(null);
      setMode('json');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate blueprint.');
    }
  };

  const loadInvalidExample = () => {
    if (!db) return;
    const invalid = db.scenarioBlueprints['blueprint-invalid-demo'];
    if (invalid) {
      setBlueprintText(JSON.stringify(invalid, null, 2));
      setBlueprintReportText('Loaded invalid fixture. Validate it to inspect repair errors.');
      setMode('json');
    }
  };

  const validateBlueprintText = (): ScenarioBlueprint | null => {
    try {
      const parsed = JSON.parse(blueprintText) as ScenarioBlueprint;
      const report = validateBlueprint(parsed);
      setBlueprintReportText(report.valid
        ? `Valid blueprint. ${report.estimatedCost.clipCount} clips, ${report.estimatedCost.generationJobs} fake jobs.`
        : report.errors.map((item) => `${item.path}: ${item.message}`).join('\n'));
      setError(null);
      return report.valid ? parsed : null;
    } catch (caught) {
      setBlueprintReportText('');
      setError(caught instanceof Error ? caught.message : 'Blueprint JSON is not valid.');
      return null;
    }
  };

  const importBlueprint = () => {
    if (!db) return;
    const parsed = validateBlueprintText();
    if (!parsed) return;
    try {
      const next = applyBlueprintToDatabase(db, parsed);
      saveDatabase(next);
      setDb(next);
      setScenarioId(parsed.scenario.id);
      setSelectedNodeId(parsed.scenario.rootNodeId);
      setGenerationApproved(false);
      setMode('graph');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Blueprint import failed.');
    }
  };

  const runGeneration = async (selectedOnly = false) => {
    if (!db || !scenario) return;
    setError(null);
    setIsGenerating(true);
    try {
      const next = await generateScenarioMedia(
        db,
        scenario.id,
        {
          approved: selectedOnly || generationApproved,
          selectedNodeIds: selectedOnly && selectedNode ? [selectedNode.id] : undefined,
        },
        (progressDb) => {
          saveDatabase(progressDb);
          setDb(progressDb);
        }
      );
      saveDatabase(next);
      setDb(next);
      setGenerationApproved(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dummy generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const playtest = () => {
    if (!scenario || !playtestValidation?.valid) {
      setError(playtestValidation?.errors[0]?.message || 'Generate clips before playtesting.');
      return;
    }
    router.push(`/play/${scenario.id}?preview=publisher`);
  };

  if (!db || !scenario || !validation || !estimate) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading builder
      </div>
    );
  }

  const selectedChoices = selectedNode ? orderChoices(selectedNode.choiceIds.map((choiceId) => db.choices[choiceId]).filter(Boolean)) : [];
  const orderedGraphNodes = [...nodes].sort((left, right) => {
    if (left.id === scenario.rootNodeId) return -1;
    if (right.id === scenario.rootNodeId) return 1;
    return left.position.y - right.position.y || left.position.x - right.position.x || left.title.localeCompare(right.title);
  });
  const flowNodes: FlowNode[] = orderedGraphNodes.map((node) => ({
    id: node.id,
    position: dragPositions[node.id] || node.position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      label: (
        <div className="box-border w-full min-w-0 overflow-hidden p-3 text-left">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="max-w-[155px] truncate rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600">
              {scenario.rootNodeId === node.id ? 'root' : statusLabel(node)}
            </span>
            {node.clipId && <Video className="h-4 w-4 shrink-0 text-emerald-700" />}
          </div>
          <div className="truncate text-sm font-semibold text-zinc-950">{node.title}</div>
          <div className="mt-1 line-clamp-2 overflow-hidden text-xs leading-5 text-zinc-600 break-words">{node.description || node.prompt}</div>
        </div>
      ),
    },
    className: `rounded-md border-2 bg-white !p-0 text-left shadow-sm cursor-grab active:cursor-grabbing ${nodeTone(node, selectedNodeId === node.id)}`,
    style: {
      width: 220,
      maxWidth: 220,
      overflow: 'hidden',
    },
  }));
  const flowEdges: FlowEdge[] = choices
    .flatMap((choice) => {
      const source = db.nodes[choice.sourceNodeId];
      const target = db.nodes[choice.targetNodeId];
      if (!source || !target) return [];
      return [{
        id: choice.id,
        source: choice.sourceNodeId,
        target: choice.targetNodeId,
        type: 'smoothstep',
        label: choice.label,
        animated: choice.sourceNodeId === selectedNodeId,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#52525b', strokeWidth: 2 },
        labelStyle: { fill: '#3f3f46', fontSize: 12, fontWeight: 600 },
        labelBgStyle: { fill: '#fbfbf7', fillOpacity: 0.95 },
      }];
    });
  const handleFlowNodeClick: NodeMouseHandler = (_, node) => {
    setSelectedNodeId(node.id);
  };
  const handleFlowNodeDrag: NodeDragHandler = (_, node) => {
    setDragPositions((current) => ({
      ...current,
      [node.id]: {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      },
    }));
  };
  const handleFlowNodeDragStop: NodeDragHandler = (_, node) => {
    if (!db) return;
    commit(updateNodeInDb(db, node.id, {
      position: {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      },
    }));
    setDragPositions((current) => {
      const next = { ...current };
      delete next[node.id];
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Catalog
            </Button>
            <div className="min-w-0">
              <Input
                value={scenario.title}
                onChange={(event) => commit(updateScenarioInDb(db, scenario.id, { title: event.target.value }))}
                className="h-9 max-w-xl border-zinc-300 bg-white text-lg font-semibold"
                aria-label="Scenario title"
              />
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-600">
                <span>{scenario.id}</span>
                <span>{nodes.length} nodes</span>
                <span>{choices.length} choices</span>
                <span>{estimate.clipCount} clips</span>
                <span>${(estimate.estimatedCostCents / 100).toFixed(2)} estimate</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === 'graph' ? 'default' : 'outline'} onClick={() => setMode('graph')}>Graph</Button>
            <Button variant={mode === 'prompt' ? 'default' : 'outline'} onClick={() => setMode('prompt')}>
              <Sparkles className="mr-2 h-4 w-4" />
              Prompt
            </Button>
            <Button variant={mode === 'json' ? 'default' : 'outline'} onClick={() => setMode('json')}>
              <FileJson className="mr-2 h-4 w-4" />
              JSON
            </Button>
            <Button variant="outline" onClick={playtest} disabled={!playtestValidation?.valid}>
              <Play className="mr-2 h-4 w-4" />
              Playtest
            </Button>
          </div>
        </div>
      </header>

      {(error || validation.errors.length > 0) && (
        <div className="px-4 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || validation.errors[0]?.message}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 space-y-4">
          {mode === 'prompt' && (
            <Card className="rounded-md border-zinc-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-teal-700" />
                  Single Prompt Blueprint
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label>Story Title</Label>
                  <Input aria-label="Story Title" value={promptInput.title} onChange={(event) => setPromptInput({ ...promptInput, title: event.target.value })} />
                  <Label>Story Prompt</Label>
                  <Textarea aria-label="Story Prompt" rows={7} value={promptInput.prompt} onChange={(event) => setPromptInput({ ...promptInput, prompt: event.target.value })} />
                  <Label>Constraints</Label>
                  <Textarea aria-label="Constraints" rows={4} value={promptInput.constraints} onChange={(event) => setPromptInput({ ...promptInput, constraints: event.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Genre</Label>
                    <Input aria-label="Genre" value={promptInput.genre} onChange={(event) => setPromptInput({ ...promptInput, genre: event.target.value })} />
                  </div>
                  <div>
                    <Label>Tone</Label>
                    <Input aria-label="Tone" value={promptInput.tone} onChange={(event) => setPromptInput({ ...promptInput, tone: event.target.value })} />
                  </div>
                  <div>
                    <Label>Audience</Label>
                    <Input aria-label="Audience" value={promptInput.audience} onChange={(event) => setPromptInput({ ...promptInput, audience: event.target.value })} />
                  </div>
                  <div>
                    <Label>Content Rating</Label>
                    <Input aria-label="Content Rating" value={promptInput.contentRating} onChange={(event) => setPromptInput({ ...promptInput, contentRating: event.target.value })} />
                  </div>
                  <div>
                    <Label>Branch Depth</Label>
                    <Input aria-label="Branch Depth" type="number" min={2} max={6} value={promptInput.branchDepth} onChange={(event) => setPromptInput({ ...promptInput, branchDepth: Number(event.target.value) || 3 })} />
                  </div>
                  <div>
                    <Label>Decision Points</Label>
                    <Input aria-label="Decision Points" type="number" min={2} max={8} value={promptInput.decisionPoints} onChange={(event) => setPromptInput({ ...promptInput, decisionPoints: Number(event.target.value) || 3 })} />
                  </div>
                  <div>
                    <Label>Endings</Label>
                    <Input aria-label="Endings" type="number" min={1} max={6} value={promptInput.endings} onChange={(event) => setPromptInput({ ...promptInput, endings: Number(event.target.value) || 3 })} />
                  </div>
                  <div>
                    <Label>Target Runtime</Label>
                    <Input aria-label="Target Runtime" type="number" min={2} max={20} value={promptInput.targetRuntimeMinutes} onChange={(event) => setPromptInput({ ...promptInput, targetRuntimeMinutes: Number(event.target.value) || 5 })} />
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button onClick={generatePromptBlueprint} data-testid="draft-blueprint">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Draft Blueprint
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {mode === 'json' && (
            <Card className="rounded-md border-zinc-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileJson className="h-5 w-5 text-indigo-700" />
                  Scenario Blueprint JSON
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportBlueprint}>
                    <Download className="mr-2 h-4 w-4" />
                    Export Current
                  </Button>
                  <Button variant="outline" onClick={validateBlueprintText}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Validate JSON
                  </Button>
                  <Button onClick={importBlueprint}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Valid Blueprint
                  </Button>
                  <Button variant="outline" onClick={loadInvalidExample}>
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Invalid Sample
                  </Button>
                </div>
                <Textarea
                  value={blueprintText}
                  onChange={(event) => setBlueprintText(event.target.value)}
                  rows={22}
                  spellCheck={false}
                  className="font-mono text-xs"
                  aria-label="Blueprint JSON"
                  data-testid="blueprint-json"
                />
                {blueprintReportText && (
                  <pre className="max-h-40 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">{blueprintReportText}</pre>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-md border-zinc-200 bg-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg">Visual Graph</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => addNode(false)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Scene
                </Button>
                <Button size="sm" variant="outline" onClick={() => addNode(true)}>
                  <Flag className="mr-2 h-4 w-4" />
                  Ending
                </Button>
                <Button size="sm" variant="outline" onClick={duplicateNode} disabled={!selectedNode}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </Button>
                <Button size="sm" variant="outline" onClick={deleteNode} disabled={!selectedNode || nodes.length <= 1}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <div className="space-y-3" data-testid="graph-canvas">
                <div className="h-[420px] overflow-hidden rounded-md border border-zinc-200 bg-[#fbfbf7] sm:h-[520px] xl:h-[620px]" data-testid="react-flow-graph">
                  <ReactFlow
                    nodes={flowNodes}
                    edges={flowEdges}
                    fitView
                    fitViewOptions={{ padding: 0.25 }}
                    minZoom={0.25}
                    maxZoom={1.5}
                    nodesDraggable
                    nodesConnectable={false}
                    elementsSelectable
                    onNodeClick={handleFlowNodeClick}
                    onNodeDrag={handleFlowNodeDrag}
                    onNodeDragStop={handleFlowNodeDragStop}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d4d4d8" />
                    <Controls showInteractive={false} />
                    <MiniMap
                      pannable
                      zoomable
                      nodeColor={(node) => node.id === selectedNodeId ? '#18181b' : '#0f766e'}
                      maskColor="rgba(247, 247, 242, 0.72)"
                    />
                  </ReactFlow>
                </div>

                <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {orderedGraphNodes.map((node) => {
                    const outgoing = orderChoices(node.choiceIds.map((choiceId) => db.choices[choiceId]).filter(Boolean));
                    return (
                      <div
                        key={node.id}
                        className={`rounded-md border-2 bg-white text-left shadow-sm transition ${nodeTone(node, selectedNodeId === node.id)}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedNodeId(node.id)}
                          className="w-full p-4 text-left"
                          data-testid={`node-${node.id}`}
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <Badge variant="outline" className="border-zinc-300 bg-white text-[10px]">
                              {scenario.rootNodeId === node.id ? 'root' : statusLabel(node)}
                            </Badge>
                            {node.clipId && <Video className="h-4 w-4 text-emerald-700" />}
                          </div>
                          <div className="text-sm font-semibold">{node.title}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-600">{node.description || node.prompt}</div>
                        </button>
                        {outgoing.length > 0 && (
                          <div className="border-t border-zinc-200 bg-zinc-50 p-3">
                            <div className="mb-2 text-xs font-medium uppercase tracking-normal text-zinc-500">Choices</div>
                            <div className="space-y-2">
                              {outgoing.map((choice) => {
                                const target = db.nodes[choice.targetNodeId];
                                return (
                                  <button
                                    key={choice.id}
                                    type="button"
                                    onClick={() => target && setSelectedNodeId(target.id)}
                                    className="flex w-full items-start justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-xs transition hover:border-zinc-400"
                                  >
                                    <span className="font-medium text-zinc-800">{choice.label}</span>
                                    <span className="text-right text-zinc-500">to {target?.title || 'missing node'}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="rounded-md border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Generation Gate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-zinc-50 p-3">
                  <div className="text-zinc-500">Clips</div>
                  <div className="text-lg font-semibold">{estimate.clipCount}</div>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <div className="text-zinc-500">Runtime</div>
                  <div className="text-lg font-semibold">{estimate.totalRuntimeSeconds}s</div>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <div className="text-zinc-500">Jobs</div>
                  <div className="text-lg font-semibold">{estimate.generationJobs}</div>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <div className="text-zinc-500">Estimate</div>
                  <div className="text-lg font-semibold">${(estimate.estimatedCostCents / 100).toFixed(2)}</div>
                </div>
              </div>
              <label className="flex items-start gap-2 rounded-md border border-zinc-200 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={generationApproved}
                  onChange={(event) => setGenerationApproved(event.target.checked)}
                />
                <span>Approve full scenario dummy generation after validation and cost review.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => runGeneration(false)}
                  disabled={isGenerating || !generationApproved || !validation.valid}
                  data-testid="generate-all"
                >
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                  Generate All
                </Button>
                <Button variant="outline" onClick={() => runGeneration(true)} disabled={isGenerating || !selectedNode || !validation.valid}>
                  <Video className="mr-2 h-4 w-4" />
                  Selected
                </Button>
              </div>
              {jobs.length > 0 && (
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-md border border-zinc-200 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{db.nodes[job.nodeId]?.title || job.nodeId}</span>
                        <Badge variant="outline">{job.status}</Badge>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-zinc-200">
                        <div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${job.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {validation.valid ? (
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Graph is structurally valid
                </div>
              ) : (
                validation.errors.map((item) => (
                  <div key={`${item.code}-${item.path}`} className="rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-800">
                    {item.message}
                  </div>
                ))
              )}
              {validation.warnings.map((item) => (
                <div key={`${item.code}-${item.path}`} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
                  {item.message}
                </div>
              ))}
              <Separator />
              <div className={playtestValidation?.valid ? 'text-emerald-700' : 'text-zinc-600'}>
                {playtestValidation?.valid ? 'Playtest clips are ready.' : 'Playtest requires generated clips for every playable node.'}
              </div>
            </CardContent>
          </Card>

          {selectedNode && (
            <Card className="rounded-md border-zinc-200 bg-white" data-testid="node-inspector">
              <CardHeader>
                <CardTitle className="text-lg">Inspector</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Node Title</Label>
                  <Input aria-label="Node Title" value={selectedNode.title} onChange={(event) => commit(updateNodeInDb(db, selectedNode.id, { title: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea aria-label="Node Description" rows={3} value={selectedNode.description} onChange={(event) => commit(updateNodeInDb(db, selectedNode.id, { description: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Video Prompt</Label>
                  <Textarea aria-label="Video Prompt" rows={5} value={selectedNode.prompt} onChange={(event) => commit(updateNodeInDb(db, selectedNode.id, { prompt: event.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={setRootNode} disabled={scenario.rootNodeId === selectedNode.id}>
                    <Save className="mr-2 h-4 w-4" />
                    Set Root
                  </Button>
                  <Button variant="outline" onClick={toggleEnding}>
                    <Flag className="mr-2 h-4 w-4" />
                    {selectedNode.isEnding ? 'Make Scene' : 'Make Ending'}
                  </Button>
                </div>
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label>Position</Label>
                    <span className="text-xs text-zinc-500" data-testid="node-position">
                      {selectedNode.position.x}, {selectedNode.position.y}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moveSelectedNode(0, -80)}
                      aria-label="Move node up"
                      data-testid="move-node-up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moveSelectedNode(-80, 0)}
                      aria-label="Move node left"
                      data-testid="move-node-left"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moveSelectedNode(80, 0)}
                      aria-label="Move node right"
                      data-testid="move-node-right"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moveSelectedNode(0, 80)}
                      aria-label="Move node down"
                      data-testid="move-node-down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Choices</Label>
                  <Button size="sm" variant="outline" onClick={addChoice} disabled={selectedNode.isEnding}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {selectedChoices.map((choice) => (
                    <div key={choice.id} className="space-y-2 rounded-md border border-zinc-200 p-3">
                      <Input value={choice.label} onChange={(event) => updateChoice(choice.id, { label: event.target.value })} aria-label="Choice label" />
                      <Textarea rows={2} value={choice.description} onChange={(event) => updateChoice(choice.id, { description: event.target.value })} aria-label="Choice description" />
                      <select
                        value={choice.targetNodeId}
                        onChange={(event) => updateChoice(choice.id, { targetNodeId: event.target.value })}
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        aria-label="Choice target"
                      >
                        {nodes.filter((node) => node.id !== selectedNode.id).map((node) => (
                          <option key={node.id} value={node.id}>{node.title}</option>
                        ))}
                      </select>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => removeChoice(choice.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!selectedNode.isEnding && selectedChoices.length === 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Add at least one choice or mark this node as an ending.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}

export default function Designer() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading builder
      </div>
    }>
      <DesignerContent />
    </Suspense>
  );
}
