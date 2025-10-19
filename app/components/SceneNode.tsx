/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { Handle, Position } from 'reactflow';
import { Scene, SceneType } from '@/lib/sceneGraph';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

export type NodeGenerationStatus = 'idle' | 'pending' | 'generating' | 'complete' | 'error';

interface SceneNodeProps {
  data: Scene & {
    generationStatus?: NodeGenerationStatus;
    generationError?: string;
  };
}

export default function SceneNode({ data }: SceneNodeProps) {
  const generationStatus = data.generationStatus || 'idle';
  
  const getNodeStyle = (type: SceneType) => {
    switch (type) {
      case SceneType.ROOT:
        return 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-950 dark:border-purple-700 dark:text-purple-100';
      case SceneType.EXTENSION:
        return 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-100';
      case SceneType.CHOICE:
        return 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-100';
      case SceneType.END:
        return 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950 dark:border-red-700 dark:text-red-100';
      default:
        return 'bg-gray-50 border-gray-300 text-gray-900 dark:bg-gray-950 dark:border-gray-700 dark:text-gray-100';
    }
  };

  const getStatusIcon = () => {
    switch (generationStatus) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'generating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const showVideoInfo = data.kind === SceneType.ROOT || data.kind === SceneType.EXTENSION || data.kind === SceneType.CHOICE;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 ${getNodeStyle(
        data.kind
      )} shadow-md min-w-[180px] relative`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3"
      />

      {/* Status Icon in top-right corner */}
      {generationStatus !== 'idle' && (
        <div className="absolute top-2 right-2">
          {getStatusIcon()}
        </div>
      )}

      <div className="font-bold text-xs uppercase opacity-70 mb-1">{data.kind}</div>
      <div className="text-base font-semibold mb-2 pr-6">
        {data.name || data.id}
      </div>

      {/* Show generation status text for video nodes */}
      {showVideoInfo && generationStatus !== 'idle' && (
        <div className="text-xs mb-2 font-medium">
          {generationStatus === 'pending' && <span className="text-gray-600">Waiting...</span>}
          {generationStatus === 'generating' && <span className="text-blue-600">Generating...</span>}
          {generationStatus === 'complete' && <span className="text-green-600">Complete!</span>}
          {generationStatus === 'error' && (
            <span className="text-red-600" title={data.generationError}>
              Error
            </span>
          )}
        </div>
      )}

      {showVideoInfo && (
        <div className="text-xs space-y-1 border-t border-current/20 pt-2 opacity-80">
          {data.kind === SceneType.CHOICE ? (
            <div>{data.edges?.length || 0} choice option{(data.edges?.length || 0) !== 1 ? 's' : ''}</div>
          ) : (
            <div>Segments: {data.segments || 1}</div>
          )}
          {data.kind !== SceneType.CHOICE && (
            <>
              {data.prompt !== null && data.prompt !== undefined ? (
                <div className="truncate" title={data.prompt}>
                  Prompt: &quot;{data.prompt.substring(0, 30)}
                  {data.prompt.length > 30 ? '...' : ''}&quot;
                </div>
              ) : data.inherit_prompt ? (
                <div className="italic opacity-70">Inherits prompt</div>
              ) : (
                <div className="italic opacity-70">No prompt</div>
              )}
            </>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3"
      />
    </div>
  );
}

