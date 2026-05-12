export const BLUEPRINT_SCHEMA_VERSION = 'veoquest.blueprint.v1' as const;
export const DATABASE_SCHEMA_VERSION = 1 as const;
export const DEMO_USER_ID = 'local-demo-viewer' as const;

export type ReleaseStatus = 'draft' | 'qa' | 'published' | 'archived';
export type AccessType = 'free' | 'included' | 'locked' | 'paid' | 'purchased';
export type EntitlementStatus = 'active' | 'revoked' | 'expired';
export type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ClipStatus = 'missing' | 'queued' | 'generating' | 'ready' | 'failed';
export type NodeGenerationStatus =
  | 'no-prompt'
  | 'ready-to-generate'
  | 'generating'
  | 'generated'
  | 'invalid'
  | 'ending';

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Game extends Timestamped {
  id: string;
  title: string;
  description: string;
  coverAssetPath?: string;
  status: ReleaseStatus;
  defaultScenarioId: string;
  metadata: Record<string, unknown>;
}

export interface ContentPack extends Timestamped {
  id: string;
  gameId: string;
  title: string;
  description: string;
  releaseType: 'base_game' | 'chapter' | 'expansion_storyline' | 'bonus_branch_pack' | 'alternate_ending_pack' | 'seasonal_story';
  accessType: AccessType;
  priceTier: 'free' | 'standard' | 'premium';
  status: ReleaseStatus;
  scenarioIds: string[];
  publishedAt?: string;
}

export interface Entitlement {
  id: string;
  userId: string;
  gameId?: string;
  contentPackId?: string;
  scenarioId?: string;
  source: 'seed' | 'local_unlock' | 'publisher_preview' | 'promotion';
  status: EntitlementStatus;
  grantedAt: string;
  expiresAt?: string;
}

export interface ScenarioSettings {
  aspectRatio: '16:9' | '9:16';
  clipDurationSeconds: number;
  extensionDurationSeconds: number;
  clipCountLimit: number;
  branchDepthLimit: number;
  costPerClipCents: number;
  styleGuidance?: string;
}

export interface Scenario extends Timestamped {
  id: string;
  gameId: string;
  contentPackId: string;
  blueprintId?: string;
  title: string;
  description: string;
  status: ReleaseStatus;
  rootNodeId: string;
  settings: ScenarioSettings;
  nodeIds: string[];
  choiceIds: string[];
  originalPromptId?: string;
  validationStatus: 'unknown' | 'valid' | 'invalid';
  validationErrors: ValidationIssue[];
}

export interface StoryNode {
  id: string;
  scenarioId: string;
  title: string;
  description: string;
  prompt: string;
  clipId?: string;
  position: {
    x: number;
    y: number;
  };
  choiceIds: string[];
  isEnding: boolean;
  isHidden?: boolean;
  generationType: 'create' | 'extend';
  status: NodeGenerationStatus;
  publisherNotes?: string;
}

export interface Choice {
  id: string;
  scenarioId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  description: string;
  displayOrder: number;
  conditions?: {
    entitlementId?: string;
    hiddenUntilPublished?: boolean;
  };
}

export interface Clip {
  id: string;
  scenarioId: string;
  nodeId: string;
  source: 'seed-dummy' | 'fake-veo-3.1';
  generationType: 'create' | 'extend';
  prompt: string;
  durationSeconds: number;
  assetPath: string;
  status: ClipStatus;
  createdAt: string;
  metadata: {
    seed: number;
    aspectRatio: '16:9' | '9:16';
    palette: [string, string];
    continuationOfClipId?: string;
    label?: string;
  };
}

