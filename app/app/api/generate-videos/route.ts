/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest } from 'next/server';
import { SceneGraph, SceneType, Scene } from '@/lib/sceneGraph';
import { VideoGenerationOrchestrator, GenerationProgress } from '@/lib/videoGeneration';
import { generateVideo } from '../../geminiService';
import { GenerationMode, VeoModel, AspectRatio, Resolution } from '../../types';
import { log } from '@/lib/logger';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Video } from '@google/genai';

/**
 * SSE endpoint for video generation
 * Accepts graph definition and streams progress updates
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let graphId: string = '';
      
      try {
        // Parse request body
        const body = await request.json();
        graphId = body.graphId;
        const graphData = body.graph;
        
        if (!graphId || !graphData) {
          throw new Error('Missing graphId or graph data');
        }
        
        log.info('API', 'Generation request received', {
          graphId,
          nodeCount: Object.keys(graphData.nodes).length,
        });
        
        // Validate graph
        const graph = new SceneGraph(graphData);
        graph.validate();
        
        // Send SSE helper
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sendSSE = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };
        
        // Progress callback
        const onProgress = (progress: GenerationProgress) => {
          log.debug('SSE', 'Sending progress event', {
            nodeId: progress.nodeId,
            status: progress.status,
            progress: progress.progress,
          });
          sendSSE('progress', progress);
        };
        
        // Create orchestrator
        const orchestrator = new VideoGenerationOrchestrator(graph, onProgress);
        
        // Video generation function
        const generateVideoFn = async (
          node: Scene,
          parentVideoObject?: Video,
          incomingEdgeLabel?: string
        ): Promise<{ blob: Blob; video: Video }> => {
          // Handle CHOICE nodes - generate a video for each choice option
          if (node.kind === SceneType.CHOICE) {
            if (!node.edges || node.edges.length === 0) {
              throw new Error(`CHOICE node ${node.id} has no options`);
            }

            log.video(node.id, 'Generating choice videos', {
              choiceCount: node.edges.length,
            });

            // Generate ALL choice videos concurrently
            if (!parentVideoObject) {
              throw new Error(`CHOICE node ${node.id} requires a parent video to extend from`);
            }
            
            const choiceGenerationPromises = node.edges.map(async (edge, i) => {
              const choicePrompt = edge.prompt || edge.label || '';
              
              log.video(node.id, `CHOICE_${i}_START`, {
                label: edge.label,
                prompt: choicePrompt,
              });

              // Each choice extends from the parent video
              const result = await generateVideo({
                prompt: choicePrompt,
                model: VeoModel.VEO_FAST,
                resolution: Resolution.P720,
                mode: GenerationMode.EXTEND_VIDEO,
                inputVideoObject: parentVideoObject,
              }, `${node.id}_choice_${i}`);

              // Save each choice video
              const videoDir = join(process.cwd(), 'public', 'generated-videos', graphId);
              await mkdir(videoDir, { recursive: true });
              
              const videoPath = join(videoDir, `${node.id}_choice_${i}.mp4`);
              const arrayBuffer = await result.blob.arrayBuffer();
              await writeFile(videoPath, Buffer.from(arrayBuffer));
              
              const publicPath = `/generated-videos/${graphId}/${node.id}_choice_${i}.mp4`;
              
              log.info('API', 'Choice video saved', {
                nodeId: node.id,
                choiceIndex: i,
                label: edge.label,
                path: publicPath,
                size: `${(result.blob.size / 1024 / 1024).toFixed(2)}MB`,
              });
              
              // Send video metadata back to client
              sendSSE('video_saved', {
                nodeId: node.id,
                choiceIndex: i,
                videoPath: publicPath,
                videoObject: result.video,
                targetNodeId: edge.target,
              });
              
              return { blob: result.blob, video: result.video };
            });

            // Wait for ALL choices to complete concurrently
            log.info('Concurrent', `Generating ${node.edges.length} choice videos simultaneously`, {
              nodeId: node.id,
            });
            const results = await Promise.all(choiceGenerationPromises);

            // Return the last choice's video
            const lastResult = results[results.length - 1];
            if (!lastResult) {
              throw new Error(`Failed to generate choice videos for ${node.id}`);
            }
            
            return { blob: lastResult.blob, video: lastResult.video };
          }
          
          // For ROOT and EXTENSION nodes - original logic
          // Determine prompt
          let prompt = '';
          if (node.prompt !== null && node.prompt !== undefined) {
            prompt = node.prompt;
          } else if (node.inherit_prompt && incomingEdgeLabel) {
            prompt = incomingEdgeLabel;
          }
          
          log.video(node.id, 'Determining generation parameters', {
            hasExplicitPrompt: node.prompt !== null && node.prompt !== undefined,
            inheritPrompt: node.inherit_prompt,
            incomingLabel: incomingEdgeLabel,
            finalPrompt: prompt,
          });
          
          // Handle segments (multiple 8s clips)
          const segments = node.segments || 1;
          let currentVideoObject = parentVideoObject;
          let finalBlob: Blob | null = null;
          
          for (let seg = 0; seg < segments; seg++) {
            log.video(node.id, 'SEGMENT_START', {
              segmentNum: seg + 1,
              totalSegments: segments,
            });
            
            let result;
            
            if (node.kind === SceneType.ROOT && seg === 0) {
              // First segment of root: TEXT_TO_VIDEO
              result = await generateVideo({
                prompt,
                model: VeoModel.VEO_FAST,
                aspectRatio: AspectRatio.LANDSCAPE,
                resolution: Resolution.P720,
                mode: GenerationMode.TEXT_TO_VIDEO,
              }, node.id);
            } else {
              // Extension or subsequent segments
              if (!currentVideoObject) {
                throw new Error(`No video object available for extension (node: ${node.id}, segment: ${seg})`);
              }
              
              result = await generateVideo({
                prompt: seg === 0 ? prompt : '', // Only use prompt on first segment
                model: VeoModel.VEO_FAST,
                resolution: Resolution.P720,
                mode: GenerationMode.EXTEND_VIDEO,
                inputVideoObject: currentVideoObject,
              }, node.id);
            }
            
            currentVideoObject = result.video;
            finalBlob = result.blob;
          }
          
          if (!currentVideoObject || !finalBlob) {
            throw new Error(`Failed to generate video for node ${node.id}`);
          }
          
          // Save video file to public directory
          const videoDir = join(process.cwd(), 'public', 'generated-videos', graphId);
          await mkdir(videoDir, { recursive: true });
          
          const videoPath = join(videoDir, `${node.id}.mp4`);
          const arrayBuffer = await finalBlob.arrayBuffer();
          await writeFile(videoPath, Buffer.from(arrayBuffer));
          
          const publicPath = `/generated-videos/${graphId}/${node.id}.mp4`;
          
          log.info('API', 'Video file saved', {
            nodeId: node.id,
            path: publicPath,
            size: `${(finalBlob.size / 1024 / 1024).toFixed(2)}MB`,
          });
          
          // Send video metadata back to client for storage
          sendSSE('video_saved', {
            nodeId: node.id,
            videoPath: publicPath,
            videoObject: currentVideoObject,
          });
          
          return { blob: finalBlob, video: currentVideoObject };
        };
        
        // Start cascade generation
        sendSSE('start', { graphId, totalNodes: orchestrator.getNodeStates().size });
        
        await orchestrator.startCascadeGeneration(generateVideoFn);
        
        // Send completion
        const finalStates = orchestrator.getNodeStates();
        const completed = Array.from(finalStates.values()).filter(
          s => s.status === 'complete'
        ).length;
        const errors = Array.from(finalStates.values()).filter(
          s => s.status === 'error'
        ).length;
        
        sendSSE('complete', {
          graphId,
          completedNodes: completed,
          errorNodes: errors,
        });
        
        log.info('API', 'Generation complete', {
          graphId,
          completedNodes: completed,
          errorNodes: errors,
        });
        
        controller.close();
        
      } catch (error) {
        log.error('API', 'Generation failed', error as Error, { graphId });
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const message = `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`;
        controller.enqueue(encoder.encode(message));
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

