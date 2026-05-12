'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

import { Clip, StoryNode } from '@/lib/veoquestModels';
import { Button } from '@/components/ui/button';

interface SimulatedVideoClipProps {
  clip: Clip;
  node: StoryNode;
  paused: boolean;
  fast?: boolean;
  onDecisionReady: () => void;
  onEnded: () => void;
}

export default function SimulatedVideoClip({
  clip,
  node,
  paused,
  fast = false,
  onDecisionReady,
  onEnded,
}: SimulatedVideoClipProps) {
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const elapsedMs = useRef(0);
  const decisionSent = useRef(false);
  const endedSent = useRef(false);
  const clipDurationSeconds = Number.isFinite(clip.durationSeconds) && clip.durationSeconds > 0
    ? clip.durationSeconds
    : 1;
  const durationMs = fast ? Math.max(300, Math.min(900, clipDurationSeconds * 180)) : clipDurationSeconds * 1000;
  const decisionAtMs = Math.max(durationMs * 0.65, durationMs - 900);
  const effectivePaused = paused || manuallyPaused;
  const [primary, secondary] = clip.metadata.palette;

  const background = useMemo(() => {
    return {
      backgroundImage: `
        radial-gradient(circle at 20% 20%, ${secondary}88, transparent 28%),
        linear-gradient(135deg, ${primary}, #09090b 48%, ${secondary})
      `,
    };
  }, [primary, secondary]);

  useEffect(() => {
    elapsedMs.current = 0;
    decisionSent.current = false;
    endedSent.current = false;
    setManuallyPaused(false);
  }, [clip.id, clipDurationSeconds]);

  useEffect(() => {
    if (effectivePaused || endedSent.current) return;

    let frameId = 0;
    const startedAt = performance.now() - elapsedMs.current;
    const tick = () => {
      elapsedMs.current = Math.min(durationMs, performance.now() - startedAt);
      if (elapsedMs.current >= decisionAtMs && !decisionSent.current) {
        decisionSent.current = true;
        onDecisionReady();
      }
      if (elapsedMs.current >= durationMs && !endedSent.current) {
        endedSent.current = true;
        onEnded();
        return;
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [decisionAtMs, durationMs, effectivePaused, onDecisionReady, onEnded]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-zinc-950 text-white">
      <div
        className="absolute inset-0 scale-110 opacity-90 motion-safe:animate-[veoquest-pan_12s_ease-in-out_infinite_alternate]"
        style={background}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/80" />

      <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-4 sm:left-6 sm:right-6 sm:top-6">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-white/70">Fake Veo 3.1 Clip</div>
          <h1 className="mt-2 max-w-4xl text-2xl font-semibold tracking-normal sm:text-4xl">{node.title}</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setManuallyPaused((value) => !value)}
          className="border-white/30 bg-black/30 text-white hover:bg-white hover:text-zinc-950"
          aria-label={manuallyPaused ? 'Play clip' : 'Pause clip'}
        >
          {manuallyPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
        <p className="max-w-3xl text-sm leading-6 text-white/80 sm:text-base">{node.description || clip.prompt}</p>
      </div>
    </div>
  );
}
