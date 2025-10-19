/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import { Scene } from '@/lib/sceneGraph';
import { log } from '@/lib/logger';

interface VideoPlayerProps {
  videoPath: string;
  scene: Scene;
  startTime?: number; // Timestamp to start video at (to skip parent content)
  onVideoEnd: () => void;
  onBack: () => void;
}

export default function VideoPlayer({
  videoPath,
  scene,
  startTime = 0,
  onVideoEnd,
  onBack,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Simple, single-purpose effect for seeking and playing
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    log.info('Playback', 'Initializing video', {
      nodeId: scene.id,
      videoPath,
      startTime,
    });

    const initializeAndPlay = () => {
      log.info('Playback', 'Video ready to initialize', {
        nodeId: scene.id,
        readyState: video.readyState,
        currentTime: video.currentTime,
      });
      
      // Set start time if needed
      if (startTime > 0 && video.currentTime < startTime) {
        log.info('Playback', 'Seeking to start time', {
          nodeId: scene.id,
          from: video.currentTime,
          to: startTime,
        });
        
        video.currentTime = startTime;
        
        // After seeking, poll readyState until ready, then play
        let playAttempted = false;
        let pollAttempts = 0;
        
        const tryPlayWhenReady = () => {
          if (playAttempted) return;
          pollAttempts++;
          
          log.debug('Playback', `Checking readyState after seek (attempt ${pollAttempts})`, {
            nodeId: scene.id,
            readyState: video.readyState,
            currentTime: video.currentTime,
          });
          
          if (video.readyState >= 3 || pollAttempts >= 50) {
            // Ready to play (or gave up waiting)
            playAttempted = true;
            
            if (pollAttempts >= 50) {
              log.warn('Playback', 'Max poll attempts reached, playing anyway', {
                nodeId: scene.id,
                readyState: video.readyState,
              });
            } else {
              log.info('Playback', 'Ready after seek, attempting to play', {
                nodeId: scene.id,
                readyState: video.readyState,
                pollAttempts,
              });
            }
            
            video.play()
              .then(() => {
                log.info('Playback', 'Playback started successfully', {
                  nodeId: scene.id,
                  currentTime: video.currentTime,
                });
              })
              .catch((error) => {
                log.error('Playback', 'Play failed', error, {
                  nodeId: scene.id,
                  currentTime: video.currentTime,
                  readyState: video.readyState,
                });
              });
          } else {
            // Not ready yet, check again in 100ms
            setTimeout(tryPlayWhenReady, 100);
          }
        };
        
        // Start polling after a short delay to let seek initiate
        setTimeout(tryPlayWhenReady, 100);
      } else {
        // No seeking needed, play immediately
        log.info('Playback', 'Playing from start', {
          nodeId: scene.id,
        });
        
        video.play()
          .then(() => {
            log.info('Playback', 'Playback started successfully', {
              nodeId: scene.id,
            });
          })
          .catch((error) => {
            log.error('Playback', 'Play failed', error, { nodeId: scene.id });
          });
      }
    };

    // Always wait for canplaythrough - don't trust readyState checks
    // This ensures video is fully buffered and ready to play
    log.info('Playback', 'Waiting for video to be ready', { 
      nodeId: scene.id, 
      readyState: video.readyState 
    });
    
    video.addEventListener('canplaythrough', initializeAndPlay, { once: true });

    return () => {
      video.removeEventListener('canplaythrough', initializeAndPlay);
    };
  }, [videoPath, scene.id, startTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      log.debug('Playback', 'Play event', { nodeId: scene.id });
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      log.warn('Playback', 'Pause event triggered', { 
        nodeId: scene.id,
        currentTime: video.currentTime,
        stackTrace: new Error().stack,
      });
      setIsPlaying(false);
    };
    
    const handleSeeking = () => {
      log.warn('Playback', 'Seeking event (unexpected)', {
        nodeId: scene.id,
        currentTime: video.currentTime,
        seeking: video.seeking,
      });
    };
    
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    
    const handleEnded = () => {
      log.info('Playback', 'Video ended naturally', { nodeId: scene.id });
      onVideoEnd();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onVideoEnd, scene.id]);

  const handleMouseMove = () => {
    setShowControls(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="relative w-full h-screen bg-black flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={videoPath}
        className="w-full h-full object-contain"
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />

      {/* Overlay Controls */}
      <div
        className={`absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-black/50 text-white rounded hover:bg-black/70 backdrop-blur"
          >
            ← Back
          </button>
          <div className="text-white bg-black/50 px-4 py-2 rounded backdrop-blur">
            {scene.name || scene.id}
          </div>
        </div>

        {/* Center Play/Pause Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={togglePlayPause}
            className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all"
          >
            {isPlaying ? (
              <div className="flex gap-2">
                <div className="w-3 h-10 bg-white rounded"></div>
                <div className="w-3 h-10 bg-white rounded"></div>
              </div>
            ) : (
              <div className="w-0 h-0 border-l-[20px] border-l-white border-y-[15px] border-y-transparent ml-2"></div>
            )}
          </button>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {/* Progress Bar */}
          <div className="mb-4">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={(e) => {
                const video = videoRef.current;
                if (video) {
                  video.currentTime = parseFloat(e.target.value);
                }
              }}
              className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <div className="flex justify-between text-sm text-white mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={togglePlayPause}
              className="px-6 py-3 bg-white/20 backdrop-blur text-white rounded hover:bg-white/30"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <button
              onClick={toggleFullscreen}
              className="px-6 py-3 bg-white/20 backdrop-blur text-white rounded hover:bg-white/30"
            >
              Fullscreen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
