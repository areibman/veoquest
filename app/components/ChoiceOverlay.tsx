/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Scene } from '@/lib/sceneGraph';
import { log } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface ChoiceOverlayProps {
  scene: Scene;
  graphId: string;
  choiceVideos: Array<{ videoPath: string; targetNodeId: string }> | null;
  onChoiceSelected: (choiceIndex: number, label: string, targetNodeId: string) => void;
  onBack: () => void;
}

export default function ChoiceOverlay({
  scene,
  graphId,
  choiceVideos,
  onChoiceSelected,
  onBack,
}: ChoiceOverlayProps) {
  const handleChoice = (index: number, label: string, targetNodeId: string) => {
    log.info('Playback', 'Choice selected', {
      nodeId: scene.id,
      choiceIndex: index,
      choice: label,
      nextNodeId: targetNodeId,
    });
    onChoiceSelected(index, label, targetNodeId);
  };

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 z-50">
      <div className="max-w-3xl w-full space-y-4">
        <Card className="border-2 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl">{scene.name || 'Make Your Choice'}</CardTitle>
            {scene.notes && (
              <CardDescription className="text-base pt-2">{scene.notes}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {scene.edges && scene.edges.length > 0 ? (
              scene.edges.map((edge, index) => (
                <Button
                  key={`${edge.target}-${index}`}
                  onClick={() => handleChoice(index, edge.label || '', edge.target)}
                  variant="default"
                  size="lg"
                  className="w-full justify-between h-auto py-6 px-8 text-lg"
                >
                  <span className="text-left">{edge.label || `Choice ${index + 1}`}</span>
                  <ArrowRight className="h-6 w-6 ml-4 flex-shrink-0" />
                </Button>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No choices available. This might be a configuration error.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={onBack}
            className="bg-background/80 backdrop-blur"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Menu
          </Button>
          <p className="text-sm text-white">
            Choose wisely - your decision will shape the story
          </p>
        </div>
      </div>
    </div>
  );
}
