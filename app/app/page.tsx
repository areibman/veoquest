'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  CheckCircle2,
  Edit3,
  Eye,
  Lock,
  PackagePlus,
  Play,
  RotateCcw,
  Sparkles,
  Unlock,
  Video,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { loadDatabase, resetDemoDatabase, saveDatabase } from '@/lib/veoquestStorage';
import {
  DEFAULT_SCENARIO_SETTINGS,
  cloneDatabase,
  createId,
  estimateScenarioCost,
  getScenarioAccess,
  grantContentPackEntitlement,
  nowIso,
  updateScenarioValidation,
  validateScenarioGraph,
} from '@/lib/veoquestCore';
import { ContentPack, Game, Scenario, StoryNode, VeoQuestDatabase } from '@/lib/veoquestModels';

function statusTone(status: string): string {
  if (status === 'published') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'draft') return 'border-slate-300 bg-slate-50 text-slate-700';
  if (status === 'qa') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-zinc-300 bg-zinc-50 text-zinc-700';
}

function packAccessLabel(pack: ContentPack): string {
  if (pack.accessType === 'free') return 'Free';
  if (pack.accessType === 'included') return 'Included';
  if (pack.accessType === 'purchased') return 'Purchased';
  return 'Requires access';
}

export default function Home() {
  const router = useRouter();
  const [db, setDb] = useState<VeoQuestDatabase | null>(null);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [pendingArchiveGameId, setPendingArchiveGameId] = useState<string | null>(null);

  useEffect(() => {
    setDb(loadDatabase());
  }, []);

  const games = useMemo(() => {
    if (!db) return [];
    return Object.values(db.games)
      .filter((game) => game.status !== 'archived')
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [db]);

  const stats = useMemo(() => {
    if (!db) {
      return { games: 0, scenarios: 0, packs: 0, clips: 0 };
    }
    const activeGameIds = new Set(Object.values(db.games).filter((game) => game.status !== 'archived').map((game) => game.id));
    return {
      games: activeGameIds.size,
      scenarios: Object.values(db.scenarios).filter((scenario) => activeGameIds.has(scenario.gameId) && scenario.status !== 'archived').length,
      packs: Object.values(db.contentPacks).filter((pack) => activeGameIds.has(pack.gameId) && pack.status !== 'archived').length,
      clips: Object.keys(db.clips).length,
    };
  }, [db]);

  const handleReset = () => {
    setDb(resetDemoDatabase());
    setEditingGameId(null);
    setPendingArchiveGameId(null);
  };

  const handleUnlock = (contentPackId: string) => {
    if (!db) return;
    const next = grantContentPackEntitlement(db, contentPackId);
    saveDatabase(next);
    setDb(next);
  };

  const createGameDraft = () => {
    if (!db) return;
    const next = cloneDatabase(db);
    const createdAt = nowIso();
    const gameId = createId('game', `publisher-game-${createdAt}`);
    const packId = createId('pack', `${gameId}:base`);
    const scenarioId = createId('scenario', `${gameId}:base-scenario`);
    const rootNodeId = `${scenarioId}-opening`;

    const game: Game = {
      id: gameId,
      title: 'New Publisher Game',
      description: 'Draft game container for a new interactive story release.',
      coverAssetPath: 'fake-veo31://publisher-game-placeholder',
      status: 'draft',
      defaultScenarioId: scenarioId,
      metadata: {
        contentRating: 'PG',
        visualDirection: 'Publisher placeholder art',
      },
      createdAt,
      updatedAt: createdAt,
    };
    const pack: ContentPack = {
      id: packId,
      gameId,
      title: 'Base Story Draft',
      description: 'Default free base release for the draft game.',
      releaseType: 'base_game',
      accessType: 'included',
      priceTier: 'free',
      status: 'draft',
      scenarioIds: [scenarioId],
      createdAt,
      updatedAt: createdAt,
    };
    const scenario: Scenario = {
      id: scenarioId,
      gameId,
      contentPackId: packId,
      title: 'Base Scenario Draft',
      description: 'Draft scenario for the new game container.',
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
      position: { x: 120, y: 120 },
      choiceIds: [],
      isEnding: false,
      generationType: 'create',
      status: 'no-prompt',
    };

    next.games[gameId] = game;
    next.contentPacks[packId] = pack;
    next.scenarios[scenarioId] = scenario;
    next.nodes[rootNodeId] = rootNode;
    const validated = updateScenarioValidation(next, scenarioId);
    saveDatabase(validated);
    setDb(validated);
    setEditingGameId(gameId);
    setPendingArchiveGameId(null);
  };

  const updateGame = (gameId: string, patch: Partial<Game>) => {
    if (!db) return;
    const next = cloneDatabase(db);
    const game = next.games[gameId];
    if (!game) return;
    next.games[gameId] = {
      ...game,
      ...patch,
      updatedAt: nowIso(),
    };
    next.updatedAt = next.games[gameId].updatedAt;
    saveDatabase(next);
    setDb(next);
  };

  const archiveGame = (gameId: string) => {
    if (!db) return;
    const next = cloneDatabase(db);
    const archivedAt = nowIso();
    const game = next.games[gameId];
    if (!game) return;
    next.games[gameId] = {
      ...game,
      status: 'archived',
      updatedAt: archivedAt,
    };
    for (const pack of Object.values(next.contentPacks)) {
      if (pack.gameId === gameId) {
        pack.status = 'archived';
        pack.updatedAt = archivedAt;
      }
    }
    for (const scenario of Object.values(next.scenarios)) {
      if (scenario.gameId === gameId) {
        scenario.status = 'archived';
        scenario.updatedAt = archivedAt;
      }
    }
    next.updatedAt = archivedAt;
    saveDatabase(next);
    setDb(next);
    setEditingGameId(null);
    setPendingArchiveGameId(null);
  };

  const scenariosForGame = (game: Game): Scenario[] => {
    if (!db) return [];
    return Object.values(db.scenarios)
      .filter((scenario) => scenario.gameId === game.id && scenario.status !== 'archived')
      .sort((left, right) => {
        const leftPack = db.contentPacks[left.contentPackId];
        const rightPack = db.contentPacks[right.contentPackId];
        const leftRank = leftPack?.releaseType === 'base_game' ? 0 : 1;
        const rightRank = rightPack?.releaseType === 'base_game' ? 0 : 1;
        return leftRank - rightRank || left.title.localeCompare(right.title);
      });
  };

  if (!db) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.2em] text-zinc-400">Loading catalog</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">VeoQuest</h1>
            <p className="text-sm text-zinc-600">Publisher catalog and interactive story QA</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push('/designer')} data-testid="new-scenario">
              <PackagePlus className="mr-2 h-4 w-4" />
              New Scenario
            </Button>
            <Button variant="outline" onClick={createGameDraft} data-testid="new-game">
              <PackagePlus className="mr-2 h-4 w-4" />
              New Game
            </Button>
            <Button variant="outline" onClick={() => router.push('/designer?mode=prompt')}>
              <Sparkles className="mr-2 h-4 w-4" />
              Prompt Draft
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Demo
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Games</span>
            <BarChart3 className="h-4 w-4 text-teal-700" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{stats.games}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Scenarios</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{stats.scenarios}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Content Packs</span>
            <PackagePlus className="h-4 w-4 text-indigo-700" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{stats.packs}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Dummy Clips</span>
            <Play className="h-4 w-4 text-rose-700" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{stats.clips}</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-2" data-testid="catalog">
          {games.map((game) => (
            <Card key={game.id} className="rounded-md border-zinc-200 bg-white shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  {editingGameId === game.id ? (
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={game.title}
                        onChange={(event) => updateGame(game.id, { title: event.target.value })}
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-lg font-semibold"
                        aria-label={`Game title for ${game.title}`}
                      />
                      <textarea
                        value={game.description}
                        onChange={(event) => updateGame(game.id, { description: event.target.value })}
                        className="min-h-20 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
                        aria-label={`Game description for ${game.title}`}
                      />
                      <input
                        value={game.coverAssetPath || ''}
                        onChange={(event) => updateGame(game.id, { coverAssetPath: event.target.value })}
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        aria-label={`Cover asset for ${game.title}`}
                        placeholder="fake-veo31://cover-placeholder"
                      />
                      <select
                        value={game.status}
                        onChange={(event) => updateGame(game.id, { status: event.target.value as Game['status'] })}
                        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        aria-label={`Game status for ${game.title}`}
                      >
                        <option value="draft">draft</option>
                        <option value="qa">qa</option>
                        <option value="published">published</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <CardTitle className="text-xl">{game.title}</CardTitle>
                      <p className="mt-1 text-sm text-zinc-600">{game.description}</p>
                      {game.coverAssetPath && (
                        <p className="mt-2 text-xs text-zinc-500">{game.coverAssetPath}</p>
                      )}
                    </div>
                  )}
                  <Badge className={statusTone(game.status)} variant="outline">
                    {game.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingGameId(editingGameId === game.id ? null : game.id);
                      setPendingArchiveGameId(null);
                    }}
                    aria-label={`${editingGameId === game.id ? 'Finish editing' : 'Edit game'} ${game.title}`}
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    {editingGameId === game.id ? 'Done' : 'Edit Game'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (pendingArchiveGameId === game.id) {
                        archiveGame(game.id);
                      } else {
                        setPendingArchiveGameId(game.id);
                      }
                    }}
                    aria-label={`${pendingArchiveGameId === game.id ? 'Confirm archive' : 'Archive game'} ${game.title}`}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {pendingArchiveGameId === game.id ? 'Confirm Archive' : 'Archive Game'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {scenariosForGame(game).map((scenario) => {
                  const pack = db.contentPacks[scenario.contentPackId];
                  if (!pack) return null;
                  const access = getScenarioAccess(db, scenario.id);
                  const estimate = estimateScenarioCost(db, scenario.id);
                  const locked = !access.playable && access.reason === 'locked';
                  const readyToPlay = validateScenarioGraph(db, scenario.id, { requireClips: true }).valid;

                  return (
                    <div
                      key={scenario.id}
                      className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
                      data-testid={`scenario-card-${scenario.id}`}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-medium">{scenario.title}</h2>
                            <Badge variant="outline" className={locked ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-teal-300 bg-teal-50 text-teal-800'}>
                              {locked ? <Lock className="mr-1 h-3 w-3" /> : <Unlock className="mr-1 h-3 w-3" />}
                              {locked ? access.label : packAccessLabel(pack)}
                            </Badge>
                            <Badge variant="outline" className={statusTone(scenario.status)}>
                              {scenario.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-zinc-600">{scenario.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                            <span>{estimate.clipCount} clips</span>
                            <span>{Math.ceil(estimate.totalRuntimeSeconds / 60)} min runtime</span>
                            <span>${(estimate.estimatedCostCents / 100).toFixed(2)} fake estimate</span>
                            <span>{pack.title}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/designer?scenarioId=${scenario.id}`)}
                            aria-label={`Edit ${scenario.title}`}
                          >
                            <Edit3 className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                          {locked ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/play/${scenario.id}`)}
                                aria-label={`Open locked ${scenario.title}`}
                                data-testid={`play-locked-${scenario.id}`}
                              >
                                <Lock className="mr-2 h-4 w-4" />
                                Locked
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/play/${scenario.id}?preview=publisher`)}
                                aria-label={`Preview locked ${scenario.title}`}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleUnlock(pack.id)}
                                aria-label={`Unlock ${scenario.title}`}
                                data-testid={`unlock-${scenario.id}`}
                              >
                                <Unlock className="mr-2 h-4 w-4" />
                                Unlock Story
                              </Button>
                            </>
                          ) : (
                            readyToPlay ? (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/play/${scenario.id}`)}
                                aria-label={`Play ${scenario.title}`}
                                data-testid={`play-${scenario.id}`}
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Play
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/designer?scenarioId=${scenario.id}`)}
                                aria-label={`Open builder for ${scenario.title}`}
                                data-testid={`prepare-${scenario.id}`}
                              >
                                <Video className="mr-2 h-4 w-4" />
                                Generate Clips
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>{Object.values(db.contentPacks).filter((pack) => pack.gameId === game.id && pack.status !== 'archived').length} release containers</span>
                  <span>{game.id}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
