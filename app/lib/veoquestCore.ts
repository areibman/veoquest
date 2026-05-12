import {
  AccessResult,
  BLUEPRINT_SCHEMA_VERSION,
  Choice,
  Clip,
  ContentPack,
  CostEstimate,
  DEMO_USER_ID,
  Entitlement,
  Game,
  OriginalPrompt,
  Playthrough,
  PlaythroughEvent,
  PromptBlueprintInput,
  Scenario,
  ScenarioBlueprint,
  ScenarioSettings,
  StoryNode,
  ValidationIssue,
  ValidationReport,
  VeoQuestDatabase,
} from './veoquestModels';

export const DEFAULT_SCENARIO_SETTINGS: ScenarioSettings = {
  aspectRatio: '16:9',
  clipDurationSeconds: 4,
  extensionDurationSeconds: 4,
  clipCountLimit: 24,
  branchDepthLimit: 6,
  costPerClipCents: 80,
  styleGuidance: 'Cinematic, readable action, clear decision beats, no hard cuts between branches.',
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'story';
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createId(prefix: string, source: string): string {
  return `${prefix}-${slugify(source)}-${stableHash(`${prefix}:${source}`).toString(36).slice(0, 6)}`;
}

export function cloneDatabase(db: VeoQuestDatabase): VeoQuestDatabase {
  return JSON.parse(JSON.stringify(db)) as VeoQuestDatabase;
}

export function emptyValidationReport(cost: CostEstimate): ValidationReport {
  return {
    valid: true,
    errors: [],
    warnings: [],
    estimatedCost: cost,
  };
}

export function estimateCostForNodes(nodes: Array<{ isEnding?: boolean; generationType?: 'create' | 'extend' }>, settings: ScenarioSettings): CostEstimate {
  const clipNodes = nodes.filter((node) => !node.isEnding);
  const extensionCount = clipNodes.filter((node) => node.generationType === 'extend').length;
  const totalRuntimeSeconds = clipNodes.reduce((total, node) => {
    return total + (node.generationType === 'extend' ? settings.extensionDurationSeconds : settings.clipDurationSeconds);
  }, 0);

  return {
    clipCount: clipNodes.length,
    extensionCount,
    totalRuntimeSeconds,
    generationJobs: clipNodes.length,
    estimatedCostCents: clipNodes.length * settings.costPerClipCents,
  };
}

export function estimateBlueprintCost(blueprint: ScenarioBlueprint): CostEstimate {
  return estimateCostForNodes(blueprint.nodes, blueprint.scenario.settings);
}

export function estimateScenarioCost(db: VeoQuestDatabase, scenarioId: string): CostEstimate {
  const scenario = db.scenarios[scenarioId];
  if (!scenario) {
    return {
      clipCount: 0,
      extensionCount: 0,
      totalRuntimeSeconds: 0,
      generationJobs: 0,
      estimatedCostCents: 0,
    };
  }

  return estimateCostForNodes(
    scenario.nodeIds.map((nodeId) => db.nodes[nodeId]).filter(Boolean),
    scenario.settings
  );
}

function issue(code: string, path: string, message: string, severity: 'error' | 'warning' = 'error'): ValidationIssue {
  return { code, path, message, severity };
}

function isStableId(id: string): boolean {
  return /^[a-z][a-z0-9-]{2,}$/.test(id);
}

function validatePromptText(prompt: string, path: string, issues: ValidationIssue[]): void {
  const trimmed = prompt.trim();
  if (trimmed.length < 10) {
    issues.push(issue('prompt.too_short', path, 'Prompt must be at least 10 characters so fake and future media generation have enough direction.'));
  }

  const blockedPhrases = ['graphic sexual', 'real private person', 'explicit self-harm'];
  const lower = trimmed.toLowerCase();
  const blocked = blockedPhrases.find((phrase) => lower.includes(phrase));
  if (blocked) {
    issues.push(issue('prompt.content_policy', path, `Prompt contains disallowed content marker "${blocked}".`));
  }
}

function maxDepthFrom(rootNodeId: string, choicesBySource: Map<string, Choice[] | ScenarioBlueprint['choices']>, hiddenNodeIds = new Set<string>()): number {
  let maxDepth = 0;
  const stack: Array<{ nodeId: string; depth: number }> = [{ nodeId: rootNodeId, depth: 0 }];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || hiddenNodeIds.has(current.nodeId)) continue;
    maxDepth = Math.max(maxDepth, current.depth);
    const key = `${current.nodeId}:${current.depth}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const choices = choicesBySource.get(current.nodeId) || [];
    for (const choice of choices) {
      stack.push({ nodeId: choice.targetNodeId, depth: current.depth + 1 });
    }
  }

  return maxDepth;
}

function findReachable(rootNodeId: string, choicesBySource: Map<string, Array<{ targetNodeId: string }>>): Set<string> {
  const reachable = new Set<string>();
  const stack = [rootNodeId];

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    const choices = choicesBySource.get(nodeId) || [];
    for (const choice of choices) {
      stack.push(choice.targetNodeId);
    }
  }

  return reachable;
}

function detectCycle(rootNodeId: string, choicesBySource: Map<string, Array<{ targetNodeId: string }>>): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const walk = (nodeId: string): string[] => {
    if (visiting.has(nodeId)) {
      const start = path.indexOf(nodeId);
      return start >= 0 ? path.slice(start).concat(nodeId) : [nodeId, nodeId];
    }
    if (visited.has(nodeId)) return [];

    visiting.add(nodeId);
    path.push(nodeId);
    for (const choice of choicesBySource.get(nodeId) || []) {
      const cycle = walk(choice.targetNodeId);
      if (cycle.length > 0) return cycle;
    }
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return [];
  };

  return walk(rootNodeId);
}

export function validateBlueprint(blueprint: ScenarioBlueprint): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const estimatedCost = estimateBlueprintCost(blueprint);
  const hiddenNodeIds = new Set((blueprint.metadata.hiddenNodeIds || []) as string[]);

  if (blueprint.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    errors.push(issue('schema.version', 'schemaVersion', `Blueprint schema version must be ${BLUEPRINT_SCHEMA_VERSION}.`));
  }

  if (!blueprint.game?.id || !blueprint.contentPack?.id || !blueprint.scenario?.id) {
    errors.push(issue('blueprint.identity', 'game/contentPack/scenario', 'Blueprint must include game, content pack, and scenario identity.'));
  }

  const nodeIds = new Set<string>();
  const nodeMap = new Map<string, ScenarioBlueprint['nodes'][number]>();
  blueprint.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (!node.id || !isStableId(node.id)) {
      errors.push(issue('node.id', `${path}.id`, 'Every node must have a stable lowercase ID.'));
    }
    if (nodeIds.has(node.id)) {
      errors.push(issue('node.duplicate_id', `${path}.id`, `Duplicate node ID "${node.id}".`));
    }
    nodeIds.add(node.id);
    nodeMap.set(node.id, node);

    if (!node.title.trim()) {
      errors.push(issue('node.title', `${path}.title`, 'Every node needs a title.'));
    }
    if (!node.isEnding) {
      validatePromptText(node.prompt || '', `${path}.prompt`, errors);
    }
  });

  if (!nodeIds.has(blueprint.scenario.rootNodeId)) {
    errors.push(issue('scenario.root', 'scenario.rootNodeId', 'The root node must exist in the blueprint.'));
  }

  const choicesBySource = new Map<string, ScenarioBlueprint['choices']>();
  const choicesByTarget = new Map<string, ScenarioBlueprint['choices']>();
  const choiceIds = new Set<string>();
  blueprint.choices.forEach((choice, index) => {
    const path = `choices[${index}]`;
    if (!choice.id || !isStableId(choice.id)) {
      errors.push(issue('choice.id', `${path}.id`, 'Every choice must have a stable lowercase ID.'));
    }
    if (choiceIds.has(choice.id)) {
      errors.push(issue('choice.duplicate_id', `${path}.id`, `Duplicate choice ID "${choice.id}".`));
    }
    choiceIds.add(choice.id);

    if (!choice.label.trim()) {
      errors.push(issue('choice.label', `${path}.label`, 'Every choice needs a readable label.'));
    }
    if (!nodeIds.has(choice.sourceNodeId)) {
      errors.push(issue('choice.source', `${path}.sourceNodeId`, `Choice source "${choice.sourceNodeId}" does not exist.`));
    }
    if (!nodeIds.has(choice.targetNodeId)) {
      errors.push(issue('choice.target', `${path}.targetNodeId`, `Choice target "${choice.targetNodeId}" does not exist.`));
    }

    const current = choicesBySource.get(choice.sourceNodeId) || [];
    current.push(choice);
    choicesBySource.set(choice.sourceNodeId, current);
    const incoming = choicesByTarget.get(choice.targetNodeId) || [];
    incoming.push(choice);
    choicesByTarget.set(choice.targetNodeId, incoming);
  });

  for (const node of blueprint.nodes) {
    const outgoing = choicesBySource.get(node.id) || [];
    if (node.isEnding && outgoing.length > 0) {
      errors.push(issue('node.ending_choices', `nodes.${node.id}`, 'Ending nodes cannot have outgoing choices.'));
    }
    if (!node.isEnding && !hiddenNodeIds.has(node.id) && outgoing.length === 0) {
      errors.push(issue('node.missing_choices', `nodes.${node.id}`, 'Every non-ending node needs at least one outgoing choice.'));
    }
  }

  if (!blueprint.nodes.some((node) => node.isEnding)) {
    errors.push(issue('graph.no_ending', 'nodes', 'The graph must have at least one ending.'));
  }

  for (const [targetNodeId, incoming] of choicesByTarget) {
    const target = nodeMap.get(targetNodeId);
    if (target && !target.isEnding && incoming.length > 1) {
      errors.push(issue(
        'graph.converging_extension',
        `nodes.${targetNodeId}`,
        `Node "${target.title}" has ${incoming.length} incoming branches. Non-ending convergence is blocked so each Veo extension has one source clip lineage.`
      ));
    }
  }

  const reachable = findReachable(blueprint.scenario.rootNodeId, choicesBySource);
  for (const node of blueprint.nodes) {
    if (!reachable.has(node.id) && !hiddenNodeIds.has(node.id)) {
      errors.push(issue('graph.unreachable_node', `nodes.${node.id}`, `Node "${node.title}" is unreachable from the root.`));
    }
  }

  const cycle = detectCycle(blueprint.scenario.rootNodeId, choicesBySource);
  if (cycle.length > 0) {
    errors.push(issue('graph.cycle', 'choices', `Cycles are not supported in this prototype: ${cycle.join(' -> ')}.`));
  }

  const configuredDepth = maxDepthFrom(blueprint.scenario.rootNodeId, choicesBySource, hiddenNodeIds);
  if (configuredDepth > blueprint.scenario.settings.branchDepthLimit) {
    errors.push(issue('limits.branch_depth', 'scenario.settings.branchDepthLimit', `Graph depth ${configuredDepth} exceeds configured limit ${blueprint.scenario.settings.branchDepthLimit}.`));
  }
  if (estimatedCost.clipCount > blueprint.scenario.settings.clipCountLimit) {
    errors.push(issue('limits.clip_count', 'scenario.settings.clipCountLimit', `Clip count ${estimatedCost.clipCount} exceeds configured limit ${blueprint.scenario.settings.clipCountLimit}.`));
  }

  if (blueprint.generationPlan.approved && errors.length > 0) {
    errors.push(issue('generation.approval_invalid', 'generationPlan.approved', 'Generation approval cannot be set on an invalid blueprint.'));
  }

  if (Math.abs(blueprint.estimatedCost.estimatedCostCents - estimatedCost.estimatedCostCents) > blueprint.scenario.settings.costPerClipCents) {
    warnings.push(issue('estimate.stale', 'estimatedCost', 'Stored estimate differs from the current graph estimate.', 'warning'));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedCost,
  };
}

export function validateScenarioGraph(
  db: VeoQuestDatabase,
  scenarioId: string,
  options: { requireClips?: boolean } = {}
): ValidationReport {
  const scenario = db.scenarios[scenarioId];
  const estimatedCost = estimateScenarioCost(db, scenarioId);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!scenario) {
    return {
      valid: false,
      errors: [issue('scenario.missing', 'scenarioId', `Scenario "${scenarioId}" does not exist.`)],
      warnings,
      estimatedCost,
    };
  }

  const nodes = scenario.nodeIds.map((nodeId) => db.nodes[nodeId]).filter(Boolean);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const choices = scenario.choiceIds.map((choiceId) => db.choices[choiceId]).filter(Boolean);
  const choicesBySource = new Map<string, Choice[]>();
  const choicesByTarget = new Map<string, Choice[]>();

  if (!nodeIds.has(scenario.rootNodeId)) {
    errors.push(issue('scenario.root', 'scenario.rootNodeId', 'Scenario root node must exist.'));
  }

  for (const node of nodes) {
    if (!node.title.trim()) {
      errors.push(issue('node.title', `nodes.${node.id}.title`, 'Node title is required.'));
    }
    if (!node.isEnding) {
      validatePromptText(node.prompt, `nodes.${node.id}.prompt`, errors);
    }
    if (options.requireClips && !node.isEnding) {
      if (!node.clipId || !db.clips[node.clipId]) {
        errors.push(issue('media.missing_clip', `nodes.${node.id}.clipId`, `Node "${node.title}" needs a generated dummy clip before playtesting.`));
      } else if (db.clips[node.clipId].status !== 'ready') {
        errors.push(issue('media.clip_not_ready', `clips.${node.clipId}.status`, `Clip for "${node.title}" is not ready.`));
      }
    }
  }

  for (const choice of choices) {
    if (!choice.label.trim()) {
      errors.push(issue('choice.label', `choices.${choice.id}.label`, 'Choice label is required.'));
    }
    if (!nodeIds.has(choice.sourceNodeId)) {
      errors.push(issue('choice.source', `choices.${choice.id}.sourceNodeId`, 'Choice source node is missing.'));
    }
    if (!nodeIds.has(choice.targetNodeId)) {
      errors.push(issue('choice.target', `choices.${choice.id}.targetNodeId`, 'Choice target node is missing.'));
    }
    const current = choicesBySource.get(choice.sourceNodeId) || [];
    current.push(choice);
    choicesBySource.set(choice.sourceNodeId, current);
    const incoming = choicesByTarget.get(choice.targetNodeId) || [];
    incoming.push(choice);
    choicesByTarget.set(choice.targetNodeId, incoming);
  }

  for (const node of nodes) {
    const outgoing = choicesBySource.get(node.id) || [];
    if (node.isEnding && outgoing.length > 0) {
      errors.push(issue('node.ending_choices', `nodes.${node.id}`, 'Ending nodes cannot have outgoing choices.'));
    }
    if (!node.isEnding && outgoing.length === 0) {
      errors.push(issue('node.missing_choices', `nodes.${node.id}`, 'Non-ending nodes need at least one outgoing choice.'));
    }
  }

  if (!nodes.some((node) => node.isEnding)) {
    errors.push(issue('graph.no_ending', 'nodes', 'Scenario needs at least one ending.'));
  }

  for (const [targetNodeId, incoming] of choicesByTarget) {
    const target = nodeById.get(targetNodeId);
    if (target && !target.isEnding && incoming.length > 1) {
      errors.push(issue(
        'graph.converging_extension',
        `nodes.${targetNodeId}`,
        `Node "${target.title}" has ${incoming.length} incoming branches. Non-ending convergence is blocked so each Veo extension has one source clip lineage.`
      ));
    }
  }

  const reachable = findReachable(scenario.rootNodeId, choicesBySource);
  for (const node of nodes) {
    if (!reachable.has(node.id) && !node.isHidden) {
      warnings.push(issue('graph.orphan_node', `nodes.${node.id}`, `Node "${node.title}" is not reachable from the root.`, 'warning'));
    }
  }

  const cycle = detectCycle(scenario.rootNodeId, choicesBySource);
  if (cycle.length > 0) {
    errors.push(issue('graph.cycle', 'choices', `Cycles are not supported in this prototype: ${cycle.join(' -> ')}.`));
  }

  const depth = maxDepthFrom(scenario.rootNodeId, choicesBySource);
  if (depth > scenario.settings.branchDepthLimit) {
    errors.push(issue('limits.branch_depth', 'settings.branchDepthLimit', `Graph depth ${depth} exceeds configured limit ${scenario.settings.branchDepthLimit}.`));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedCost,
  };
}

export function blueprintToEntities(blueprint: ScenarioBlueprint, createdAt = nowIso()): {
  game: Game;
  contentPack: ContentPack;
  scenario: Scenario;
  nodes: Record<string, StoryNode>;
  choices: Record<string, Choice>;
} {
  const report = validateBlueprint(blueprint);
  const scenarioId = blueprint.scenario.id;
  const nodeChoiceIds = new Map<string, string[]>();

  for (const choice of blueprint.choices) {
    const current = nodeChoiceIds.get(choice.sourceNodeId) || [];
    current.push(choice.id);
    nodeChoiceIds.set(choice.sourceNodeId, current);
  }

  const game: Game = {
    ...blueprint.game,
    defaultScenarioId: blueprint.game.defaultScenarioId || scenarioId,
    createdAt,
    updatedAt: createdAt,
  };

  const contentPack: ContentPack = {
    ...blueprint.contentPack,
    scenarioIds: [scenarioId],
    createdAt,
    updatedAt: createdAt,
  };

  const scenario: Scenario = {
    ...blueprint.scenario,
    settings: blueprint.scenario.settings,
    nodeIds: blueprint.nodes.map((node) => node.id),
    choiceIds: blueprint.choices.map((choice) => choice.id),
    validationStatus: report.valid ? 'valid' : 'invalid',
    validationErrors: report.errors,
    createdAt,
    updatedAt: createdAt,
  };

  const nodes: Record<string, StoryNode> = {};
  for (const node of blueprint.nodes) {
    nodes[node.id] = {
      ...node,
      scenarioId,
      choiceIds: nodeChoiceIds.get(node.id) || [],
      status: node.isEnding ? 'ending' : 'ready-to-generate',
    };
  }

  const choices: Record<string, Choice> = {};
  for (const choice of blueprint.choices) {
    choices[choice.id] = {
      ...choice,
      scenarioId,
    };
  }

  return { game, contentPack, scenario, nodes, choices };
}

export function scenarioToBlueprint(db: VeoQuestDatabase, scenarioId: string): ScenarioBlueprint {
  const scenario = db.scenarios[scenarioId];
  if (!scenario) {
    throw new Error(`Scenario "${scenarioId}" does not exist.`);
  }
  const game = db.games[scenario.gameId];
  const contentPack = db.contentPacks[scenario.contentPackId];
  if (!game || !contentPack) {
    throw new Error(`Scenario "${scenarioId}" is missing its game or content pack.`);
  }

  const nodes = scenario.nodeIds.map((nodeId) => {
    const node = db.nodes[nodeId];
    return {
      id: node.id,
      title: node.title,
      description: node.description,
      prompt: node.prompt,
      position: node.position,
      choiceIds: node.choiceIds,
      isEnding: node.isEnding,
      isHidden: node.isHidden,
      generationType: node.generationType,
      publisherNotes: node.publisherNotes,
    };
  });
  const choices = scenario.choiceIds.map((choiceId) => {
    const choice = db.choices[choiceId];
    return {
      id: choice.id,
      sourceNodeId: choice.sourceNodeId,
      targetNodeId: choice.targetNodeId,
      label: choice.label,
      description: choice.description,
      displayOrder: choice.displayOrder,
      conditions: choice.conditions,
    };
  });
  const cost = estimateCostForNodes(nodes, scenario.settings);
  const generationPlan = {
    approved: false,
    clipCount: cost.clipCount,
    totalRuntimeSeconds: cost.totalRuntimeSeconds,
    extensionCount: cost.extensionCount,
    jobs: nodes
      .filter((node) => !node.isEnding)
      .map((node) => ({
        nodeId: node.id,
        requestType: node.generationType === 'extend' ? 'extendVideo' as const : 'createVideo' as const,
        durationSeconds: node.generationType === 'extend' ? scenario.settings.extensionDurationSeconds : scenario.settings.clipDurationSeconds,
        prompt: node.prompt,
      })),
  };

  const blueprint: ScenarioBlueprint = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    game: {
      id: game.id,
      title: game.title,
      description: game.description,
      coverAssetPath: game.coverAssetPath,
      status: game.status,
      defaultScenarioId: game.defaultScenarioId,
      metadata: game.metadata,
    },
    contentPack: {
      id: contentPack.id,
      gameId: contentPack.gameId,
      title: contentPack.title,
      description: contentPack.description,
      releaseType: contentPack.releaseType,
      accessType: contentPack.accessType,
      priceTier: contentPack.priceTier,
      status: contentPack.status,
      publishedAt: contentPack.publishedAt,
      scenarioIds: contentPack.scenarioIds,
    },
    scenario: {
      id: scenario.id,
      gameId: scenario.gameId,
      contentPackId: scenario.contentPackId,
      blueprintId: scenario.blueprintId,
      title: scenario.title,
      description: scenario.description,
      status: scenario.status,
      rootNodeId: scenario.rootNodeId,
      settings: scenario.settings,
      originalPromptId: scenario.originalPromptId,
    },
    nodes,
    choices,
    generationPlan,
    estimatedCost: cost,
    validationStatus: 'unknown',
    validationErrors: [],
    metadata: {
      publisherNotes: 'Exported from the visual builder.',
      styleGuidance: scenario.settings.styleGuidance,
      generatedBy: 'veoquest-builder',
      sourcePromptId: scenario.originalPromptId,
    },
  };

  const report = validateBlueprint(blueprint);
  return {
    ...blueprint,
    estimatedCost: report.estimatedCost,
    validationStatus: report.valid ? 'valid' : 'invalid',
    validationErrors: report.errors,
  };
}

function makePrompt(input: PromptBlueprintInput, beat: string): string {
  const tone = input.tone || 'cinematic';
  const genre = input.genre || 'adventure';
  const audience = input.audience || 'general audience';
  return `${tone} ${genre} scene for ${audience}: ${beat}. Story seed: ${input.prompt}. Constraints: ${input.constraints || 'keep action clear and choices readable'}.`;
}

export function createOriginalPrompt(input: PromptBlueprintInput, scenarioId?: string, createdAt = nowIso()): OriginalPrompt {
  return {
    id: createId('prompt', `${scenarioId || input.title || input.prompt}:${createdAt}`),
    scenarioId,
    prompt: input.prompt,
    genre: input.genre,
    audience: input.audience,
    tone: input.tone,
    branchDepth: input.branchDepth,
    decisionPoints: input.decisionPoints,
    endings: input.endings,
    targetRuntimeMinutes: input.targetRuntimeMinutes,
    contentRating: input.contentRating,
    constraints: input.constraints,
    createdAt,
    updatedAt: createdAt,
  };
}

export function generateBlueprintFromPrompt(input: PromptBlueprintInput, overrides: {
  gameId?: string;
  contentPackId?: string;
  scenarioId?: string;
  accessType?: ContentPack['accessType'];
  status?: Scenario['status'];
  createdAt?: string;
} = {}): ScenarioBlueprint {
  const createdAt = overrides.createdAt || nowIso();
  const baseTitle = input.title?.trim() || input.prompt.trim().split(/[.!?]/)[0].slice(0, 48) || 'Untitled Quest';
  const baseSlug = slugify(baseTitle);
  const scenarioId = overrides.scenarioId || createId('scenario', baseTitle);
  const gameId = overrides.gameId || createId('game', baseTitle);
  const contentPackId = overrides.contentPackId || createId('pack', `${baseTitle}:base`);
  const promptId = createId('prompt', `${scenarioId}:${input.prompt}`);
  const settings: ScenarioSettings = {
    ...DEFAULT_SCENARIO_SETTINGS,
    branchDepthLimit: Math.max(3, input.branchDepth + 2),
    clipCountLimit: Math.max(12, input.decisionPoints * 4 + input.endings),
    styleGuidance: `${input.tone || 'Cinematic'} ${input.genre || 'branching story'} with ${input.contentRating || 'PG'} content boundaries.`,
  };

  const node = (suffix: string) => `${baseSlug}-${suffix}`;
  const nodes: ScenarioBlueprint['nodes'] = [
    {
      id: node('opening'),
      title: 'Opening Decision',
      description: 'The story establishes the central pressure and asks the viewer to choose the first approach.',
      prompt: makePrompt(input, 'open on the hero facing a clear fork in the mission with two visually distinct paths'),
      position: { x: 120, y: 80 },
      isEnding: false,
      generationType: 'create',
      publisherNotes: 'Root scene',
    },
    {
      id: node('direct-route'),
      title: 'Direct Route',
      description: 'A bold path raises the stakes quickly.',
      prompt: makePrompt(input, 'continue from the opening along the bold direct route as tension rises'),
      position: { x: 40, y: 270 },
      isEnding: false,
      generationType: 'extend',
    },
    {
      id: node('careful-route'),
      title: 'Careful Route',
      description: 'A slower path reveals hidden context.',
      prompt: makePrompt(input, 'continue from the opening with a careful investigative route that reveals a hidden clue'),
      position: { x: 360, y: 270 },
      isEnding: false,
      generationType: 'extend',
    },
    {
      id: node('risk-choice'),
      title: 'Risk Choice',
      description: 'The direct route forces a second decision.',
      prompt: makePrompt(input, 'the direct route reaches a dangerous moment where speed and safety conflict'),
      position: { x: 20, y: 470 },
      isEnding: false,
      generationType: 'extend',
    },
    {
      id: node('truth-choice'),
      title: 'Truth Choice',
      description: 'The careful route forces a second decision.',
      prompt: makePrompt(input, 'the careful route reveals two interpretations of the clue and asks what truth to pursue'),
      position: { x: 370, y: 470 },
      isEnding: false,
      generationType: 'extend',
    },
    {
      id: node('heroic-ending'),
      title: 'Heroic Ending',
      description: 'The viewer wins through decisive action.',
      prompt: makePrompt(input, 'resolve with a triumphant ending earned by decisive action and a strong final image'),
      position: { x: -80, y: 690 },
      isEnding: true,
      generationType: 'extend',
    },
    {
      id: node('costly-ending'),
      title: 'Costly Ending',
      description: 'The viewer succeeds but loses something important.',
      prompt: makePrompt(input, 'resolve with a bittersweet ending where success carries a visible cost'),
      position: { x: 180, y: 690 },
      isEnding: true,
      generationType: 'extend',
    },
    {
      id: node('secret-ending'),
      title: 'Secret Ending',
      description: 'The viewer discovers a hidden truth.',
      prompt: makePrompt(input, 'resolve with a quiet secret ending that reframes the whole story'),
      position: { x: 440, y: 690 },
      isEnding: true,
      generationType: 'extend',
    },
  ];

  const choices: ScenarioBlueprint['choices'] = [
    {
      id: createId('choice', `${scenarioId}:opening:direct`),
      sourceNodeId: node('opening'),
      targetNodeId: node('direct-route'),
      label: 'Take the direct route',
      description: 'Move fast and force the issue.',
      displayOrder: 0,
    },
    {
      id: createId('choice', `${scenarioId}:opening:careful`),
      sourceNodeId: node('opening'),
      targetNodeId: node('careful-route'),
      label: 'Study the hidden path',
      description: 'Slow down and gather context.',
      displayOrder: 1,
    },
    {
      id: createId('choice', `${scenarioId}:direct:push`),
      sourceNodeId: node('direct-route'),
      targetNodeId: node('risk-choice'),
      label: 'Push through the danger',
      description: 'Accept the risk to keep momentum.',
      displayOrder: 0,
    },
    {
      id: createId('choice', `${scenarioId}:direct:secure`),
      sourceNodeId: node('direct-route'),
      targetNodeId: node('costly-ending'),
      label: 'Secure the fallback',
      description: 'Protect the team before moving on.',
      displayOrder: 1,
    },
    {
      id: createId('choice', `${scenarioId}:careful:trust`),
      sourceNodeId: node('careful-route'),
      targetNodeId: node('truth-choice'),
      label: 'Trust the clue',
      description: 'Follow the clue even though it is uncertain.',
      displayOrder: 0,
    },
    {
      id: createId('choice', `${scenarioId}:careful:return`),
      sourceNodeId: node('careful-route'),
      targetNodeId: node('secret-ending'),
      label: 'Turn back with proof',
      description: 'Preserve the evidence and reveal the truth later.',
      displayOrder: 1,
    },
    {
      id: createId('choice', `${scenarioId}:risk:heroic`),
      sourceNodeId: node('risk-choice'),
      targetNodeId: node('heroic-ending'),
      label: 'Commit to the rescue',
      description: 'Spend everything on the save.',
      displayOrder: 0,
    },
    {
      id: createId('choice', `${scenarioId}:risk:costly`),
      sourceNodeId: node('risk-choice'),
      targetNodeId: node('costly-ending'),
      label: 'Cut losses and escape',
      description: 'Survive, but leave questions behind.',
      displayOrder: 1,
    },
    {
      id: createId('choice', `${scenarioId}:truth:secret`),
      sourceNodeId: node('truth-choice'),
      targetNodeId: node('secret-ending'),
      label: 'Reveal the secret',
      description: 'Expose the hidden truth.',
      displayOrder: 0,
    },
    {
      id: createId('choice', `${scenarioId}:truth:heroic`),
      sourceNodeId: node('truth-choice'),
      targetNodeId: node('heroic-ending'),
      label: 'Protect everyone first',
      description: 'Delay the truth to save lives.',
      displayOrder: 1,
    },
  ];

  const cost = estimateCostForNodes(nodes, settings);
  const blueprint: ScenarioBlueprint = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    game: {
      id: gameId,
      title: baseTitle,
      description: `${baseTitle} is a publisher-authored interactive video story.`,
      status: 'published',
      defaultScenarioId: scenarioId,
      metadata: {
        genre: input.genre || 'adventure',
        contentRating: input.contentRating || 'PG',
      },
    },
    contentPack: {
      id: contentPackId,
      gameId,
      title: overrides.accessType === 'paid' || overrides.accessType === 'locked' ? `${baseTitle} Expansion` : `${baseTitle} Base Story`,
      description: overrides.accessType === 'paid' || overrides.accessType === 'locked'
        ? 'A locked story release used to prove entitlement boundaries.'
        : 'A free base release included in the prototype catalog.',
      releaseType: overrides.accessType === 'paid' || overrides.accessType === 'locked' ? 'expansion_storyline' : 'base_game',
      accessType: overrides.accessType || 'free',
      priceTier: overrides.accessType === 'paid' || overrides.accessType === 'locked' ? 'standard' : 'free',
      status: 'published',
      publishedAt: createdAt,
      scenarioIds: [scenarioId],
    },
    scenario: {
      id: scenarioId,
      gameId,
      contentPackId,
      blueprintId: createId('blueprint', scenarioId),
      title: baseTitle,
      description: input.prompt,
      status: overrides.status || 'published',
      rootNodeId: node('opening'),
      settings,
      originalPromptId: promptId,
    },
    nodes,
    choices,
    generationPlan: {
      approved: false,
      clipCount: cost.clipCount,
      totalRuntimeSeconds: cost.totalRuntimeSeconds,
      extensionCount: cost.extensionCount,
      jobs: nodes
        .filter((storyNode) => !storyNode.isEnding)
        .map((storyNode) => ({
          nodeId: storyNode.id,
          requestType: storyNode.generationType === 'extend' ? 'extendVideo' : 'createVideo',
          durationSeconds: storyNode.generationType === 'extend' ? settings.extensionDurationSeconds : settings.clipDurationSeconds,
          prompt: storyNode.prompt,
        })),
    },
    estimatedCost: cost,
    validationStatus: 'unknown',
    validationErrors: [],
    metadata: {
      publisherNotes: 'Generated from a single prompt and safe to edit before generation.',
      styleGuidance: settings.styleGuidance,
      generatedBy: 'veoquest-local-prompt-generator',
      sourcePromptId: promptId,
    },
  };

  const report = validateBlueprint(blueprint);
  return {
    ...blueprint,
    estimatedCost: report.estimatedCost,
    validationStatus: report.valid ? 'valid' : 'invalid',
    validationErrors: report.errors,
  };
}

export function getChoicesForNode(db: VeoQuestDatabase, nodeId: string): Choice[] {
  const node = db.nodes[nodeId];
  if (!node) return [];
  return node.choiceIds
    .map((choiceId) => db.choices[choiceId])
    .filter(Boolean)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export function getScenarioNodes(db: VeoQuestDatabase, scenarioId: string): StoryNode[] {
  const scenario = db.scenarios[scenarioId];
  if (!scenario) return [];
  return scenario.nodeIds.map((nodeId) => db.nodes[nodeId]).filter(Boolean);
}

export function getScenarioChoices(db: VeoQuestDatabase, scenarioId: string): Choice[] {
  const scenario = db.scenarios[scenarioId];
  if (!scenario) return [];
  return scenario.choiceIds.map((choiceId) => db.choices[choiceId]).filter(Boolean);
}

export function hasActiveEntitlement(db: VeoQuestDatabase, params: { userId?: string; contentPackId?: string; scenarioId?: string; gameId?: string }): boolean {
  const userId = params.userId || DEMO_USER_ID;
  const now = Date.now();
  return Object.values(db.entitlements).some((entitlement) => {
    if (entitlement.userId !== userId || entitlement.status !== 'active') return false;
    if (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() <= now) return false;
    if (params.contentPackId && entitlement.contentPackId === params.contentPackId) return true;
    if (params.scenarioId && entitlement.scenarioId === params.scenarioId) return true;
    if (params.gameId && entitlement.gameId === params.gameId) return true;
    return false;
  });
}

export function getScenarioAccess(
  db: VeoQuestDatabase,
  scenarioId: string,
  options: { userId?: string; publisherPreview?: boolean } = {}
): AccessResult {
  const scenario = db.scenarios[scenarioId];
  if (!scenario) return { playable: false, reason: 'missing', label: 'Missing' };
  if (options.publisherPreview) {
    return { playable: true, reason: 'publisher_preview', label: 'Publisher preview' };
  }
  if (scenario.status !== 'published') {
    return { playable: false, reason: 'draft', label: 'Draft' };
  }

  const pack = db.contentPacks[scenario.contentPackId];
  if (!pack) return { playable: false, reason: 'missing', label: 'Missing pack' };
  if (pack.accessType === 'free' || pack.accessType === 'included' || pack.accessType === 'purchased') {
    return { playable: true, reason: pack.accessType, label: pack.accessType === 'free' ? 'Free' : 'Included' };
  }

  if (hasActiveEntitlement(db, {
    userId: options.userId,
    contentPackId: pack.id,
    scenarioId,
    gameId: scenario.gameId,
  })) {
    return { playable: true, reason: 'purchased', label: 'Unlocked' };
  }

  return { playable: false, reason: 'locked', label: 'Requires access' };
}

export function grantContentPackEntitlement(db: VeoQuestDatabase, contentPackId: string, userId = DEMO_USER_ID): VeoQuestDatabase {
  const next = cloneDatabase(db);
  const pack = next.contentPacks[contentPackId];
  if (!pack) return next;
  const grantedAt = nowIso();
  const entitlement: Entitlement = {
    id: createId('entitlement', `${userId}:${contentPackId}`),
    userId,
    gameId: pack.gameId,
    contentPackId,
    source: 'local_unlock',
    status: 'active',
    grantedAt,
  };
  next.entitlements[entitlement.id] = entitlement;
  next.updatedAt = grantedAt;
  return next;
}

export function createPlaythrough(db: VeoQuestDatabase, scenarioId: string, createdAt = nowIso()): {
  db: VeoQuestDatabase;
  playthrough: Playthrough;
} {
  const scenario = db.scenarios[scenarioId];
  if (!scenario) {
    throw new Error(`Scenario "${scenarioId}" does not exist.`);
  }

  const next = cloneDatabase(db);
  const playthrough: Playthrough = {
    id: createId('playthrough', `${scenarioId}:${createdAt}`),
    scenarioId,
    startedAt: createdAt,
    currentNodeId: scenario.rootNodeId,
    visitedNodeIds: [scenario.rootNodeId],
    choiceIds: [],
    status: 'in_progress',
    createdAt,
    updatedAt: createdAt,
  };

  const event: PlaythroughEvent = {
    id: createId('event', `${playthrough.id}:start`),
    playthroughId: playthrough.id,
    scenarioId,
    nodeId: scenario.rootNodeId,
    eventType: 'start',
    createdAt,
    metadata: {},
  };

  next.playthroughs[playthrough.id] = playthrough;
  next.playthroughEvents[event.id] = event;
  next.updatedAt = createdAt;
  return { db: next, playthrough };
}

export function getLatestPlaythrough(db: VeoQuestDatabase, scenarioId: string): Playthrough | null {
  const matches = Object.values(db.playthroughs)
    .filter((playthrough) => playthrough.scenarioId === scenarioId)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  return matches[0] || null;
}

export function selectChoice(db: VeoQuestDatabase, playthroughId: string, choiceId: string, createdAt = nowIso()): {
  db: VeoQuestDatabase;
  playthrough: Playthrough;
} {
  const next = cloneDatabase(db);
  const playthrough = next.playthroughs[playthroughId];
  const choice = next.choices[choiceId];
  if (!playthrough || !choice) {
    throw new Error('Playthrough or choice not found.');
  }

  const targetNode = next.nodes[choice.targetNodeId];
  if (!targetNode) {
    throw new Error(`Choice target "${choice.targetNodeId}" does not exist.`);
  }

  playthrough.choiceIds.push(choice.id);
  playthrough.currentNodeId = targetNode.id;
  playthrough.visitedNodeIds.push(targetNode.id);
  playthrough.updatedAt = createdAt;
  if (targetNode.isEnding) {
    playthrough.status = 'completed';
    playthrough.completedAt = createdAt;
  }

  const event: PlaythroughEvent = {
    id: createId('event', `${playthrough.id}:${choice.id}:${createdAt}`),
    playthroughId,
    scenarioId: playthrough.scenarioId,
    nodeId: choice.sourceNodeId,
    choiceId: choice.id,
    eventType: 'choice_selected',
    createdAt,
    metadata: {
      label: choice.label,
      targetNodeId: choice.targetNodeId,
    },
  };
  next.playthroughEvents[event.id] = event;

  if (targetNode.isEnding) {
    const completedEvent: PlaythroughEvent = {
      id: createId('event', `${playthrough.id}:completed:${createdAt}`),
      playthroughId,
      scenarioId: playthrough.scenarioId,
      nodeId: targetNode.id,
      eventType: 'completed',
      createdAt,
      metadata: {},
    };
    next.playthroughEvents[completedEvent.id] = completedEvent;
  }

  next.updatedAt = createdAt;
  return { db: next, playthrough };
}

export function restartPlaythrough(db: VeoQuestDatabase, playthroughId: string, createdAt = nowIso()): {
  db: VeoQuestDatabase;
  playthrough: Playthrough;
} {
  const next = cloneDatabase(db);
  const playthrough = next.playthroughs[playthroughId];
  if (!playthrough) {
    throw new Error(`Playthrough "${playthroughId}" does not exist.`);
  }
  const scenario = next.scenarios[playthrough.scenarioId];
  playthrough.currentNodeId = scenario.rootNodeId;
  playthrough.visitedNodeIds = [scenario.rootNodeId];
  playthrough.choiceIds = [];
  playthrough.status = 'in_progress';
  playthrough.completedAt = undefined;
  playthrough.updatedAt = createdAt;

  const event: PlaythroughEvent = {
    id: createId('event', `${playthrough.id}:restart:${createdAt}`),
    playthroughId,
    scenarioId: playthrough.scenarioId,
    nodeId: scenario.rootNodeId,
    eventType: 'restart',
    createdAt,
    metadata: {},
  };
  next.playthroughEvents[event.id] = event;
  next.updatedAt = createdAt;
  return { db: next, playthrough };
}

export function buildPathSummary(db: VeoQuestDatabase, playthrough: Playthrough): string[] {
  return playthrough.visitedNodeIds
    .map((nodeId) => db.nodes[nodeId]?.title || nodeId)
    .filter(Boolean);
}

export function updateScenarioValidation(db: VeoQuestDatabase, scenarioId: string, requireClips = false): VeoQuestDatabase {
  const next = cloneDatabase(db);
  const report = validateScenarioGraph(next, scenarioId, { requireClips });
  const scenario = next.scenarios[scenarioId];
  if (scenario) {
    scenario.validationStatus = report.valid ? 'valid' : 'invalid';
    scenario.validationErrors = report.errors;
    scenario.updatedAt = nowIso();
    next.updatedAt = scenario.updatedAt;
  }
  return next;
}

export function applyBlueprintToDatabase(db: VeoQuestDatabase, blueprint: ScenarioBlueprint, createdAt = nowIso()): VeoQuestDatabase {
  const report = validateBlueprint(blueprint);
  if (!report.valid) {
    throw new Error(report.errors[0]?.message || 'Blueprint is invalid.');
  }

  const next = cloneDatabase(db);
  const blueprintId = blueprint.scenario.blueprintId || createId('blueprint', blueprint.scenario.id);
  const stampedBlueprint: ScenarioBlueprint = {
    ...blueprint,
    scenario: {
      ...blueprint.scenario,
      blueprintId,
    },
    estimatedCost: report.estimatedCost,
    validationStatus: 'valid',
    validationErrors: [],
  };
  const entities = blueprintToEntities(stampedBlueprint, createdAt);

  next.games[entities.game.id] = {
    ...entities.game,
    updatedAt: createdAt,
  };
  next.contentPacks[entities.contentPack.id] = {
    ...entities.contentPack,
    updatedAt: createdAt,
  };
  next.scenarioBlueprints[blueprintId] = stampedBlueprint;
  next.blueprintValidationResults[blueprintId] = report;
  next.scenarios[entities.scenario.id] = {
    ...entities.scenario,
    blueprintId,
    updatedAt: createdAt,
  };

  for (const node of Object.values(entities.nodes)) {
    next.nodes[node.id] = node;
  }
  for (const choice of Object.values(entities.choices)) {
    next.choices[choice.id] = choice;
  }

  const promptId = blueprint.scenario.originalPromptId || blueprint.metadata.sourcePromptId;
  if (promptId && !next.originalPrompts[promptId]) {
    next.originalPrompts[promptId] = {
      id: promptId,
      scenarioId: entities.scenario.id,
      prompt: entities.scenario.description,
      branchDepth: entities.scenario.settings.branchDepthLimit,
      decisionPoints: Math.max(1, entities.scenario.choiceIds.length),
      endings: Object.values(entities.nodes).filter((node) => node.isEnding).length,
      targetRuntimeMinutes: Math.ceil(report.estimatedCost.totalRuntimeSeconds / 60),
      contentRating: String(entities.game.metadata.contentRating || 'PG'),
      constraints: String(blueprint.metadata.styleGuidance || ''),
      createdAt,
      updatedAt: createdAt,
    };
  }

  next.updatedAt = createdAt;
  return next;
}

export function makeClipForNode(db: VeoQuestDatabase, node: StoryNode, overrides: Partial<Clip> = {}): Clip {
  const scenario = db.scenarios[node.scenarioId];
  const sourceClipId = getIncomingClipId(db, node.id);
  const durationSeconds = node.generationType === 'extend'
    ? scenario.settings.extensionDurationSeconds
    : scenario.settings.clipDurationSeconds;
  const seed = stableHash(`${node.id}:${node.prompt}`);
  const palette = paletteForSeed(seed);

  return {
    id: overrides.id || createId('clip', node.id),
    scenarioId: node.scenarioId,
    nodeId: node.id,
    source: overrides.source || 'fake-veo-3.1',
    generationType: node.generationType,
    prompt: node.prompt,
    durationSeconds,
    assetPath: `fake-veo31://${node.id}`,
    status: 'ready',
    createdAt: overrides.createdAt || nowIso(),
    metadata: {
      seed,
      aspectRatio: scenario.settings.aspectRatio,
      palette,
      continuationOfClipId: sourceClipId,
      label: node.title,
      ...overrides.metadata,
    },
    ...overrides,
  };
}

