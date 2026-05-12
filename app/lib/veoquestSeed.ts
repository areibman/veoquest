import {
  DATABASE_SCHEMA_VERSION,
  DEMO_USER_ID,
  ScenarioBlueprint,
  VeoQuestDatabase,
} from './veoquestModels';
import {
  applyBlueprintToDatabase,
  attachClipToNode,
  createOriginalPrompt,
  generateBlueprintFromPrompt,
  makeClipForNode,
  nowIso,
  validateBlueprint,
} from './veoquestCore';

function emptyDatabase(updatedAt: string): VeoQuestDatabase {
  return {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    updatedAt,
    games: {},
    contentPacks: {},
    entitlements: {},
    scenarioBlueprints: {},
    blueprintValidationResults: {},
    scenarios: {},
    nodes: {},
    choices: {},
    clips: {},
    generationJobs: {},
    playthroughs: {},
    playthroughEvents: {},
    originalPrompts: {},
  };
}

function stampPrompt(db: VeoQuestDatabase, blueprint: ScenarioBlueprint, prompt: Parameters<typeof createOriginalPrompt>[0], createdAt: string): VeoQuestDatabase {
  const promptRecord = createOriginalPrompt(prompt, blueprint.scenario.id, createdAt);
  promptRecord.id = blueprint.scenario.originalPromptId || promptRecord.id;
  db.originalPrompts[promptRecord.id] = promptRecord;
  return db;
}

function materializeBlueprint(db: VeoQuestDatabase, blueprint: ScenarioBlueprint, createdAt: string): VeoQuestDatabase {
  let next = applyBlueprintToDatabase(db, blueprint, createdAt);
  const scenario = next.scenarios[blueprint.scenario.id];

  for (const nodeId of scenario.nodeIds) {
    const node = next.nodes[nodeId];
    if (!node || node.isEnding) continue;
    const clip = makeClipForNode(next, node, {
      source: 'seed-dummy',
      createdAt,
    });
    next = attachClipToNode(next, clip);
  }

  return next;
}

export function createDemoDatabase(createdAt = nowIso()): VeoQuestDatabase {
  let db = emptyDatabase(createdAt);

  const spacePrompt = {
    title: 'Space Rescue Mission',
    prompt: 'A rescue pilot boards a damaged research station before its orbit collapses, deciding who to save and what evidence to recover.',
    genre: 'space rescue',
    audience: 'teen and adult viewers',
    tone: 'urgent and cinematic',
    branchDepth: 3,
    decisionPoints: 3,
    endings: 3,
    targetRuntimeMinutes: 5,
    contentRating: 'PG',
    constraints: 'No gore. Choices must be legible and emotionally distinct.',
  };
  const spaceBlueprint = generateBlueprintFromPrompt(spacePrompt, {
    gameId: 'game-stellar-frontier',
    contentPackId: 'pack-stellar-frontier-base',
    scenarioId: 'scenario-space-rescue',
    accessType: 'free',
    status: 'published',
    createdAt,
  });
  db = materializeBlueprint(db, spaceBlueprint, createdAt);
  db = stampPrompt(db, spaceBlueprint, spacePrompt, createdAt);

  const expansionPrompt = {
    title: 'Nebula Aftermath',
    prompt: 'After the station rescue, the pilot discovers a hidden nebula signal that opens a new paid continuation with dangerous political stakes.',
    genre: 'space mystery',
    audience: 'teen and adult viewers',
    tone: 'tense and mysterious',
    branchDepth: 3,
    decisionPoints: 3,
    endings: 3,
    targetRuntimeMinutes: 6,
    contentRating: 'PG',
    constraints: 'Keep payment copy generic and treat this as a locked expansion.',
  };
  const expansionBlueprint = generateBlueprintFromPrompt(expansionPrompt, {
    gameId: 'game-stellar-frontier',
    contentPackId: 'pack-stellar-frontier-nebula',
    scenarioId: 'scenario-nebula-aftermath',
    accessType: 'paid',
    status: 'published',
    createdAt,
  });
  db = materializeBlueprint(db, expansionBlueprint, createdAt);
  db = stampPrompt(db, expansionBlueprint, expansionPrompt, createdAt);
  db.games['game-stellar-frontier'].defaultScenarioId = 'scenario-space-rescue';
  db.games['game-stellar-frontier'].description = 'A publisher catalog title with a free base story and a locked expansion.';

  const museumPrompt = {
    title: 'Haunted Museum Exploration',
    prompt: 'A night curator investigates impossible sounds in a museum where exhibits rearrange themselves and every gallery suggests a different truth.',
    genre: 'haunted museum',
    audience: 'general viewers',
    tone: 'eerie but playful',
    branchDepth: 3,
    decisionPoints: 3,
    endings: 3,
    targetRuntimeMinutes: 5,
    contentRating: 'PG',
    constraints: 'Spooky but not graphic. Mobile choices should stay short.',
  };
  const museumBlueprint = generateBlueprintFromPrompt(museumPrompt, {
    gameId: 'game-midnight-museum',
    contentPackId: 'pack-midnight-museum-base',
    scenarioId: 'scenario-haunted-museum',
    accessType: 'free',
    status: 'published',
    createdAt,
  });
  db = materializeBlueprint(db, museumBlueprint, createdAt);
  db = stampPrompt(db, museumBlueprint, museumPrompt, createdAt);
  db.games['game-midnight-museum'].description = 'A second free story used for catalog and mobile player testing.';

  const invalidBlueprint = {
    ...spaceBlueprint,
    scenario: {
      ...spaceBlueprint.scenario,
      id: 'scenario-invalid-demo',
      title: 'Invalid Demo Blueprint',
      rootNodeId: 'missing-root',
    },
    metadata: {
      ...spaceBlueprint.metadata,
      publisherNotes: 'Fixture used by tests and the builder import flow to show repairable validation errors.',
    },
  };
  const invalidReport = validateBlueprint(invalidBlueprint);
  db.scenarioBlueprints['blueprint-invalid-demo'] = {
    ...invalidBlueprint,
    validationStatus: 'invalid',
    validationErrors: invalidReport.errors,
  };
  db.blueprintValidationResults['blueprint-invalid-demo'] = invalidReport;

  db.entitlements['entitlement-preview-note'] = {
    id: 'entitlement-preview-note',
    userId: DEMO_USER_ID,
    gameId: 'game-stellar-frontier',
    source: 'seed',
    status: 'revoked',
    grantedAt: createdAt,
  };

  db.updatedAt = createdAt;
  return db;
}
