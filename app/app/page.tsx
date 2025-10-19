'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getAllGraphs, StoredGraph } from '@/lib/graphStorage';
import { getMostRecentSaveGame, getSaveGamesForGraph } from '@/lib/saveGameStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayCircle, Plus, Edit, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [graphs, setGraphs] = useState<StoredGraph[]>([]);
  const [showGraphList, setShowGraphList] = useState(false);
  const [showPlayList, setShowPlayList] = useState(false);
  const [hasRecentSave, setHasRecentSave] = useState(false);

  useEffect(() => {
    setGraphs(getAllGraphs());
    setHasRecentSave(getMostRecentSaveGame() !== null);
  }, []);

  const handleNewGame = () => {
    router.push('/designer');
  };

  const handleEditGame = (graphId: string) => {
    router.push(`/designer?graphId=${graphId}`);
  };

  const handlePlayGame = (graphId: string) => {
    router.push(`/play/${graphId}`);
  };

  const handleContinue = () => {
    const recentSave = getMostRecentSaveGame();
    if (recentSave) {
      router.push(`/play/${recentSave.graphId}?saveId=${recentSave.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">VeoQuest</h1>
          <p className="text-lg text-muted-foreground">
            Interactive Video Game Builder
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {hasRecentSave && (
              <Button
                onClick={handleContinue}
                size="lg"
                className="w-full"
              >
                <PlayCircle className="mr-2 h-5 w-5" />
                Continue Last Game
              </Button>
            )}

            <Button
              onClick={handleNewGame}
              variant="default"
              size="lg"
              className="w-full"
            >
              <Plus className="mr-2 h-5 w-5" />
              Create New Game
            </Button>

            {graphs.length > 0 && (
              <>
                <Button
                  onClick={() => setShowGraphList(!showGraphList)}
                  variant="outline"
                  size="lg"
                  className="w-full justify-between"
                >
                  <span className="flex items-center">
                    <Edit className="mr-2 h-5 w-5" />
                    Edit Existing Game
                    <Badge variant="secondary" className="ml-2">
                      {graphs.length}
                    </Badge>
                  </span>
                  {showGraphList ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </Button>

                {showGraphList && (
                  <ScrollArea className="h-64 rounded-md border">
                    <div className="p-4 space-y-2">
                      {graphs.map((graph) => (
                        <Card
                          key={graph.id}
                          className="cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => handleEditGame(graph.id)}
                        >
                          <CardHeader className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <CardTitle className="text-base">{graph.name}</CardTitle>
                                <CardDescription className="flex items-center gap-2">
                                  <span>{Object.keys(graph.graph.nodes).length} scenes</span>
                                  {graph.generationComplete && (
                                    <Badge variant="default" className="gap-1">
                                      <CheckCircle className="h-3 w-3" />
                                      Generated
                                    </Badge>
                                  )}
                                </CardDescription>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(graph.updated).toLocaleDateString()}
                              </span>
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <Button
                  onClick={() => setShowPlayList(!showPlayList)}
                  variant="outline"
                  size="lg"
                  className="w-full justify-between"
                >
                  <span className="flex items-center">
                    <PlayCircle className="mr-2 h-5 w-5" />
                    Play Game
                  </span>
                  {showPlayList ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </Button>

                {showPlayList && (
                  <ScrollArea className="h-64 rounded-md border">
                    <div className="p-4 space-y-2">
                      {graphs.filter(g => g.generationComplete).map((graph) => {
                        const saves = getSaveGamesForGraph(graph.id);
                        return (
                          <Card
                            key={graph.id}
                            className="cursor-pointer hover:bg-accent transition-colors"
                            onClick={() => handlePlayGame(graph.id)}
                          >
                            <CardHeader className="p-4">
                              <div className="flex justify-between items-center">
                                <div className="space-y-1">
                                  <CardTitle className="text-base">{graph.name}</CardTitle>
                                  <CardDescription>
                                    {saves.length} save{saves.length !== 1 ? 's' : ''}
                                  </CardDescription>
                                </div>
                                <PlayCircle className="h-5 w-5 text-primary" />
                              </div>
                            </CardHeader>
                          </Card>
                        );
                      })}
                      {graphs.filter(g => g.generationComplete).length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                          No games with generated videos yet
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Build interactive story-driven video games with branching narratives
        </p>
      </div>
    </div>
  );
}
