import {
  Clip,
  GenerationJob,
  StoryNode,
  VeoQuestDatabase,
} from './veoquestModels';
import {
  cloneDatabase,
  createId,
  getIncomingClipId,
  makeClipForNode,
  nowIso,
  stableHash,
  validateScenarioGraph,
} from './veoquestCore';

export interface FakeCreateVideoRequest {
  scenarioId: string;
  nodeId: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16';
  seed?: number;
  metadata?: Record<string, unknown>;
}

export interface FakeExtendVideoRequest extends FakeCreateVideoRequest {
  sourceClipId: string;
  targetNodeId: string;
}

export interface FakeGenerationOptions {
  approved: boolean;
  selectedNodeIds?: string[];
  forceFailureNodeId?: string;
  delayMs?: number;
}

export type FakeGenerationProgress = (db: VeoQuestDatabase, job: GenerationJob) => void;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createJob(
  request: FakeCreateVideoRequest | FakeExtendVideoRequest,
  requestType: GenerationJob['requestType'],
  createdAt = nowIso()
): GenerationJob {
  return {
    id: createId('job', `${request.scenarioId}:${request.nodeId}:${createdAt}:${requestType}`),
    scenarioId: request.scenarioId,
    nodeId: request.nodeId,
    requestType,
    sourceClipId: 'sourceClipId' in request ? request.sourceClipId : undefined,
    targetNodeId: 'targetNodeId' in request ? request.targetNodeId : undefined,
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    aspectRatio: request.aspectRatio,
    seed: request.seed ?? stableHash(`${request.nodeId}:${request.prompt}`),
    status: 'queued',
    progress: 0,
    createdAt,
    updatedAt: createdAt,
    metadata: request.metadata || {},
  };
}

export function createVideo(request: FakeCreateVideoRequest): GenerationJob {
  return createJob(request, 'createVideo');
}

export function extendVideo(request: FakeExtendVideoRequest): GenerationJob {
  return createJob(request, 'extendVideo');
}

export function getGenerationJob(db: VeoQuestDatabase, jobId: string): GenerationJob | null {
  return db.generationJobs[jobId] || null;
}

export function listGenerationJobs(db: VeoQuestDatabase, scenarioId: string): GenerationJob[] {
  return Object.values(db.generationJobs)
    .filter((job) => job.scenarioId === scenarioId)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function cancelGenerationJob(db: VeoQuestDatabase, jobId: string): VeoQuestDatabase {
  const next = cloneDatabase(db);
  const job = next.generationJobs[jobId];
  if (job && (job.status === 'queued' || job.status === 'running')) {
    job.status = 'cancelled';
    job.progress = 0;
    job.updatedAt = nowIso();
    next.updatedAt = job.updatedAt;
  }
  return next;
}

function requestForNode(db: VeoQuestDatabase, node: StoryNode): FakeCreateVideoRequest | FakeExtendVideoRequest {
  const scenario = db.scenarios[node.scenarioId];
  const durationSeconds = node.generationType === 'extend'
    ? scenario.settings.extensionDurationSeconds
    : scenario.settings.clipDurationSeconds;
  const baseRequest: FakeCreateVideoRequest = {
    scenarioId: node.scenarioId,
    nodeId: node.id,
    prompt: node.prompt,
    durationSeconds,
    aspectRatio: scenario.settings.aspectRatio,
    seed: stableHash(`${node.id}:${node.prompt}`),
    metadata: {
      nodeTitle: node.title,
    },
  };

  const sourceClipId = getIncomingClipId(db, node.id);
  if (node.generationType === 'extend' && sourceClipId) {
    return {
      ...baseRequest,
      sourceClipId,
      targetNodeId: node.id,
    };
  }
  return baseRequest;
}

function completeJobWithClip(db: VeoQuestDatabase, job: GenerationJob, node: StoryNode, createdAt = nowIso()): {
  db: VeoQuestDatabase;
  job: GenerationJob;
  clip: Clip;
} {
  const next = cloneDatabase(db);
  const clip = makeClipForNode(next, node, {
    id: createId('clip', `${node.id}:${job.id}`),
    source: 'fake-veo-3.1',
    createdAt,
  });
  const completedJob: GenerationJob = {
    ...job,
    status: 'succeeded',
    progress: 100,
    clipId: clip.id,
    updatedAt: createdAt,
  };

  next.clips[clip.id] = clip;
  next.generationJobs[completedJob.id] = completedJob;
  next.nodes[node.id] = {
    ...next.nodes[node.id],
    clipId: clip.id,
    status: 'generated',
  };
  next.updatedAt = createdAt;

  return { db: next, job: completedJob, clip };
}

export async function generateScenarioMedia(
  db: VeoQuestDatabase,
  scenarioId: string,
  options: FakeGenerationOptions,
  onProgress?: FakeGenerationProgress
): Promise<VeoQuestDatabase> {
  if (!options.approved) {
    throw new Error('Publisher approval is required before full dummy media generation starts.');
  }

  const validation = validateScenarioGraph(db, scenarioId, { requireClips: false });
  if (!validation.valid) {
    throw new Error(validation.errors[0]?.message || 'Scenario must be valid before generation.');
  }

  let next = cloneDatabase(db);
  const scenario = next.scenarios[scenarioId];
  const selected = new Set(options.selectedNodeIds || scenario.nodeIds);
  const delayMs = options.delayMs ?? 90;

  for (const nodeId of scenario.nodeIds) {
    const node = next.nodes[nodeId];
    if (!node || node.isEnding || !selected.has(node.id)) continue;

    const request = requestForNode(next, node);
    let job = 'sourceClipId' in request ? extendVideo(request) : createVideo(request);
    next.generationJobs[job.id] = job;
    next.nodes[node.id].status = 'generating';
    next.updatedAt = nowIso();
    onProgress?.(cloneDatabase(next), job);
    await delay(delayMs);

    job = {
      ...job,
      status: 'running',
      progress: 55,
      updatedAt: nowIso(),
    };
    next.generationJobs[job.id] = job;
    onProgress?.(cloneDatabase(next), job);
    await delay(delayMs);

    if (options.forceFailureNodeId === node.id) {
      job = {
        ...job,
        status: 'failed',
        progress: 55,
        error: 'Forced fake Veo failure for deterministic testing.',
        updatedAt: nowIso(),
      };
      next.generationJobs[job.id] = job;
      next.nodes[node.id].status = 'invalid';
      onProgress?.(cloneDatabase(next), job);
      continue;
    }

    const completed = completeJobWithClip(next, job, node);
    next = completed.db;
    onProgress?.(cloneDatabase(next), completed.job);
  }

  return next;
}
