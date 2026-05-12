import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateScenarioMedia } from '../lib/fakeVeo31';
import {
  applyBlueprintToDatabase,
  createPlaythrough,
  generateBlueprintFromPrompt,
  getScenarioAccess,
  grantContentPackEntitlement,
  selectChoice,
  validateBlueprint,
  validateScenarioGraph,
} from '../lib/veoquestCore';
import { createDemoDatabase } from '../lib/veoquestSeed';
import { ScenarioBlueprint } from '../lib/veoquestModels';

const promptInput = {
  title: 'Fantasy Dungeon Escape',
  prompt: 'A trapped explorer must escape a fantasy dungeon by choosing between ancient mechanisms and risky shortcuts.',
  genre: 'fantasy dungeon',
  audience: 'general viewers',
  tone: 'tense and adventurous',
  branchDepth: 3,
  decisionPoints: 3,
  endings: 3,
  targetRuntimeMinutes: 5,
  contentRating: 'PG',
  constraints: 'No gore. Make every choice label clear.',
};

describe('scenario blueprints', () => {
  it('generates a validated complete branching blueprint from one prompt', () => {
    const blueprint = generateBlueprintFromPrompt(promptInput);
    const report = validateBlueprint(blueprint);

    expect(report.valid).toBe(true);
    expect(blueprint.nodes.length).toBeGreaterThanOrEqual(4);
    expect(blueprint.nodes.filter((node) => node.isEnding).length).toBeGreaterThanOrEqual(1);
    expect(report.estimatedCost.clipCount).toBeGreaterThan(0);
  });

  it('rejects untrusted blueprint JSON before graph creation', () => {
    const blueprint = generateBlueprintFromPrompt(promptInput);
    blueprint.choices[0].targetNodeId = 'missing-node';

    const report = validateBlueprint(blueprint);

    expect(report.valid).toBe(false);
    expect(report.errors.some((error) => error.code === 'choice.target')).toBe(true);
  });

  it('converts a valid blueprint into a scenario graph', () => {
    const db = createDemoDatabase('2026-05-09T12:00:00.000Z');
    const blueprint = generateBlueprintFromPrompt(promptInput);
    const next = applyBlueprintToDatabase(db, blueprint);
    const report = validateScenarioGraph(next, blueprint.scenario.id);

    expect(next.scenarios[blueprint.scenario.id]).toBeDefined();
    expect(report.valid).toBe(true);
  });

  it('keeps the documented example blueprint valid', () => {
    const examplePath = join(process.cwd(), 'docs', 'scenario-blueprint.example.json');
    const example = JSON.parse(readFileSync(examplePath, 'utf8')) as ScenarioBlueprint;
    const report = validateBlueprint(example);

    expect(report.valid).toBe(true);
  });
});

describe('fake Veo 3.1 generation', () => {
  it('requires explicit approval before full scenario media generation', async () => {
    const db = createDemoDatabase('2026-05-09T12:00:00.000Z');

    await expect(generateScenarioMedia(db, 'scenario-space-rescue', { approved: false, delayMs: 0 })).rejects.toThrow(/approval/i);
  });

  it('creates deterministic dummy clips and generation jobs', async () => {
    const db = createDemoDatabase('2026-05-09T12:00:00.000Z');
    const blueprint = generateBlueprintFromPrompt(promptInput);
    const withoutClips = applyBlueprintToDatabase(db, blueprint);
    const generated = await generateScenarioMedia(withoutClips, blueprint.scenario.id, { approved: true, delayMs: 0 });
    const playableReport = validateScenarioGraph(generated, blueprint.scenario.id, { requireClips: true });

    expect(playableReport.valid).toBe(true);
    expect(Object.values(generated.generationJobs).some((job) => job.status === 'succeeded')).toBe(true);
    expect(Object.values(generated.clips).some((clip) => clip.source === 'fake-veo-3.1')).toBe(true);
  });

  it('records source clip lineage for extension jobs', async () => {
    const db = createDemoDatabase('2026-05-09T12:00:00.000Z');
    const blueprint = generateBlueprintFromPrompt(promptInput);
    const withoutClips = applyBlueprintToDatabase(db, blueprint);
    const generated = await generateScenarioMedia(withoutClips, blueprint.scenario.id, { approved: true, delayMs: 0 });
    const extensionJob = Object.values(generated.generationJobs).find((job) => job.requestType === 'extendVideo');

    expect(extensionJob?.sourceClipId).toBeTruthy();
    expect(extensionJob?.clipId).toBeTruthy();
    expect(generated.clips[extensionJob?.clipId || '']?.metadata.continuationOfClipId).toBe(extensionJob?.sourceClipId);
  });

  it('blocks converging non-ending nodes to preserve extension lineage', () => {
    const blueprint = generateBlueprintFromPrompt(promptInput);
    const directSecureChoice = blueprint.choices.find((choice) => choice.label === 'Secure the fallback');
    const carefulRoute = blueprint.nodes.find((node) => node.title === 'Careful Route');
    if (!directSecureChoice || !carefulRoute) throw new Error('Expected generated fixture nodes.');
    directSecureChoice.targetNodeId = carefulRoute.id;

    const report = validateBlueprint(blueprint);

    expect(report.valid).toBe(false);
    expect(report.errors.some((error) => error.code === 'graph.converging_extension')).toBe(true);
  });
});

describe('catalog access and playthroughs', () => {
  it('blocks a locked expansion until a simulated entitlement is granted', () => {
    const db = createDemoDatabase('2026-05-09T12:00:00.000Z');

    expect(getScenarioAccess(db, 'scenario-nebula-aftermath').playable).toBe(false);

    const unlocked = grantContentPackEntitlement(db, 'pack-stellar-frontier-nebula');

    expect(getScenarioAccess(unlocked, 'scenario-nebula-aftermath').playable).toBe(true);
  });

  it('persists route state when a viewer selects a choice', () => {
    const db = createDemoDatabase('2026-05-09T12:00:00.000Z');
    const created = createPlaythrough(db, 'scenario-space-rescue');
    const playthrough = created.playthrough;
    const rootChoiceId = created.db.nodes[playthrough.currentNodeId].choiceIds[0];
    const updated = selectChoice(created.db, playthrough.id, rootChoiceId);

    expect(updated.playthrough.choiceIds).toEqual([rootChoiceId]);
    expect(updated.playthrough.visitedNodeIds.length).toBe(2);
    expect(updated.db.playthroughEvents).not.toEqual({});
  });
});
