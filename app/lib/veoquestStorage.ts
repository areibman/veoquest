'use client';

import {
  DATABASE_SCHEMA_VERSION,
  Scenario,
  StoryNode,
  Choice,
  VeoQuestDatabase,
} from './veoquestModels';
import {
  cloneDatabase,
  createId,
  DEFAULT_SCENARIO_SETTINGS,
  nowIso,
  slugify,
  updateScenarioValidation,
} from './veoquestCore';
import { createDemoDatabase } from './veoquestSeed';

export const VEOQUEST_STORAGE_KEY = 'veoquest_database_v1';

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeDatabase(db: VeoQuestDatabase): VeoQuestDatabase {
  if (!db || db.schemaVersion !== DATABASE_SCHEMA_VERSION) {
    return createDemoDatabase();
  }
  return db;
}

export function loadDatabase(): VeoQuestDatabase {
  if (!hasWindow()) {
    return createDemoDatabase();
  }

  const raw = window.localStorage.getItem(VEOQUEST_STORAGE_KEY);
  if (!raw) {
    const seeded = createDemoDatabase();
    saveDatabase(seeded);
    return seeded;
  }

  try {
    return normalizeDatabase(JSON.parse(raw) as VeoQuestDatabase);
  } catch {
    const seeded = createDemoDatabase();
    saveDatabase(seeded);
    return seeded;
  }
}

export function saveDatabase(db: VeoQuestDatabase): void {
  if (!hasWindow()) return;
  const next = {
    ...db,
    updatedAt: nowIso(),
  };
  window.localStorage.setItem(VEOQUEST_STORAGE_KEY, JSON.stringify(next));
}

export function resetDemoDatabase(): VeoQuestDatabase {
  const seeded = createDemoDatabase();
  saveDatabase(seeded);
  return seeded;
}

export function commitDatabase(db: VeoQuestDatabase): VeoQuestDatabase {
  const next = cloneDatabase(db);
  next.updatedAt = nowIso();
  saveDatabase(next);
  return next;
}

export function createEmptyScenarioDraft(db: VeoQuestDatabase): {
  db: VeoQuestDatabase;
  scenarioId: string;
} {
  const next = cloneDatabase(db);
  const createdAt = nowIso();
  const game = Object.values(next.games)[0] || {
    id: 'game-publisher-sandbox',
    title: 'Publisher Sandbox',
    description: 'Draft workspace for internal story authoring.',
    status: 'draft' as const,
    defaultScenarioId: '',
    metadata: {},
    createdAt,
    updatedAt: createdAt,
  };
  next.games[game.id] = game;

  const packId = 'pack-publisher-sandbox-drafts';
  if (!next.contentPacks[packId]) {
    next.contentPacks[packId] = {
      id: packId,
      gameId: game.id,
      title: 'Publisher Drafts',
      description: 'Internal QA drafts that are not visible as published content.',
      releaseType: 'chapter',
      accessType: 'included',
      priceTier: 'free',
      status: 'draft',
      scenarioIds: [],
      createdAt,
      updatedAt: createdAt,
    };
  }

  const scenarioId = createId('scenario', `draft-${createdAt}`);
  const rootNodeId = `${slugify(scenarioId)}-opening`;
  const scenario: Scenario = {
    id: scenarioId,
    gameId: game.id,
    contentPackId: packId,
    title: 'Untitled Branching Story',
    description: 'Draft scenario',
    status: 'draft',
    rootNodeId,
    settings: DEFAULT_SCENARIO_SETTINGS,
    nodeIds: [rootNodeId],
    choiceIds: [],
    validationStatus: 'invalid',
    validationErrors: [],
    createdAt,
    updatedAt: createdAt,
  };
  const rootNode: StoryNode = {
    id: rootNodeId,
    scenarioId,
    title: 'Opening Scene',
    description: '',
    prompt: '',
    position: { x: 140, y: 120 },
    choiceIds: [],
    isEnding: false,
    generationType: 'create',
    status: 'no-prompt',
  };

  next.scenarios[scenarioId] = scenario;
  next.nodes[rootNodeId] = rootNode;
  next.contentPacks[packId].scenarioIds.push(scenarioId);
  if (!next.games[game.id].defaultScenarioId) {
    next.games[game.id].defaultScenarioId = scenarioId;
  }

  const validated = updateScenarioValidation(next, scenarioId);
  saveDatabase(validated);
  return { db: validated, scenarioId };
}

export function saveScenarioEntities(db: VeoQuestDatabase, scenario: Scenario, nodes: StoryNode[], choices: Choice[]): VeoQuestDatabase {
  const next = cloneDatabase(db);
  const updatedAt = nowIso();
  const nodeIds = nodes.map((node) => node.id);
  const choiceIds = choices.map((choice) => choice.id);

  next.scenarios[scenario.id] = {
    ...scenario,
    nodeIds,
    choiceIds,
    updatedAt,
  };
  for (const node of nodes) {
    next.nodes[node.id] = {
      ...node,
      choiceIds: choices
        .filter((choice) => choice.sourceNodeId === node.id)
        .map((choice) => choice.id),
    };
  }
  for (const choice of choices) {
    next.choices[choice.id] = choice;
  }

  const validated = updateScenarioValidation(next, scenario.id);
  saveDatabase(validated);
  return validated;
}
