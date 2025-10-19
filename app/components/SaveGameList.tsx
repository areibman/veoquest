/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useEffect } from 'react';
import { SaveGame, getSaveGamesForGraph, deleteSaveGame } from '@/lib/saveGameStorage';
import { log } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Plus, Trash2, Clock } from 'lucide-react';

interface SaveGameListProps {
  graphId: string;
  onSelect: (save: SaveGame | 'new') => void;
  onCancel: () => void;
}

export default function SaveGameList({
  graphId,
  onSelect,
  onCancel,
}: SaveGameListProps) {
  const [saves, setSaves] = useState<SaveGame[]>([]);

  useEffect(() => {
    const savedGames = getSaveGamesForGraph(graphId);
    setSaves(savedGames);
    log.info('SaveGameList', 'Loaded save games', {
      graphId,
      count: savedGames.length,
    });
  }, [graphId]);

  const handleDelete = (saveId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (confirm('Are you sure you want to delete this save?')) {
      deleteSaveGame(saveId);
      setSaves(saves.filter((s) => s.id !== saveId));
      log.info('SaveGameList', 'Deleted save game', { saveId });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatPlayTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-4">
        <Button
          variant="outline"
          onClick={onCancel}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Menu
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Load Game</CardTitle>
            <CardDescription>Start a new game or continue from a saved game</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* New Game Button */}
            <Button
              onClick={() => onSelect('new')}
              variant="default"
              size="lg"
              className="w-full justify-between"
            >
              <span className="flex items-center">
                <Plus className="mr-2 h-5 w-5" />
                Start New Game
              </span>
            </Button>

            {/* Existing Saves */}
            {saves.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Saved Games</h3>
                <ScrollArea className="h-96 rounded-md border">
                  <div className="p-4 space-y-2">
                    {saves.map((save) => (
                      <Card
                        key={save.id}
                        className="cursor-pointer hover:bg-accent transition-colors group"
                        onClick={() => onSelect(save)}
                      >
                        <CardHeader className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">{save.slotName}</CardTitle>
                                {save.playTimeSec > 0 && (
                                  <Badge variant="secondary" className="gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatPlayTime(save.playTimeSec)}
                                  </Badge>
                                )}
                              </div>
                              <CardDescription>
                                Current: {save.currentSceneName}
                              </CardDescription>
                              <p className="text-xs text-muted-foreground">
                                Last played: {formatDate(save.updated)}
                              </p>
                              {save.choiceHistory.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {save.choiceHistory.length} choice
                                  {save.choiceHistory.length !== 1 ? 's' : ''} made
                                </p>
                              )}
                            </div>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={(e) => handleDelete(save.id, e)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No saved games yet.</p>
                <p className="text-sm mt-2">Start a new game to begin!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
