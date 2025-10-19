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
   * Calculate the cumulative duration of parent videos
   * This tells us where to start playback to avoid repetition
   */
  const calculateParentDuration = (scene: Scene): number => {
    if (!graph) return 0;
    
    let totalDuration = 0;
    let currentScene: Scene | undefined = scene;
    
    // Walk backwards through parents to calculate total duration
    while (currentScene) {
      const parents = graph.getParents(currentScene.id);
      const videoParent = parents.find(
        p => p.kind === SceneType.ROOT || p.kind === SceneType.EXTENSION || p.kind === SceneType.CHOICE
      );
      
      if (!videoParent) break;
      
      // Add parent's duration
      const parentDuration = (videoParent.segments || 1) * (videoParent.duration_per_segment_sec || 8);
      totalDuration += parentDuration;
      
      currentScene = videoParent;
    }
    
    log.debug('Playback', 'Calculated parent duration', {
      nodeId: scene.id,
      parentDuration: totalDuration,
    });
    
    return totalDuration;
  };

  const loadVideoForScene = (gId: string, scene: Scene) => {
    const storedGraph = getGraph(gId);
    if (storedGraph && storedGraph.videoFiles[scene.id]) {
      setVideoPath(storedGraph.videoFiles[scene.id]);
      
      // Calculate where to start the video to skip parent content
      const startTime = calculateParentDuration(scene);
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

    log.info('Playback', 'Video ended', { nodeId: currentScene.id });

    // Check if there's a single auto-advance edge
    if (currentScene.edges && currentScene.edges.length === 1) {
      const nextNodeId = currentScene.edges[0].target;
      const nextScene = graph.nodes[nextNodeId];

      if (nextScene.kind === SceneType.CHOICE) {
        // Move to choice screen but keep video visible (paused)
        setCurrentScene(nextScene);
        // Don't clear videoPath - keep showing current video with overlay on top
        log.info('Playback', 'Moving to choice', { choiceNodeId: nextScene.id });
      } else if (nextScene.kind === SceneType.END) {
        // End of game
        log.info('Playback', 'Game ended', { finalNode: nextScene.id });
        alert('Game Complete! Thanks for playing.');
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
    const startTime = calculateParentDuration(currentScene);
    
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
    });

    // Now advance to the child node (or final extension in chain)
    const nextScene = graph.nodes[playingChoiceVideo.targetNodeId];
    const finalExtension = findFinalExtensionInChain(nextScene);
    
    setPlayingChoiceVideo(null);
    advanceToScene(finalExtension);
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

