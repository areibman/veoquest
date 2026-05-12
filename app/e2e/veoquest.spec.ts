import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem('veoquest_test_fast', '1');
  });
});

test('catalog shows free and locked content and unlocks the expansion', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('catalog')).toBeVisible();
  await expect(page.getByTestId('play-scenario-space-rescue')).toBeVisible();
  await expect(page.getByTestId('unlock-scenario-nebula-aftermath')).toBeVisible();

  await page.getByTestId('play-locked-scenario-nebula-aftermath').click();
  await expect(page.getByText('Requires access')).toBeVisible();
  await expect(page.getByTestId('locked-unlock')).toBeVisible();
  await page.getByRole('button', { name: 'Catalog' }).click();

  await page.getByTestId('unlock-scenario-nebula-aftermath').click();
  await expect(page.getByTestId('play-scenario-nebula-aftermath')).toBeVisible();
});

test('viewer plays a route and reaches an ending', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play-scenario-space-rescue').click();

  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('choice-0')).toBeVisible();
  await page.getByTestId('choice-0').click();

  await expect(page.getByRole('heading', { name: 'Direct Route' })).toBeVisible();
  await expect(page.getByTestId('choice-0')).toBeVisible();
  await page.getByTestId('choice-0').click();

  await expect(page.getByRole('heading', { name: 'Risk Choice' })).toBeVisible();
  await expect(page.getByTestId('choice-0')).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.getByText('Ending reached')).toBeVisible();
  await expect(page.getByText('Path Taken')).toBeVisible();
});

test('publisher drafts, validates, imports, generates, and playtests a prompt story', async ({ page }) => {
  await page.goto('/designer?mode=prompt');

  await page.getByTestId('draft-blueprint').click();
  await expect(page.getByTestId('blueprint-json')).toContainText('veoquest.blueprint.v1');

  await page.getByRole('button', { name: 'Import Valid Blueprint' }).click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();

  await page.getByLabel('Approve full scenario dummy generation after validation and cost review.').check();
  await page.getByTestId('generate-all').click();
  await expect(page.getByText('Playtest clips are ready.')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Playtest' }).click();
  await expect(page.getByTestId('player')).toBeVisible();
});

test('draft scenarios cannot be launched before dummy clips are generated', async ({ page }) => {
  await page.goto('/designer');
  await expect(page.getByRole('button', { name: 'Playtest' })).toBeDisabled();

  await page.goto('/');
  await expect(page.getByRole('button', { name: /Play Untitled Branching Story/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Open builder for Untitled Branching Story/ })).toBeVisible();
});

test('builder graph uses React Flow and stays inside the mobile viewport without horizontal clipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/designer?scenarioId=scenario-space-rescue');
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await expect(page.getByTestId('react-flow-graph')).toBeVisible();
  await expect(page.locator('.react-flow')).toBeVisible();
  await expect.poll(() => page.locator('.react-flow__edge').count()).toBeGreaterThan(0);
  await expect.poll(async () => {
    return page.locator('.react-flow__node').evaluateAll((nodeElements) => {
      return nodeElements.every((element) => element.scrollWidth <= element.clientWidth + 1);
    });
  }).toBe(true);

  const firstNode = page.locator('.react-flow__node').first();
  const beforeDrag = await firstNode.boundingBox();
  expect(beforeDrag).not.toBeNull();
  await page.mouse.move((beforeDrag?.x || 0) + (beforeDrag?.width || 0) / 2, (beforeDrag?.y || 0) + (beforeDrag?.height || 0) / 2);
  await page.mouse.down();
  await page.mouse.move((beforeDrag?.x || 0) + (beforeDrag?.width || 0) / 2 + 80, (beforeDrag?.y || 0) + (beforeDrag?.height || 0) / 2 + 40, { steps: 6 });
  const duringDrag = await firstNode.boundingBox();
  expect((duringDrag?.x || 0) - (beforeDrag?.x || 0)).toBeGreaterThan(20);
  await page.mouse.up();

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const graphBox = await page.getByTestId('graph-canvas').boundingBox();

  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  expect((graphBox?.x || 0) + (graphBox?.width || 0)).toBeLessThanOrEqual(viewport.clientWidth);
});

test('publisher starts a new scenario and reset demo restores the seed catalog', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('new-scenario').click();
  await expect(page).toHaveURL(/\/designer/);
  await expect(page.getByLabel('Scenario title')).toHaveValue('Untitled Branching Story');
  await page.getByLabel('Scenario title').fill('Reset Me Story');
  await page.getByLabel('Video Prompt').fill('A temporary scenario created only to prove reset restores demo state.');

  await page.goto('/');
  await expect(page.getByText('Reset Me Story')).toBeVisible();

  await page.getByTestId('new-game').click();
  await page.getByLabel(/Game title for/).fill('Temporary Reset Game');
  await page.getByRole('button', { name: /Finish editing Temporary Reset Game/ }).click();
  await expect(page.getByText('Temporary Reset Game')).toBeVisible();

  await page.getByRole('button', { name: 'Reset Demo' }).click();
  await expect(page.getByText('Reset Me Story')).toHaveCount(0);
  await expect(page.getByText('Temporary Reset Game')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Space Rescue Mission' })).toBeVisible();
  await expect(page.getByTestId('unlock-scenario-nebula-aftermath')).toBeVisible();
});

test('publisher creates edits and archives a game container', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('new-game').click();
  await page.getByLabel(/Game title for/).fill('Signal Harbor');
  await page.getByLabel(/Game description for/).fill('Interactive harbor mystery for QA.');
  await page.getByLabel(/Cover asset for/).fill('fake-veo31://signal-harbor-cover');
  await page.getByLabel(/Game status for/).selectOption('qa');
  await page.getByRole('button', { name: /Finish editing Signal Harbor/ }).click();

  await expect(page.getByText('Signal Harbor')).toBeVisible();
  await expect(page.getByText('Interactive harbor mystery for QA.')).toBeVisible();
  await expect(page.getByText('fake-veo31://signal-harbor-cover')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Signal Harbor')).toBeVisible();

  await page.getByRole('button', { name: /Archive game Signal Harbor/ }).click();
  await page.getByRole('button', { name: /Confirm archive Signal Harbor/ }).click();
  await expect(page.getByText('Signal Harbor')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Signal Harbor')).toHaveCount(0);
});

test('creator can add delete move and rewire graph nodes', async ({ page }) => {
  await page.goto('/designer?scenarioId=scenario-space-rescue');
  await expect(page.getByLabel('Node Title')).toHaveValue('Opening Decision');

  await page.getByRole('button', { name: 'Scene' }).click();
  await expect(page.getByLabel('Node Title')).toHaveValue('New Scene');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Node Title')).toHaveValue('Opening Decision');

  await expect(page.getByTestId('node-position')).toHaveText('120, 80');
  await page.getByTestId('move-node-right').click();
  await expect(page.getByTestId('node-position')).toHaveText('200, 80');

  const firstTarget = page.getByLabel('Choice target').first();
  await firstTarget.selectOption({ label: 'Costly Ending' });
  await expect(page.getByText('Graph is structurally valid')).toBeVisible();
  await expect(firstTarget.locator('option:checked')).toHaveText('Costly Ending');

  await page.reload();
  await expect(page.getByTestId('node-position')).toHaveText('200, 80');
  await expect(page.getByLabel('Choice target').first().locator('option:checked')).toHaveText('Costly Ending');
});
