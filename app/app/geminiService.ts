/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
    GoogleGenAI,
    Video,
    VideoGenerationReferenceImage,
    VideoGenerationReferenceType,
  } from '@google/genai';
  import {GenerateVideoParams, GenerationMode} from './types';
  import { log } from '@/lib/logger';
  
  // Fix: API key is now handled by process.env.GOOGLE_API_KEY, so it's removed from parameters.
  export const generateVideo = async (
    params: GenerateVideoParams,
    nodeId?: string,
  ): Promise<{objectUrl: string; blob: Blob; uri: string; video: Video}> => {
    log.video(nodeId || 'unknown', 'API_CALL_START', {
      mode: params.mode,
      prompt: params.prompt,
      hasParentVideo: !!params.inputVideoObject,
      resolution: params.resolution,
      model: params.model,
    });
  
    // Fix: API key must be obtained from process.env.GOOGLE_API_KEY as per guidelines.
    const ai = new GoogleGenAI({apiKey: process.env.GOOGLE_API_KEY});
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      numberOfVideos: 1,
      resolution: params.resolution,
    };
  
    // Conditionally add aspect ratio. It's not used for extending videos.
    if (params.mode !== GenerationMode.EXTEND_VIDEO) {
      config.aspectRatio = params.aspectRatio;
    }
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generateVideoPayload: any = {
      model: params.model,
      config: config,
    };
  
    // Only add the prompt if it's not empty, as an empty prompt might interfere with other parameters.
    if (params.prompt) {
      generateVideoPayload.prompt = params.prompt;
    }
  
    if (params.mode === GenerationMode.FRAMES_TO_VIDEO) {
      if (params.startFrame) {
        generateVideoPayload.image = {
          imageBytes: params.startFrame.base64,
          mimeType: params.startFrame.file.type,
        };
        console.log(
          `Generating with start frame: ${params.startFrame.file.name}`,
        );
      }
  
      const finalEndFrame = params.isLooping
        ? params.startFrame
        : params.endFrame;
      if (finalEndFrame) {
        generateVideoPayload.config.lastFrame = {
          imageBytes: finalEndFrame.base64,
          mimeType: finalEndFrame.file.type,
        };
        if (params.isLooping) {
          console.log(
            `Generating a looping video using start frame as end frame: ${finalEndFrame.file.name}`,
          );
        } else {
          console.log(`Generating with end frame: ${finalEndFrame.file.name}`);
        }
      }
    } else if (params.mode === GenerationMode.REFERENCES_TO_VIDEO) {
      const referenceImagesPayload: VideoGenerationReferenceImage[] = [];
  
      if (params.referenceImages) {
        for (const img of params.referenceImages) {
          console.log(`Adding reference image: ${img.file.name}`);
          referenceImagesPayload.push({
            image: {
              imageBytes: img.base64,
              mimeType: img.file.type,
            },
            referenceType: VideoGenerationReferenceType.ASSET,
          });
        }
      }
  
      if (params.styleImage) {
        console.log(
          `Adding style image as a reference: ${params.styleImage.file.name}`,
        );
        referenceImagesPayload.push({
          image: {
            imageBytes: params.styleImage.base64,
            mimeType: params.styleImage.file.type,
          },
          referenceType: VideoGenerationReferenceType.STYLE,
        });
      }
  
      if (referenceImagesPayload.length > 0) {
        generateVideoPayload.config.referenceImages = referenceImagesPayload;
      }
    } else if (params.mode === GenerationMode.EXTEND_VIDEO) {
      if (params.inputVideoObject) {
        generateVideoPayload.video = params.inputVideoObject;
        console.log(`Generating extension from input video object.`);
      } else {
        throw new Error('An input video object is required to extend a video.');
      }
    }
  
    log.debug('Gemini', 'Submitting video generation request', {
      nodeId: nodeId || 'unknown',
      model: params.model,
      hasPrompt: !!generateVideoPayload.prompt,
    });
    
    let operation = await ai.models.generateVideos(generateVideoPayload);
    const opWithName = operation as { operation?: { name?: string } };
    log.info('Gemini', 'Operation started', {
      nodeId: nodeId || 'unknown',
      operationName: opWithName.operation?.name || 'unknown',
    });
  
    let pollAttempt = 0;
    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      pollAttempt++;
      const opWithNamePoll = operation as { operation?: { name?: string } };
      log.debug('Gemini', 'Polling operation', {
        nodeId: nodeId || 'unknown',
        attempt: pollAttempt,
        operationName: opWithNamePoll.operation?.name || 'unknown',
      });
      operation = await ai.operations.getVideosOperation({operation: operation});
    }
  
    if (operation?.response) {
      const videos = operation.response.generatedVideos;
  
      if (!videos || videos.length === 0) {
        throw new Error('No videos were generated.');
      }
  
      const firstVideo = videos[0];
      if (!firstVideo?.video?.uri) {
        throw new Error('Generated video is missing a URI.');
      }
      const videoObject = firstVideo.video;
  
      const url = decodeURIComponent(videoObject.uri || '');
      log.debug('Gemini', 'Fetching video from URL', {
        nodeId: nodeId || 'unknown',
        uri: url.substring(0, 100) + '...',
      });
  
      // Fix: The API key for fetching the video must also come from process.env.GOOGLE_API_KEY.
      const apiKey = process.env.GOOGLE_API_KEY || '';
      const res = await fetch(`${url}&key=${apiKey}`);
  
      if (!res.ok) {
        throw new Error(`Failed to fetch video: ${res.status} ${res.statusText}`);
      }
  
      const videoBlob = await res.blob();
      const objectUrl = URL.createObjectURL(videoBlob);
  
      log.video(nodeId || 'unknown', 'API_CALL_COMPLETE', {
        videoUri: videoObject.uri,
        blobSize: `${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`,
      });
  
      return {objectUrl, blob: videoBlob, uri: url, video: videoObject};
    } else {
      log.error('Gemini', 'Operation failed - no videos generated', undefined, {
        nodeId: nodeId || 'unknown',
        operation: operation,
      });
      throw new Error('No videos generated.');
    }
  };
  