export function getIncomingClipId(db: VeoQuestDatabase, nodeId: string): string | undefined {
  const node = db.nodes[nodeId];
  if (!node) return undefined;
  const scenario = db.scenarios[node.scenarioId];
  if (!scenario) return undefined;
  const incomingChoice = scenario.choiceIds
    .map((choiceId) => db.choices[choiceId])
    .find((choice) => choice?.targetNodeId === nodeId);
  if (!incomingChoice) return undefined;
  return db.nodes[incomingChoice.sourceNodeId]?.clipId;
}

export function paletteForSeed(seed: number): [string, string] {
  const palettes: Array<[string, string]> = [
    ['#0f172a', '#2dd4bf'],
    ['#111827', '#f97316'],
    ['#1f2937', '#a3e635'],
    ['#1e1b4b', '#facc15'],
    ['#172554', '#fb7185'],
    ['#18181b', '#38bdf8'],
    ['#312e81', '#34d399'],
  ];
  return palettes[seed % palettes.length];
}

export function attachClipToNode(db: VeoQuestDatabase, clip: Clip): VeoQuestDatabase {
  const next = cloneDatabase(db);
  next.clips[clip.id] = clip;
  const node = next.nodes[clip.nodeId];
  if (node) {
    node.clipId = clip.id;
    node.status = 'generated';
  }
  next.updatedAt = nowIso();
  return next;
}
