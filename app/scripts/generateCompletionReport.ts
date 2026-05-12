import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  estimateScenarioCost,
  getScenarioAccess,
  getScenarioChoices,
  getScenarioNodes,
  validateBlueprint,
  validateScenarioGraph,
} from '../lib/veoquestCore';
import { createDemoDatabase } from '../lib/veoquestSeed';
import { Scenario, StoryNode, VeoQuestDatabase } from '../lib/veoquestModels';

interface QaEvidence {
  generatedAt: string;
  commands: Array<{
    name: string;
    status: 'pass' | 'fail' | 'blocked';
    summary: string;
    artifact?: string;
  }>;
  browserAgent: Array<{
    name: string;
    status: 'pass' | 'fail' | 'blocked';
    summary: string;
  }>;
  visualQa: Array<{
    screen: string;
    breakpoint: string;
    status: 'pass' | 'fail' | 'blocked';
    screenshot?: string;
    notes: string;
  }>;
  lighthouse: Array<{
    page: string;
    device: 'desktop' | 'mobile';
    status: 'pass' | 'fail' | 'blocked';
    scores: {
      performance?: number;
      accessibility?: number;
      bestPractices?: number;
      seo?: number;
    };
    notes: string;
  }>;
  profiler: Array<{
    workflow: string;
    status: 'pass' | 'fail' | 'blocked';
    notes: string;
  }>;
  naturalLanguageUseCases: Array<{
    id: number;
    title: string;
    status: 'pass' | 'fail' | 'blocked';
    evidence: string;
  }>;
  limitations: string[];
}

interface PathStep {
  node: StoryNode;
  choiceLabel?: string;
}

const outputDir = join(process.cwd(), 'reports');
const reportPath = join(outputDir, 'veoquest-completion-report.html');
const evidencePath = join(outputDir, 'qa-evidence.json');
const appVersion = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusClass(status: 'pass' | 'fail' | 'blocked' | boolean): string {
  if (status === true || status === 'pass') return 'pass';
  if (status === false || status === 'fail') return 'fail';
  return 'blocked';
}

function readEvidence(): QaEvidence {
  try {
    return JSON.parse(readFileSync(evidencePath, 'utf8')) as QaEvidence;
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      commands: [],
      browserAgent: [],
      visualQa: [],
      lighthouse: [],
      profiler: [],
      naturalLanguageUseCases: [],
      limitations: ['No qa-evidence.json file was found when this report was generated.'],
    };
  }
}

