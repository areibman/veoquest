/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { SceneGraph, Scene, SceneType } from '@/lib/sceneGraph';
import { getGraph, getChoiceVideos } from '@/lib/graphStorage';
import {
  getSaveGame,
  createSaveGame,
  updateSaveGame,
  SaveGame,
  recordChoice,
} from '@/lib/saveGameStorage';
import { log } from '@/lib/logger';
import VideoPlayer from '@/components/VideoPlayer';
import ChoiceOverlay from '@/components/ChoiceOverlay';
import SaveGameList from '@/components/SaveGameList';

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const graphId = params?.graphId as string;
  const saveIdParam = searchParams?.get('saveId');

  const [graph, setGraph] = useState<SceneGraph | null>(null);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [saveGame, setSaveGame] = useState<SaveGame | null>(null);
  const [showSaveGameList, setShowSaveGameList] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoStartTime, setVideoStartTime] = useState<number>(0); // Timestamp to start video at
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [playingChoiceVideo, setPlayingChoiceVideo] = useState<{
    videoPath: string;
    targetNodeId: string;
    choiceLabel: string;
  } | null>(null);

  // Load graph and save game
  useEffect(() => {
    if (!graphId) return;

    const storedGraph = getGraph(graphId);
    if (!storedGraph) {
      alert('Graph not found');
      router.push('/');
      return;
    }

    if (!storedGraph.generationComplete) {
      alert('This game has not been generated yet. Please complete video generation first.');
      router.push('/');
      return;
    }

    const sceneGraph = SceneGraph.fromJSON(storedGraph.graph);
    setGraph(sceneGraph);

    // Load or create save game
    if (saveIdParam) {
      const existingSave = getSaveGame(saveIdParam);
      if (existingSave) {
        setSaveGame(existingSave);
        const scene = sceneGraph.nodes[existingSave.currentNodeId];
        setCurrentScene(scene);
        loadVideoForScene(graphId, scene);
        log.info('Playback', 'Loaded save game', {
          saveId: saveIdParam,
          currentNode: existingSave.currentNodeId,
        });
      } else {
        setShowSaveGameList(true);
      }
    } else {
      setShowSaveGameList(true);
    }
  }, [graphId, saveIdParam, router]);

  /**
   * Calculate where to start playback to skip parent content
   * Simple formula: Start at the length of the immediate parent's video
   * 
   * Example:
   * - Root (8s video) → Child starts at 0s (no parent)
   * - Extension1 (16s video, contains root) → Starts at 8s (root's video length)
   * - Extension2 (24s video, contains root+ext1) → Starts at 16s (ext1's video length)
   */
  const calculateStartTime = (scene: Scene): number => {
    if (!graph) return 0;
    
    // Find immediate parent
    const parents = graph.getParents(scene.id);
    const videoParent = parents.find(
      p => p.kind === SceneType.ROOT || p.kind === SceneType.EXTENSION || p.kind === SceneType.CHOICE
    );
    
    if (!videoParent) {
      // No parent, play from start
      return 0;
    }
    
    // Calculate parent's TOTAL video length (not just its new content)
    // This is all the content up to and including the parent
    let parentVideoLength = 0;
    let currentScene: Scene | undefined = videoParent;
    
    // Walk back from parent to root, summing durations
    while (currentScene) {
      const duration = (currentScene.kind === SceneType.CHOICE) 
        ? 8 
        : (currentScene.segments || 1) * (currentScene.duration_per_segment_sec || 8);
      parentVideoLength += duration;
      
      const grandparents = graph.getParents(currentScene.id);
      const grandparent = grandparents.find(
        p => p.kind === SceneType.ROOT || p.kind === SceneType.EXTENSION || p.kind === SceneType.CHOICE
      );
      
      if (!grandparent) break;
      currentScene = grandparent;
    }
    
    log.info('Playback', 'Calculated start time', {
      nodeId: scene.id,
      parentId: videoParent.id,
      parentVideoLength,
      startTime: parentVideoLength,
    });
    
    return parentVideoLength;
  };

  const loadVideoForScene = (gId: string, scene: Scene) => {
    const storedGraph = getGraph(gId);
    if (storedGraph && storedGraph.videoFiles[scene.id]) {
      setVideoPath(storedGraph.videoFiles[scene.id]);
      
      // Calculate where to start the video to skip parent content
      const startTime = calculateStartTime(scene);
      setVideoStartTime(startTime);
      
      log.info('Playback', 'Loading video', {
        nodeId: scene.id,
        videoPath: storedGraph.videoFiles[scene.id],
        startTime,
      });
    }
  };

  /**
   * Find the final extension in a chain before a choice/branch/end
   * Returns the last extension node that should be played
   */
  const findFinalExtensionInChain = (startScene: Scene): Scene => {
    if (!graph) return startScene;
    
    let currentScene = startScene;
    
    // Follow the chain as long as there's a single extension edge
    while (
      currentScene.edges && 
      currentScene.edges.length === 1 &&
      currentScene.kind !== SceneType.END
    ) {
      const nextNodeId = currentScene.edges[0].target;
      const nextScene = graph.nodes[nextNodeId];
      
      // Stop if we hit a choice or end
      if (nextScene.kind === SceneType.CHOICE || nextScene.kind === SceneType.END) {
        break;
      }
      
      // Continue following extensions
      if (nextScene.kind === SceneType.EXTENSION) {
        currentScene = nextScene;
      } else {
        break;
      }
    }
    
    log.debug('Playback', 'Found final extension in chain', {
      startNode: startScene.id,
      finalNode: currentScene.id,
    });
    
    return currentScene;
  };

  const handleSelectSaveGame = (save: SaveGame | 'new') => {
    if (!graph) return;

    let activeSave: SaveGame;
    if (save === 'new') {
      // Start new game from root, but find the final extension in the chain
      const root = graph.root();
      const finalExtension = findFinalExtensionInChain(root);
      
      activeSave = createSaveGame(
        graphId,
        `Save ${Date.now()}`,
        finalExtension.id,
        finalExtension.name || finalExtension.id
      );
      setCurrentScene(finalExtension);
      loadVideoForScene(graphId, finalExtension);
      log.info('Playback', 'Started new game', { 
        graphId, 
        rootId: root.id,
        playingNode: finalExtension.id 
      });
    } else {
      activeSave = save;
      const scene = graph.nodes[save.currentNodeId];
      setCurrentScene(scene);
      loadVideoForScene(graphId, scene);
      log.info('Playback', 'Loaded existing save', {
        saveId: save.id,
        currentNode: save.currentNodeId,
      });
    }

    setSaveGame(activeSave);
    setShowSaveGameList(false);
    setSessionStartTime(Date.now());
  };

  const handleVideoEnd = () => {
    if (!currentScene || !graph) return;

    log.info('Playback', 'Video ended', { 
      nodeId: currentScene.id,
      edgeCount: currentScene.edges?.length || 0,
    });

    // Check if there's a single auto-advance edge
    if (currentScene.edges && currentScene.edges.length === 1) {
      const nextNodeId = currentScene.edges[0].target;
      const nextScene = graph.nodes[nextNodeId];

      log.info('Playback', 'Auto-advancing to next scene', {
        currentNode: currentScene.id,
        nextNode: nextNodeId,
        nextNodeKind: nextScene?.kind,
        nextNodeName: nextScene?.name,
      });

      if (nextScene.kind === SceneType.CHOICE) {
        // Move to choice screen but keep video visible (paused)
        setCurrentScene(nextScene);
        // Don't clear videoPath - keep showing current video with overlay on top
        log.info('Playback', 'Showing choice overlay', { 
          choiceNodeId: nextScene.id,
          choiceName: nextScene.name,
          optionCount: nextScene.edges?.length || 0,
        });
      } else if (nextScene.kind === SceneType.END) {
        // End of game
        log.info('Playback', 'Game ended', { finalNode: nextScene.id });
        alert('Game Complete! Thanks for playing!');
        router.push('/');
      } else {
        // Should not happen since we already played the final extension
        log.warn('Playback', 'Unexpected auto-advance after final extension', {
          currentNode: currentScene.id,
          nextNode: nextScene.id,
        });
        advanceToScene(nextScene);
      }
    } else if (!currentScene.edges || currentScene.edges.length === 0) {
      // End of game
      log.info('Playback', 'Game ended', { finalNode: currentScene.id });
      alert('Game Complete! Thanks for playing.');
      router.push('/');
    } else {
      // Multiple edges - shouldn't happen for final extension
      log.error('Playback', 'Multiple edges after video end - unexpected', undefined, {
        nodeId: currentScene.id,
        edgeCount: currentScene.edges.length,
        edges: currentScene.edges,
      });
    }
  };

  const handleChoiceSelected = (choiceIndex: number, choiceLabel: string, targetNodeId: string) => {
    if (!graph || !saveGame || !currentScene) return;

    // Get the choice video for this option
    const choiceVideos = getChoiceVideos(graphId, currentScene.id);
    const choiceVideo = choiceVideos?.[choiceIndex];
    
    if (!choiceVideo) {
      log.error('Playback', 'Choice video not found', undefined, {
        nodeId: currentScene.id,
        choiceIndex,
      });
      alert('Choice video not found. Please regenerate the game.');
      return;
    }
    
    // Calculate start time for choice video (skip parent content)
    const startTime = calculateStartTime(currentScene);
    
    log.info('Playback', 'Choice selected, playing choice video', {
      nodeId: currentScene.id,
      choiceIndex,
      choiceLabel,
      videoPath: choiceVideo.videoPath,
      startTime,
      nextNodeId: targetNodeId,
    });

    // Record choice in save game
    recordChoice(saveGame.id, currentScene.id, choiceLabel);

    // Play the choice video starting at the right timestamp
    setPlayingChoiceVideo({
      videoPath: choiceVideo.videoPath,
      targetNodeId,
      choiceLabel,
    });
    setVideoPath(choiceVideo.videoPath);
    setVideoStartTime(startTime);
  };

  const handleChoiceVideoEnd = () => {
    if (!playingChoiceVideo || !graph) return;

    log.info('Playback', 'Choice video ended, advancing to child', {
      targetNodeId: playingChoiceVideo.targetNodeId,
      choiceLabel: playingChoiceVideo.choiceLabel,
    });

    // Get the immediate child after choice
    const firstChildAfterChoice = graph.nodes[playingChoiceVideo.targetNodeId];
    
    // Find the final extension in the chain
    const finalExtension = findFinalExtensionInChain(firstChildAfterChoice);
    
    log.info('Playback', 'Extension chain after choice', {
      firstChild: firstChildAfterChoice?.id,
      finalExtension: finalExtension?.id,
    });
    
    // IMPORTANT: Calculate startTime based on the FIRST child (where chain begins)
    // But PLAY the final extension's video
    const startTime = calculateStartTime(firstChildAfterChoice);
    
    setPlayingChoiceVideo(null);
    
    // Update save game
    const updatedSave = {
      ...saveGame!,
      currentNodeId: finalExtension.id,
      currentSceneName: finalExtension.name || finalExtension.id,
      playTimeSec: saveGame!.playTimeSec + Math.floor((Date.now() - sessionStartTime) / 1000),
    };
    updateSaveGame(updatedSave);
    setSaveGame(updatedSave);

    setCurrentScene(finalExtension);
    setVideoPath(getGraph(graphId)?.videoFiles[finalExtension.id] || null);
    setVideoStartTime(startTime); // Start where the first extension begins!
    setSessionStartTime(Date.now());
    
    log.info('Playback', 'Playing final extension with first child start time', {
      playingNode: finalExtension.id,
      startTime,
      firstChildInChain: firstChildAfterChoice.id,
    });
  };

  const advanceToScene = (scene: Scene) => {
    if (!saveGame) return;

    // Update save game
    const updatedSave = {
      ...saveGame,
      currentNodeId: scene.id,
      currentSceneName: scene.name || scene.id,
      playTimeSec: saveGame.playTimeSec + Math.floor((Date.now() - sessionStartTime) / 1000),
    };
    updateSaveGame(updatedSave);
    setSaveGame(updatedSave);

    setCurrentScene(scene);
    loadVideoForScene(graphId, scene);
    setSessionStartTime(Date.now());

    log.info('Playback', 'Scene transition', {
      from: currentScene?.id,
      to: scene.id,
      type: scene.kind,
    });
  };

  if (showSaveGameList) {
    return (
      <SaveGameList
        graphId={graphId}
        onSelect={handleSelectSaveGame}
        onCancel={() => router.push('/')}
      />
    );
  }

  if (!currentScene || !graph) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading...</div>
        </div>
      </div>
    );
  }

  // If playing a choice video, show video player
  if (playingChoiceVideo && videoPath) {
    return (
      <div className="min-h-screen bg-black">
        <VideoPlayer
          key={`${currentScene.id}-choice-${videoPath}`}
          videoPath={videoPath}
          scene={currentScene}
          startTime={videoStartTime}
          onVideoEnd={handleChoiceVideoEnd}
          onBack={() => router.push('/')}
        />
      </div>
    );
  }

  // Show video player with choice overlay on top
  const showChoiceOverlay = currentScene.kind === SceneType.CHOICE && !playingChoiceVideo;
  
  return (
    <div className="min-h-screen bg-black relative">
      {videoPath && (
        <VideoPlayer
          key={`${currentScene.id}-${videoPath}`}
          videoPath={videoPath}
          scene={currentScene}
          startTime={videoStartTime}
          onVideoEnd={handleVideoEnd}
          onBack={() => router.push('/')}
        />
      )}
      
      {showChoiceOverlay && (
        <ChoiceOverlay
          scene={currentScene}
          graphId={graphId}
          choiceVideos={getChoiceVideos(graphId, currentScene.id)}
          onChoiceSelected={handleChoiceSelected}
          onBack={() => router.push('/')}
        />
      )}
    </div>
  );
}

