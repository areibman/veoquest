import { expect, Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const routes = [
  ['Take the direct route', 'Push through the danger', 'Commit to the rescue'],
  ['Take the direct route', 'Push through the danger', 'Cut losses and escape'],
  ['Take the direct route', 'Secure the fallback'],
  ['Study the hidden path', 'Trust the clue', 'Reveal the secret'],
  ['Study the hidden path', 'Trust the clue', 'Protect everyone first'],
  ['Study the hidden path', 'Turn back with proof'],
];

const demoScenarios = [
  { id: 'scenario-space-rescue', title: 'Space Rescue Mission', locked: false },
  { id: 'scenario-haunted-museum', title: 'Haunted Museum Exploration', locked: false },
  { id: 'scenario-nebula-aftermath', title: 'Nebula Aftermath', locked: true },
];

const storageKey = 'veoquest_database_v1';

async function resetFast(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem('veoquest_test_fast', '1');
  });
}

async function playRoute(page: Page, scenarioId: string, route: string[]) {
  await page.goto(`/play/${scenarioId}`);
  if (await page.getByText('Ending reached').waitFor({ state: 'visible', timeout: 1_000 }).then(() => true).catch(() => false)) {
    await page.getByRole('button', { name: 'Replay' }).click();
  }
  for (const label of route) {
    const button = page.getByRole('button', { name: new RegExp(label) });
    await expect(button).toBeVisible();
    await button.click();
  }
  await expect(page.getByText('Ending reached')).toBeVisible();
  await expect(page.getByText('Path Taken')).toBeVisible();
}

async function injectStressScenario(page: Page, kind: 'long-chain' | 'wide-choice') {
  await page.goto('/');
  await page.evaluate(({ storageKey, kind }) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error('VeoQuest database was not seeded.');

    const db = JSON.parse(raw);
    const now = new Date().toISOString();
    const gameId = 'game-stress-lab';
    const packId = 'pack-stress-lab';
    const scenarioId = kind === 'long-chain' ? 'scenario-long-chain-stress' : 'scenario-wide-choice-stress';
    const rootNodeId = `${scenarioId}-node-1`;
    const nodeIds: string[] = [];
    const choiceIds: string[] = [];
    const clipIds: string[] = [];

    db.games[gameId] = {
      id: gameId,
      title: 'Stress Lab',
      description: 'Publisher QA scenarios injected by the browser suite.',
      coverAssetPath: 'fake-veo31://stress-lab-cover',
      status: 'published',
      defaultScenarioId: scenarioId,
      metadata: { source: 'playwright' },
      createdAt: now,
      updatedAt: now,
    };
    db.contentPacks[packId] = {
      id: packId,
      gameId,
      title: 'Stress Lab Base Pack',
      description: 'Free stress content for layout and path limit checks.',
      releaseType: 'base_game',
      accessType: 'free',
      priceTier: 'free',
      status: 'published',
      scenarioIds: [scenarioId],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };

    const addNode = (index: number, isEnding = false) => {
      const nodeId = `${scenarioId}-node-${index}`;
      const clipId = `${scenarioId}-clip-${index}`;
      nodeIds.push(nodeId);
      if (!isEnding) clipIds.push(clipId);
      db.nodes[nodeId] = {
        id: nodeId,
        scenarioId,
        title: isEnding ? 'Stress Ending' : `Stress Segment ${index}`,
        description: isEnding ? 'The stress path resolves cleanly.' : `Segment ${index} in a generated stress scenario.`,
        prompt: `A deterministic fake Veo 3.1 stress scene ${index}.`,
        clipId: isEnding ? undefined : clipId,
        position: { x: 120 + index * 80, y: 120 + (index % 3) * 110 },
        choiceIds: [],
        isEnding,
        generationType: index === 1 ? 'create' : 'extend',
        status: isEnding ? 'ending' : 'generated',
      };
      if (!isEnding) {
        db.clips[clipId] = {
          id: clipId,
          scenarioId,
          nodeId,
          source: 'seed-dummy',
          generationType: index === 1 ? 'create' : 'extend',
          prompt: `A deterministic fake Veo 3.1 stress scene ${index}.`,
          durationSeconds: 3,
          assetPath: `fake-veo31://${scenarioId}/${index}`,
          status: 'ready',
          createdAt: now,
          metadata: {
            seed: 9000 + index,
            aspectRatio: '16:9',
            palette: index % 2 === 0 ? ['#0f766e', '#f59e0b'] : ['#1d4ed8', '#db2777'],
            continuationOfClipId: index > 1 ? `${scenarioId}-clip-${index - 1}` : undefined,
            label: 'Stress test clip',
          },
        };
      }
      return nodeId;
    };

    const addChoice = (sourceNodeId: string, targetNodeId: string, label: string, displayOrder: number) => {
      const choiceId = `${sourceNodeId}-choice-${displayOrder + 1}`;
      choiceIds.push(choiceId);
      db.choices[choiceId] = {
        id: choiceId,
        scenarioId,
        sourceNodeId,
        targetNodeId,
        label,
        description: `Continue through stress path option ${displayOrder + 1}.`,
        displayOrder,
      };
      db.nodes[sourceNodeId].choiceIds.push(choiceId);
      return choiceId;
    };

    if (kind === 'long-chain') {
      const totalNodes = 13;
      for (let index = 1; index <= totalNodes; index += 1) {
        addNode(index, index === totalNodes);
      }
      for (let index = 1; index < totalNodes; index += 1) {
        addChoice(`${scenarioId}-node-${index}`, `${scenarioId}-node-${index + 1}`, `Continue ${index}`, 0);
      }
    } else {
      addNode(1);
      for (let index = 2; index <= 7; index += 1) {
        addNode(index, true);
        addChoice(rootNodeId, `${scenarioId}-node-${index}`, `Wide option ${index - 1}`, index - 2);
      }
    }

    db.scenarios[scenarioId] = {
      id: scenarioId,
      gameId,
      contentPackId: packId,
      title: kind === 'long-chain' ? 'Long Chain Stress Scenario' : 'Wide Choice Stress Scenario',
      description: 'Browser-injected stress scenario for QA coverage.',
      status: 'published',
      rootNodeId,
      settings: {
        aspectRatio: '16:9',
        clipDurationSeconds: 3,
        extensionDurationSeconds: 3,
        clipCountLimit: 20,
        branchDepthLimit: 14,
        costPerClipCents: 20,
        styleGuidance: 'Dense QA scenario with readable text and stable choices.',
      },
      nodeIds,
      choiceIds,
      originalPromptId: undefined,
      validationStatus: 'valid',
      validationErrors: [],
      createdAt: now,
      updatedAt: now,
    };
    db.updatedAt = now;
    window.localStorage.setItem(storageKey, JSON.stringify(db));
  }, { storageKey, kind });
}

