'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Lock, RefreshCw, RotateCcw } from 'lucide-react';

import SimulatedVideoClip from '@/components/SimulatedVideoClip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildPathSummary,
  createPlaythrough,
  getChoicesForNode,
  getLatestPlaythrough,
  getScenarioAccess,
  grantContentPackEntitlement,
  restartPlaythrough,
  selectChoice,
} from '@/lib/veoquestCore';
import { loadDatabase, saveDatabase } from '@/lib/veoquestStorage';
import { Choice, Playthrough, VeoQuestDatabase } from '@/lib/veoquestModels';

function PlayPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenarioId = params?.graphId as string;
  const publisherPreview = searchParams?.get('preview') === 'publisher';

  const [db, setDb] = useState<VeoQuestDatabase | null>(null);
  const [playthrough, setPlaythrough] = useState<Playthrough | null>(null);
  const [showChoices, setShowChoices] = useState(false);
  const [showEnding, setShowEnding] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [activeChoiceIndex, setActiveChoiceIndex] = useState(0);
  const [fastMode, setFastMode] = useState(false);

  useEffect(() => {
    let loaded = loadDatabase();
    const scenario = loaded.scenarios[scenarioId];
    if (!scenario) {
      setDb(loaded);
      return;
    }

    const access = getScenarioAccess(loaded, scenarioId, { publisherPreview });
    if (access.playable) {
      const latest = getLatestPlaythrough(loaded, scenarioId);
      if (latest) {
        setPlaythrough(latest);
        setShowEnding(latest.status === 'completed');
      } else {
        const created = createPlaythrough(loaded, scenarioId);
        loaded = created.db;
        saveDatabase(loaded);
        setPlaythrough(created.playthrough);
      }
    }

    setFastMode(window.localStorage.getItem('veoquest_test_fast') === '1');
    setDb(loaded);
  }, [publisherPreview, scenarioId]);

  const scenario = db?.scenarios[scenarioId] || null;
  const currentNode = db && playthrough ? db.nodes[playthrough.currentNodeId] : null;
  const clip = currentNode?.clipId && db ? db.clips[currentNode.clipId] : null;
  const choices = useMemo(() => (db && currentNode ? getChoicesForNode(db, currentNode.id) : []), [db, currentNode]);
  const access = db && scenario ? getScenarioAccess(db, scenario.id, { publisherPreview }) : null;
  const endingActive = showEnding || playthrough?.status === 'completed' || currentNode?.isEnding || false;

  const persist = (next: VeoQuestDatabase, nextPlaythrough?: Playthrough) => {
    saveDatabase(next);
    setDb(next);
    if (nextPlaythrough) {
      setPlaythrough(nextPlaythrough);
    }
  };

  const handleDecisionReady = useCallback(() => {
    if (choices.length > 0 && !endingActive) {
      setShowChoices(true);
    }
  }, [choices.length, endingActive]);

  const handleClipEnded = useCallback(() => {
    if (!currentNode) return;
    if (currentNode.isEnding || choices.length === 0) {
      setShowChoices(false);
      setShowEnding(true);
    } else {
      setShowChoices(true);
    }
  }, [choices.length, currentNode]);

  const choose = useCallback((choice: Choice) => {
    if (!db || !playthrough || selectedChoiceId) return;
    setSelectedChoiceId(choice.id);
    window.setTimeout(() => {
      try {
        const targetIsEnding = Boolean(db.nodes[choice.targetNodeId]?.isEnding);
        const updated = selectChoice(db, playthrough.id, choice.id);
        persist(updated.db, updated.playthrough);
        setShowChoices(false);
        setShowEnding(targetIsEnding);
        setSelectedChoiceId(null);
        setActiveChoiceIndex(0);
      } catch {
        setSelectedChoiceId(null);
      }
    }, 180);
  }, [db, playthrough, selectedChoiceId]);

  useEffect(() => {
    if (!showChoices || choices.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveChoiceIndex((index) => (index + 1) % choices.length);
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveChoiceIndex((index) => (index - 1 + choices.length) % choices.length);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(choices[activeChoiceIndex]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeChoiceIndex, choose, choices, showChoices]);

  const handleRestart = () => {
    if (!db || !playthrough) return;
    const restarted = restartPlaythrough(db, playthrough.id);
    persist(restarted.db, restarted.playthrough);
    setShowChoices(false);
    setShowEnding(false);
    setSelectedChoiceId(null);
    setActiveChoiceIndex(0);
  };

  const handleUnlock = () => {
    if (!db || !scenario) return;
    const next = grantContentPackEntitlement(db, scenario.contentPackId);
    saveDatabase(next);
    setDb(next);
    const created = createPlaythrough(next, scenario.id);
    persist(created.db, created.playthrough);
  };

  if (!db || !scenario) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Loading scenario
        </div>
      </main>
    );
  }

  if (!access?.playable) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <section className="w-full max-w-md rounded-md border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur">
          <Lock className="mb-4 h-8 w-8 text-rose-300" />
          <h1 className="text-2xl font-semibold">{scenario.title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/70">{scenario.description}</p>
          <Badge className="mt-4 border-rose-300 bg-rose-950 text-rose-100" variant="outline">
            {access?.label || 'Locked'}
          </Badge>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={handleUnlock} data-testid="locked-unlock">
              Unlock Story
            </Button>
            <Button variant="outline" onClick={() => router.push('/')} className="border-white/30 bg-transparent text-white hover:bg-white hover:text-zinc-950">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Catalog
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (!playthrough || !currentNode || (!clip && !endingActive)) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <section className="w-full max-w-md rounded-md border border-white/15 bg-white/10 p-6 text-center">
          <h1 className="text-xl font-semibold">Scenario is not ready for playback</h1>
          <p className="mt-2 text-sm text-white/70">Generate dummy clips in the builder before playtesting this route.</p>
          <Button className="mt-5" onClick={() => router.push(`/designer?scenarioId=${scenario.id}`)}>
            Open Builder
          </Button>
        </section>
      </main>
    );
  }

  const pathSummary = buildPathSummary(db, playthrough);

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white" data-testid="player">
      {!endingActive && clip && (
        <SimulatedVideoClip
          key={`${clip.id}-${playthrough.currentNodeId}`}
          clip={clip}
          node={currentNode}
          paused={false}
          fast={fastMode}
          onDecisionReady={handleDecisionReady}
          onEnded={handleClipEnded}
        />
      )}

      <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2 sm:left-6 sm:top-6">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="border-white/30 bg-black/30 text-white hover:bg-white hover:text-zinc-950"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Catalog
        </Button>
        <Button
          variant="outline"
          onClick={handleRestart}
          className="border-white/30 bg-black/30 text-white hover:bg-white hover:text-zinc-950"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart
        </Button>
        {publisherPreview && (
          <Badge className="border-amber-300 bg-amber-950/80 text-amber-100" variant="outline">
            Publisher preview
          </Badge>
        )}
      </div>

      {showChoices && !endingActive && choices.length > 0 && (
        <section className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-24 sm:px-6 sm:pb-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex items-center gap-2 text-sm text-white/70">
              <CheckCircle2 className="h-4 w-4 text-teal-300" />
              Decision point
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {choices.map((choice, index) => (
                <button
                  key={choice.id}
                  type="button"
                  onMouseEnter={() => setActiveChoiceIndex(index)}
                  onFocus={() => setActiveChoiceIndex(index)}
                  onClick={() => choose(choice)}
                  className={`min-h-24 rounded-md border p-4 text-left transition ${selectedChoiceId === choice.id
                      ? 'border-teal-200 bg-teal-400 text-zinc-950'
                      : activeChoiceIndex === index
                        ? 'border-white bg-white text-zinc-950'
                        : 'border-white/20 bg-white/10 text-white hover:border-white hover:bg-white hover:text-zinc-950'
                    }`}
                  data-testid={`choice-${index}`}
                >
                  <div className="text-base font-semibold">{choice.label}</div>
                  <div className="mt-1 text-sm opacity-75">{choice.description}</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {endingActive && (
        <section className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950 p-4">
          <div className="w-full max-w-2xl rounded-md border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur">
            <Badge className="border-teal-300 bg-teal-950 text-teal-100" variant="outline">
              Ending reached
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold">{currentNode.title}</h1>
            <p className="mt-3 text-white/70">{currentNode.description || scenario.description}</p>
            <div className="mt-6 rounded-md border border-white/10 bg-black/25 p-4">
              <div className="mb-3 text-sm font-medium text-white/70">Path Taken</div>
              <div className="flex flex-wrap gap-2">
                {pathSummary.map((item, index) => (
                  <Badge key={`${item}-${index}`} variant="outline" className="border-white/20 bg-white/10 text-white">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={handleRestart}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Replay
              </Button>
              <Button variant="outline" onClick={() => router.push('/')} className="border-white/30 bg-transparent text-white hover:bg-white hover:text-zinc-950">
                Catalog
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Loading scenario
      </main>
    }>
      <PlayPageContent />
    </Suspense>
  );
}