function choicesForNode(db: VeoQuestDatabase, nodeId: string) {
  const node = db.nodes[nodeId];
  if (!node) return [];
  return node.choiceIds
    .map((choiceId) => db.choices[choiceId])
    .filter(Boolean)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

function enumeratePaths(db: VeoQuestDatabase, scenario: Scenario): PathStep[][] {
  const paths: PathStep[][] = [];

  const walk = (nodeId: string, path: PathStep[]) => {
    const node = db.nodes[nodeId];
    if (!node) return;
    const choices = choicesForNode(db, nodeId);
    if (node.isEnding || choices.length === 0) {
      paths.push([...path, { node }]);
      return;
    }
    for (const choice of choices) {
      walk(choice.targetNodeId, [...path, { node, choiceLabel: choice.label }]);
    }
  };

  walk(scenario.rootNodeId, []);
  return paths;
}

function renderStatus(label: string, status: 'pass' | 'fail' | 'blocked' | boolean): string {
  return `<span class="pill ${statusClass(status)}">${escapeHtml(label)}</span>`;
}

function reportHref(path: string): string {
  if (/^[a-z]+:/i.test(path) || path.startsWith('#')) return path;
  if (path.startsWith('reports/')) return path.slice('reports/'.length);
  return `../${path}`;
}

function renderList(items: string[]): string {
  if (items.length === 0) return '<p class="muted">None recorded.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderScenario(db: VeoQuestDatabase, scenario: Scenario): string {
  const game = db.games[scenario.gameId];
  const pack = db.contentPacks[scenario.contentPackId];
  const nodes = getScenarioNodes(db, scenario.id);
  const choices = getScenarioChoices(db, scenario.id);
  const validation = validateScenarioGraph(db, scenario.id, { requireClips: true });
  const cost = estimateScenarioCost(db, scenario.id);
  const paths = enumeratePaths(db, scenario);
  const playableNodes = nodes.filter((node) => !node.isEnding);
  const clipRows = playableNodes.map((node) => {
    const clip = node.clipId ? db.clips[node.clipId] : undefined;
    return `<tr>
      <td>${escapeHtml(node.title)}</td>
      <td><code>${escapeHtml(node.id)}</code></td>
      <td><code>${escapeHtml(node.clipId || 'missing')}</code></td>
      <td>${escapeHtml(clip?.durationSeconds ?? 'missing')}s</td>
      <td><code>${escapeHtml(clip?.assetPath || 'missing')}</code></td>
    </tr>`;
  });

  return `<section>
    <h3>${escapeHtml(scenario.title)}</h3>
    <div class="meta">
      ${renderStatus(validation.valid ? 'graph valid' : 'graph invalid', validation.valid)}
      ${renderStatus(getScenarioAccess(db, scenario.id).playable ? 'playable' : 'locked', getScenarioAccess(db, scenario.id).playable ? 'pass' : 'blocked')}
      <span>${escapeHtml(game.title)}</span>
      <span>${escapeHtml(pack.title)}</span>
    </div>
    <p>${escapeHtml(scenario.description)}</p>
    <div class="grid">
      <div><strong>${nodes.length}</strong><span>nodes</span></div>
      <div><strong>${choices.length}</strong><span>choices</span></div>
      <div><strong>${cost.clipCount}</strong><span>clips</span></div>
      <div><strong>${cost.totalRuntimeSeconds}s</strong><span>runtime</span></div>
      <div><strong>$${(cost.estimatedCostCents / 100).toFixed(2)}</strong><span>fake cost</span></div>
      <div><strong>${paths.length}</strong><span>routes</span></div>
    </div>
    <h4>Generated Media Inventory</h4>
    <table>
      <thead><tr><th>Node</th><th>Node ID</th><th>Clip ID</th><th>Duration</th><th>Asset path</th></tr></thead>
      <tbody>${clipRows.join('')}</tbody>
    </table>
    <h4>Path Summary</h4>
    <ol>${paths.map((path) => `<li>${path.map((step) => {
      const suffix = step.choiceLabel ? ` → ${step.choiceLabel}` : '';
      return `${escapeHtml(step.node.title)}${escapeHtml(suffix)}`;
    }).join(' / ')}</li>`).join('')}</ol>
    ${validation.errors.length > 0 ? `<h4>Validation Errors</h4>${renderList(validation.errors.map((item) => `${item.path}: ${item.message}`))}` : ''}
  </section>`;
}

function renderEvidence(evidence: QaEvidence): string {
  const commands = evidence.commands.map((item) => `<tr>
    <td>${escapeHtml(item.name)}</td>
    <td>${renderStatus(item.status, item.status)}</td>
    <td>${escapeHtml(item.summary)}${item.artifact ? ` <a href="${escapeHtml(reportHref(item.artifact))}">artifact</a>` : ''}</td>
  </tr>`).join('');

  const browserAgent = evidence.browserAgent.map((item) => `<tr>
    <td>${escapeHtml(item.name)}</td>
    <td>${renderStatus(item.status, item.status)}</td>
    <td>${escapeHtml(item.summary)}</td>
  </tr>`).join('');

  const visual = evidence.visualQa.map((item) => `<tr>
    <td>${escapeHtml(item.screen)}</td>
    <td>${escapeHtml(item.breakpoint)}</td>
    <td>${renderStatus(item.status, item.status)}</td>
    <td>${escapeHtml(item.notes)}${item.screenshot ? ` <a href="${escapeHtml(reportHref(item.screenshot))}">screenshot</a>` : ''}</td>
  </tr>`).join('');

  const lighthouse = evidence.lighthouse.map((item) => `<tr>
    <td>${escapeHtml(item.page)}</td>
    <td>${escapeHtml(item.device)}</td>
    <td>${renderStatus(item.status, item.status)}</td>
    <td>Perf ${escapeHtml(item.scores.performance ?? 'n/a')}; A11y ${escapeHtml(item.scores.accessibility ?? 'n/a')}; Best ${escapeHtml(item.scores.bestPractices ?? 'n/a')}; SEO ${escapeHtml(item.scores.seo ?? 'n/a')}</td>
    <td>${escapeHtml(item.notes)}</td>
  </tr>`).join('');

  const useCases = evidence.naturalLanguageUseCases.map((item) => `<tr>
    <td>${item.id}</td>
    <td>${escapeHtml(item.title)}</td>
    <td>${renderStatus(item.status, item.status)}</td>
    <td>${escapeHtml(item.evidence)}</td>
  </tr>`).join('');

  const profiler = evidence.profiler.map((item) => `<tr>
    <td>${escapeHtml(item.workflow)}</td>
    <td>${renderStatus(item.status, item.status)}</td>
    <td>${escapeHtml(item.notes)}</td>
  </tr>`).join('');

  return `<section>
    <h2>Test Results And QA Evidence</h2>
    <h3>Commands</h3>
    <table><thead><tr><th>Command</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${commands}</tbody></table>
    <h3>Browser-Agent Runs</h3>
    <table><thead><tr><th>Run</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${browserAgent}</tbody></table>
    <h3>Visual QA And Mobile Screenshots</h3>
    <table><thead><tr><th>Screen</th><th>Breakpoint</th><th>Status</th><th>Notes</th></tr></thead><tbody>${visual}</tbody></table>
    <h3>Lighthouse MCP</h3>
    <table><thead><tr><th>Page</th><th>Device</th><th>Status</th><th>Scores</th><th>Notes</th></tr></thead><tbody>${lighthouse}</tbody></table>
    <h3>Profiler And Memory Checks</h3>
    <table><thead><tr><th>Workflow</th><th>Status</th><th>Notes</th></tr></thead><tbody>${profiler}</tbody></table>
    <h3>Natural-Language Use Cases</h3>
    <table><thead><tr><th>#</th><th>Use Case</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${useCases}</tbody></table>
  </section>`;
}

function renderReport(): string {
  const db = createDemoDatabase('2026-05-09T00:00:00.000Z');
  const evidence = readEvidence();
  const scenarios = Object.values(db.scenarios).sort((left, right) => left.title.localeCompare(right.title));
  const blueprints = Object.entries(db.scenarioBlueprints).map(([id, blueprint]) => {
    const validation = validateBlueprint(blueprint);
    return `<tr>
      <td><code>${escapeHtml(id)}</code></td>
      <td>${escapeHtml(blueprint.scenario.title)}</td>
      <td>${renderStatus(validation.valid ? 'valid' : 'invalid fixture', validation.valid || id.includes('invalid') ? 'pass' : 'fail')}</td>
      <td>${escapeHtml(validation.errors.map((item) => item.message).join('; ') || 'No errors')}</td>
    </tr>`;
  }).join('');

  const prompts = Object.values(db.originalPrompts)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((prompt) => `<tr>
      <td>${escapeHtml(prompt.scenarioId)}</td>
      <td>${escapeHtml(prompt.prompt)}</td>
      <td>${escapeHtml(prompt.genre || '')}</td>
      <td>${escapeHtml(prompt.tone || '')}</td>
    </tr>`)
    .join('');

  const accessRows = Object.values(db.contentPacks).map((pack) => `<tr>
    <td>${escapeHtml(db.games[pack.gameId]?.title || pack.gameId)}</td>
    <td>${escapeHtml(pack.title)}</td>
    <td>${escapeHtml(pack.releaseType)}</td>
    <td>${escapeHtml(pack.accessType)}</td>
    <td>${escapeHtml(pack.status)}</td>
  </tr>`).join('');

  const allCommandsPass = evidence.commands.every((item) => item.status === 'pass');
  const allUseCasesPass = evidence.naturalLanguageUseCases.length >= 20 && evidence.naturalLanguageUseCases.every((item) => item.status === 'pass');
  const allScenariosValid = scenarios.every((scenario) => validateScenarioGraph(db, scenario.id, { requireClips: true }).valid);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Completion audit report for the local VeoQuest prototype, including scenario validation, dummy media, QA evidence, Lighthouse scores, profiler findings, and follow-up risks.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%230f766e'/%3E%3Cpath d='M4 5h8l-4 7z' fill='white'/%3E%3C/svg%3E">
  <title>VeoQuest Completion Report</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f7f2; color: #18181b; }
    body { margin: 0; line-height: 1.55; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 72px; }
    header { border: 1px solid #d4d4d8; background: #fff; border-radius: 8px; padding: 28px; margin-bottom: 20px; }
    section { border: 1px solid #d4d4d8; background: #fff; border-radius: 8px; padding: 22px; margin: 18px 0; }
    h1, h2, h3, h4 { line-height: 1.15; margin: 0 0 12px; }
    h1 { font-size: 34px; }
    h2 { font-size: 24px; margin-top: 4px; }
    h3 { font-size: 18px; margin-top: 20px; }
    h4 { font-size: 15px; margin-top: 18px; color: #3f3f46; }
    p { margin: 8px 0 14px; }
    .muted { color: #71717a; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; color: #52525b; font-size: 13px; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid #d4d4d8; padding: 3px 9px; font-size: 12px; font-weight: 650; }
    .pass { background: #ecfdf5; border-color: #86efac; color: #166534; }
    .fail { background: #fff1f2; border-color: #fda4af; color: #9f1239; }
    .blocked { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 14px 0; }
    .grid div { background: #f4f4f5; border-radius: 6px; padding: 12px; }
    .grid strong { display: block; font-size: 20px; }
    .grid span { color: #52525b; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 9px; text-align: left; vertical-align: top; }
    th { background: #fafafa; color: #52525b; font-size: 12px; text-transform: uppercase; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    a { color: #0f766e; font-weight: 650; }
    @media (max-width: 720px) { main { padding: 18px 12px 48px; } header, section { padding: 16px; } table { display: block; overflow-x: auto; white-space: nowrap; } }
  </style>
</head>
<body>
<main>
  <header>
    <div class="meta">
      <span>Generated ${escapeHtml(evidence.generatedAt)}</span>
      <span>App version ${escapeHtml(appVersion.version)}</span>
      <span>Schema veoquest_database_v1</span>
    </div>
    <h1>VeoQuest Completion Report</h1>
    <p>This plain HTML report summarizes the publisher workflow, validation, dummy media, graph paths, entitlement simulation, test results, visual QA, Lighthouse findings, profiler notes, and unresolved risks for the local VeoQuest prototype.</p>
    <div class="meta">
      ${renderStatus('scenario graphs', allScenariosValid)}
      ${renderStatus('core commands', allCommandsPass)}
      ${renderStatus('20 use cases', allUseCasesPass)}
    </div>
  </header>

  <section>
    <h2>Executive Summary</h2>
    <p>The prototype ships with ${Object.keys(db.games).length} games, ${Object.keys(db.contentPacks).length} content packs, ${scenarios.length} playable scenarios, ${Object.keys(db.clips).length} deterministic dummy clips, and a locked expansion flow backed by simulated entitlements.</p>
    <p>Real Veo, real payments, real accounts, and production media delivery remain intentionally out of scope. The model boundaries are in place for those future integrations.</p>
  </section>

  <section>
    <h2>Original Prompt Inputs</h2>
    <table><thead><tr><th>Scenario</th><th>Prompt</th><th>Genre</th><th>Tone</th></tr></thead><tbody>${prompts}</tbody></table>
  </section>

  <section>
    <h2>Blueprint Validation</h2>
    <table><thead><tr><th>Blueprint</th><th>Scenario</th><th>Status</th><th>Messages</th></tr></thead><tbody>${blueprints}</tbody></table>
  </section>

  <section>
    <h2>Publishing And Entitlement Status</h2>
    <table><thead><tr><th>Game</th><th>Content Pack</th><th>Release Type</th><th>Access</th><th>Status</th></tr></thead><tbody>${accessRows}</tbody></table>
  </section>

  <section>
    <h2>Scenario, Graph, And Media Inventory</h2>
    ${scenarios.map((scenario) => renderScenario(db, scenario)).join('')}
  </section>

  ${renderEvidence(evidence)}

  <section>
    <h2>Issues, Risks, And Follow-Ups</h2>
    ${renderList(evidence.limitations)}
  </section>
</main>
</body>
</html>`;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, renderReport(), 'utf8');
console.log(`Wrote ${relative(process.cwd(), reportPath)}`);