async function injectVariableDurationScenario(page: Page, durationSeconds: number) {
  await page.goto('/');
  await page.evaluate(({ storageKey, durationSeconds }) => {
    window.localStorage.removeItem('veoquest_test_fast');
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error('VeoQuest database was not seeded.');

    const db = JSON.parse(raw);
    const now = new Date().toISOString();
    const gameId = 'game-duration-lab';
    const packId = 'pack-duration-lab';
    const scenarioId = 'scenario-variable-duration';
    const rootNodeId = 'scenario-variable-duration-opening';
    const endingNodeId = 'scenario-variable-duration-ending';
    const choiceId = 'scenario-variable-duration-choice';
    const clipId = 'scenario-variable-duration-clip';

    db.games[gameId] = {
      id: gameId,
      title: 'Duration Lab',
      description: 'Scenario used to verify clip metadata controls player timing.',
      coverAssetPath: 'fake-veo31://duration-lab-cover',
      status: 'published',
      defaultScenarioId: scenarioId,
      metadata: { source: 'playwright' },
      createdAt: now,
      updatedAt: now,
    };
    db.contentPacks[packId] = {
      id: packId,
      gameId,
      title: 'Duration Lab Base Pack',
      description: 'Free duration test content.',
      releaseType: 'base_game',
      accessType: 'free',
      priceTier: 'free',
      status: 'published',
      scenarioIds: [scenarioId],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };
    db.nodes[rootNodeId] = {
      id: rootNodeId,
      scenarioId,
      title: 'Six Second Opening',
      description: 'A metadata-duration clip that must not expose a misleading progress bar.',
      prompt: 'A six second deterministic fake Veo clip.',
      clipId,
      position: { x: 120, y: 120 },
      choiceIds: [choiceId],
      isEnding: false,
      generationType: 'create',
      status: 'generated',
    };
    db.nodes[endingNodeId] = {
      id: endingNodeId,
      scenarioId,
      title: 'Duration Ending',
      description: 'The variable-duration route resolves.',
      prompt: 'Resolve the variable-duration route.',
      position: { x: 120, y: 320 },
      choiceIds: [],
      isEnding: true,
      generationType: 'extend',
      status: 'ending',
    };
    db.choices[choiceId] = {
      id: choiceId,
      scenarioId,
      sourceNodeId: rootNodeId,
      targetNodeId: endingNodeId,
      label: 'Finish duration route',
      description: 'Choose after the duration-controlled decision point.',
      displayOrder: 0,
    };
    db.clips[clipId] = {
      id: clipId,
      scenarioId,
      nodeId: rootNodeId,
      source: 'seed-dummy',
      generationType: 'create',
      prompt: 'A six second deterministic fake Veo clip.',
      durationSeconds,
      assetPath: `fake-veo31://duration-lab/${durationSeconds}`,
      status: 'ready',
      createdAt: now,
      metadata: {
        seed: 6060,
        aspectRatio: '16:9',
        palette: ['#0f766e', '#7c3aed'],
        label: 'Variable duration test clip',
      },
    };
    db.scenarios[scenarioId] = {
      id: scenarioId,
      gameId,
      contentPackId: packId,
      title: 'Variable Duration Scenario',
      description: 'A scenario proving clip duration metadata controls playback timing.',
      status: 'published',
      rootNodeId,
      settings: {
        aspectRatio: '16:9',
        clipDurationSeconds: durationSeconds,
        extensionDurationSeconds: durationSeconds,
        clipCountLimit: 4,
        branchDepthLimit: 3,
        costPerClipCents: 20,
        styleGuidance: 'Duration metadata test scenario.',
      },
      nodeIds: [rootNodeId, endingNodeId],
      choiceIds: [choiceId],
      originalPromptId: undefined,
      validationStatus: 'valid',
      validationErrors: [],
      createdAt: now,
      updatedAt: now,
    };
    db.updatedAt = now;
    window.localStorage.setItem(storageKey, JSON.stringify(db));
  }, { storageKey, durationSeconds });
}

