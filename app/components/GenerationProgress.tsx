/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useEffect, useState } from 'react';
import { getGraph } from '@/lib/graphStorage';
import { log } from '@/lib/logger';
import { GenerationProgress as Progress, GenerationStatus } from '@/lib/videoGeneration';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

interface GenerationProgressProps {
  graphId: string;
  onComplete: () => void;
  onClose: () => void;
}

export default function GenerationProgress({
  graphId,
  onComplete,
  onClose,
}: GenerationProgressProps) {
  const [nodeProgress, setNodeProgress] = useState<Map<string, Progress>>(new Map());
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const graph = getGraph(graphId);
    if (!graph) {
      setErrorMessage('Graph not found');
      setHasError(true);
      return;
    }

    log.info('GenerationProgress', 'Starting video generation', {
      graphId,
      nodeCount: Object.keys(graph.graph.nodes).length,
    });

    // Use fetch with streaming for SSE
    const abortController = new AbortController();
    
    const startGeneration = async () => {
      try {
        const response = await fetch('/api/generate-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            graphId,
            graph: graph.graph,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.substring(7).trim();
              continue;
            }
            
            if (line.startsWith('data: ')) {
              const data = line.substring(6).trim();
              if (!data) continue;
              
              try {
                const parsed = JSON.parse(data);
                
                // Determine event type from previous line or data structure
                if (parsed.nodeId && parsed.status) {
                  // Progress event
                  const progress: Progress = parsed;
                  log.debug('GenerationProgress', 'Progress update received', {
                    nodeId: progress.nodeId,
                    status: progress.status,
                    progress: progress.progress,
                  });

                  setNodeProgress((prev) => {
                    const updated = new Map(prev);
                    updated.set(progress.nodeId, progress);
                    return updated;
                  });

                  if (progress.status === GenerationStatus.ERROR) {
                    setHasError(true);
                  }
                } else if (parsed.completedNodes !== undefined) {
                  // Complete event
                  log.info('GenerationProgress', 'Generation complete', parsed);
                  setIsComplete(true);
                } else if (parsed.error) {
                  // Error event
                  log.error('GenerationProgress', 'Generation error', new Error(parsed.error));
                  setHasError(true);
                  setErrorMessage(parsed.error);
                }
              } catch (e) {
                log.warn('GenerationProgress', 'Failed to parse SSE data', { line, error: e });
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          log.info('GenerationProgress', 'Generation aborted');
        } else {
          log.error('GenerationProgress', 'Generation failed', error as Error);
          setHasError(true);
          setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
        }
      }
    };

    startGeneration();

    return () => {
      abortController.abort();
    };
  }, [graphId]);

  const handleClose = () => {
    if (isComplete) {
      onComplete();
    }
    onClose();
  };

  const totalNodes = nodeProgress.size;
  const completedNodes = Array.from(nodeProgress.values()).filter(
    (p) => p.status === GenerationStatus.COMPLETE
  ).length;
  const errorNodes = Array.from(nodeProgress.values()).filter(
    (p) => p.status === GenerationStatus.ERROR
  ).length;
  const generatingNodes = Array.from(nodeProgress.values()).filter(
    (p) => p.status === GenerationStatus.GENERATING
  ).length;

  const overallProgress = totalNodes > 0 ? (completedNodes / totalNodes) * 100 : 0;

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Generating Videos</DialogTitle>
          <DialogDescription>
            {completedNodes} / {totalNodes} complete
            {generatingNodes > 0 && (
              <span className="ml-2">
                ({generatingNodes} generating...)
              </span>
            )}
            {errorNodes > 0 && (
              <span className="ml-2 text-destructive">
                ({errorNodes} errors)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <ProgressBar value={overallProgress} className={hasError ? 'bg-destructive' : ''} />

          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-4">
              {Array.from(nodeProgress.entries()).map(([nodeId, progress]) => (
                <Card key={nodeId}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{nodeId}</div>
                      <div className="flex items-center gap-2">
                        {progress.status === GenerationStatus.PENDING && (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                        {progress.status === GenerationStatus.GENERATING && (
                          <Badge variant="default" className="gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating
                          </Badge>
                        )}
                        {progress.status === GenerationStatus.COMPLETE && (
                          <Badge variant="default" className="gap-1 bg-green-500">
                            <CheckCircle2 className="h-3 w-3" />
                            Complete
                          </Badge>
                        )}
                        {progress.status === GenerationStatus.ERROR && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        )}
                      </div>
                    </div>

                    <ProgressBar 
                      value={progress.progress} 
                      className={progress.status === GenerationStatus.ERROR ? 'bg-destructive' : ''}
                    />

                    {progress.error && (
                      <p className="mt-2 text-sm text-destructive">{progress.error}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {isComplete && !hasError && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                All videos generated successfully! You can now play the game.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleClose}
            disabled={!isComplete && !hasError}
            className="w-full"
          >
            {isComplete ? 'Done' : hasError ? 'Close' : 'Generating...'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