export interface GenerationJob {
  id: string;
  scenarioId: string;
  nodeId: string;
  requestType: 'createVideo' | 'extendVideo';
  sourceClipId?: string;
  targetNodeId?: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16';
  seed: number;
  status: GenerationJobStatus;
  progress: number;
  clipId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface Playthrough extends Timestamped {
  id: string;
  scenarioId: string;
  startedAt: string;
  completedAt?: string;
  currentNodeId: string;
  visitedNodeIds: string[];
  choiceIds: string[];
  status: 'in_progress' | 'completed' | 'abandoned';
}

export interface PlaythroughEvent {
  id: string;
  playthroughId: string;
  scenarioId: string;
  nodeId: string;
  choiceId?: string;
  eventType: 'start' | 'clip_started' | 'choice_selected' | 'node_entered' | 'completed' | 'restart';
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface OriginalPrompt extends Timestamped {
  id: string;
  scenarioId?: string;
  prompt: string;
  genre?: string;
  audience?: string;
  tone?: string;
  branchDepth: number;
  decisionPoints: number;
  endings: number;
  targetRuntimeMinutes: number;
  contentRating: string;
  constraints: string;
}

export interface CostEstimate {
  clipCount: number;
  extensionCount: number;
  totalRuntimeSeconds: number;
  generationJobs: number;
  estimatedCostCents: number;
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  estimatedCost: CostEstimate;
}

export interface ScenarioBlueprint {
  schemaVersion: typeof BLUEPRINT_SCHEMA_VERSION;
  game: Omit<Game, 'createdAt' | 'updatedAt' | 'defaultScenarioId'> & {
    defaultScenarioId?: string;
  };
  contentPack: Omit<ContentPack, 'createdAt' | 'updatedAt' | 'scenarioIds'> & {
    scenarioIds?: string[];
  };
  scenario: Omit<Scenario, 'createdAt' | 'updatedAt' | 'settings' | 'nodeIds' | 'choiceIds' | 'validationErrors' | 'validationStatus'> & {
    settings: ScenarioSettings;
  };
  nodes: Array<Omit<StoryNode, 'scenarioId' | 'choiceIds' | 'clipId' | 'status'> & {
    choiceIds?: string[];
  }>;
  choices: Array<Omit<Choice, 'scenarioId'>>;
  generationPlan: {
    approved: boolean;
    approvedAt?: string;
    clipCount: number;
    totalRuntimeSeconds: number;
    extensionCount: number;
    jobs: Array<{
      nodeId: string;
      requestType: 'createVideo' | 'extendVideo';
      durationSeconds: number;
      prompt: string;
    }>;
  };
  estimatedCost: CostEstimate;
  validationStatus: 'unknown' | 'valid' | 'invalid';
  validationErrors: ValidationIssue[];
  metadata: {
    publisherNotes?: string;
    styleGuidance?: string;
    generatedBy?: string;
    sourcePromptId?: string;
    hiddenNodeIds?: string[];
    [key: string]: unknown;
  };
}

export interface VeoQuestDatabase {
  schemaVersion: typeof DATABASE_SCHEMA_VERSION;
  updatedAt: string;
  games: Record<string, Game>;
  contentPacks: Record<string, ContentPack>;
  entitlements: Record<string, Entitlement>;
  scenarioBlueprints: Record<string, ScenarioBlueprint>;
  blueprintValidationResults: Record<string, ValidationReport>;
  scenarios: Record<string, Scenario>;
  nodes: Record<string, StoryNode>;
  choices: Record<string, Choice>;
  clips: Record<string, Clip>;
  generationJobs: Record<string, GenerationJob>;
  playthroughs: Record<string, Playthrough>;
  playthroughEvents: Record<string, PlaythroughEvent>;
  originalPrompts: Record<string, OriginalPrompt>;
}

export interface PromptBlueprintInput {
  prompt: string;
  title?: string;
  genre?: string;
  audience?: string;
  tone?: string;
  branchDepth: number;
  decisionPoints: number;
  endings: number;
  targetRuntimeMinutes: number;
  contentRating: string;
  constraints: string;
}

export interface AccessResult {
  playable: boolean;
  reason: 'free' | 'included' | 'purchased' | 'publisher_preview' | 'locked' | 'draft' | 'missing';
  label: string;
}