test.beforeEach(async ({ page }) => {
  await resetFast(page);
});

for (const scenario of demoScenarios) {
  test(`every branch route reaches an ending for ${scenario.title}`, async ({ page }) => {
    test.setTimeout(60_000);
    if (scenario.locked) {
      await page.goto(`/play/${scenario.id}`);
      await expect(page.getByText('Requires access')).toBeVisible();
      await page.getByTestId('locked-unlock').click();
      await expect(page.getByTestId('player')).toBeVisible();
    }

    for (const route of routes) {
      await playRoute(page, scenario.id, route);
    }
  });
}

test('invalid JSON repair loop keeps generation blocked until validation passes', async ({ page }) => {
  await page.goto('/designer?mode=prompt');
  await page.getByRole('button', { name: 'JSON' }).click();
  await page.getByRole('button', { name: 'Invalid Sample' }).click();
  await page.getByRole('button', { name: 'Validate JSON' }).click();

  await expect(page.locator('pre').filter({ hasText: /root node must exist/i })).toBeVisible();
  await expect(page.getByTestId('generate-all')).toBeDisabled();

  await page.getByRole('button', { name: 'Prompt' }).click();
  await page.getByTestId('draft-blueprint').click();
  await page.getByRole('button', { name: 'Import Valid Blueprint' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await expect(page.getByTestId('generate-all')).toBeDisabled();
});

test('manual graph creation can validate, generate, and playtest', async ({ page }) => {
  await page.goto('/designer');
  await page.getByLabel('Video Prompt').fill('A compact manual test scene with a clear choice at the end.');
  await page.getByRole('button', { name: 'Ending', exact: true }).click();
  await page.locator('[data-testid^="node-"][data-testid$="-opening"]').click();
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Choice label').fill('Finish the scene');
  await expect(page.getByText('Graph is structurally valid')).toBeVisible();

  await page.getByLabel('Approve full scenario dummy generation after validation and cost review.').check();
  await page.getByTestId('generate-all').click();
  await expect(page.getByText('Playtest clips are ready.')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Playtest' }).click();
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByRole('button', { name: /Finish the scene/ }).click();
  await expect(page.getByText('Ending reached')).toBeVisible();
});

test('refresh recovery is predictable at a decision point and after an ending', async ({ page }) => {
  await page.goto('/play/scenario-space-rescue');
  await page.getByRole('button', { name: /Take the direct route/ }).click();
  await expect(page.getByRole('heading', { name: 'Direct Route' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Direct Route' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Push through the danger/ })).toBeVisible();

  await page.getByRole('button', { name: /Push through the danger/ }).click();
  await page.getByRole('button', { name: /Commit to the rescue/ }).click();
  await expect(page.getByText('Ending reached')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ending reached')).toBeVisible();
});

test('normal playback waits near the intended decision point before choices appear', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/play/scenario-space-rescue');
  const startedAt = Date.now();
  await expect(page.getByRole('button', { name: /Take the direct route/ })).toBeVisible({ timeout: 6_000 });
  const elapsed = Date.now() - startedAt;

  expect(elapsed).toBeGreaterThan(2_250);
  expect(elapsed).toBeLessThan(5_500);
});

test('variable clip durations drive decision timing without a visible video progress bar', async ({ page }) => {
  test.setTimeout(15_000);
  await injectVariableDurationScenario(page, 6);
  await page.goto('/play/scenario-variable-duration');

  await expect(page.getByText('0s')).toHaveCount(0);
  await expect(page.getByText('6s')).toHaveCount(0);

  const startedAt = Date.now();
  await expect(page.getByRole('button', { name: /Finish duration route/ })).toBeVisible({ timeout: 8_000 });
  const elapsed = Date.now() - startedAt;

  expect(elapsed).toBeGreaterThan(4_700);
  expect(elapsed).toBeLessThan(7_200);
  await page.getByRole('button', { name: /Finish duration route/ }).click();
  await expect(page.getByText('Ending reached')).toBeVisible();
});

test('responsive screenshot evidence covers required breakpoints and key states', async ({ page }) => {
  test.setTimeout(60_000);
  const screenshotDir = join(process.cwd(), 'reports', 'screenshots');
  mkdirSync(screenshotDir, { recursive: true });
  const breakpoints = [
    { name: 'small-mobile-320', width: 320, height: 780 },
    { name: 'standard-mobile-375', width: 375, height: 812 },
    { name: 'large-mobile-428', width: 428, height: 926 },
    { name: 'mobile-landscape', width: 844, height: 390 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
    { name: 'small-laptop', width: 1366, height: 768 },
    { name: 'large-desktop', width: 1440, height: 1100 },
  ];

  for (const viewport of breakpoints) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByTestId('catalog')).toBeVisible();
    await page.screenshot({ path: join(screenshotDir, `${viewport.name}-catalog.png`), fullPage: true });

    await page.goto('/play/scenario-space-rescue');
    await expect(page.getByRole('button', { name: /Take the direct route/ })).toBeVisible();
    const firstChoice = await page.getByRole('button', { name: /Take the direct route/ }).boundingBox();
    const secondChoice = await page.getByRole('button', { name: /Study the hidden path/ }).boundingBox();
    expect(firstChoice?.height || 0).toBeGreaterThanOrEqual(64);
    expect(secondChoice?.y || 0).toBeLessThan(viewport.height);
    await page.screenshot({ path: join(screenshotDir, `${viewport.name}-player-choice.png`), fullPage: true });

    await page.goto('/designer?scenarioId=scenario-space-rescue');
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
    await page.screenshot({ path: join(screenshotDir, `${viewport.name}-builder.png`), fullPage: true });
  }
});

test('long scenario limit remains playable across an extended generated path', async ({ page }) => {
  test.setTimeout(60_000);
  await injectStressScenario(page, 'long-chain');
  await page.goto('/play/scenario-long-chain-stress');

  for (let index = 1; index <= 12; index += 1) {
    await page.getByRole('button', { name: `Continue ${index}` }).click();
  }

  await expect(page.getByText('Ending reached')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stress Ending' })).toBeVisible();
});

test('wide choice set remains usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await injectStressScenario(page, 'wide-choice');
  await page.goto('/play/scenario-wide-choice-stress');

  const choices = page.getByTestId(/choice-/);
  await expect(choices).toHaveCount(6);
  for (let index = 1; index <= 6; index += 1) {
    await expect(page.getByRole('button', { name: `Wide option ${index}` })).toBeVisible();
  }

  const lastChoice = await page.getByRole('button', { name: 'Wide option 6' }).boundingBox();
  expect(lastChoice?.y || 0).toBeGreaterThanOrEqual(0);
  expect((lastChoice?.y || 0) + (lastChoice?.height || 0)).toBeLessThanOrEqual(844);
  await page.getByRole('button', { name: 'Wide option 6' }).click();
  await expect(page.getByText('Ending reached')).toBeVisible();
});
