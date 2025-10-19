/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { Scene, SceneType } from '@/lib/sceneGraph';
import { log } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { X, Save, Plus, Trash2 } from 'lucide-react';

interface NodeEditorProps {
  node: Node;
  onUpdate: (node: Node) => void;
  onClose: () => void;
}

export default function NodeEditor({ node, onUpdate, onClose }: NodeEditorProps) {
  const scene = node.data as Scene;
  const [name, setName] = useState(scene.name || '');
  const [prompt, setPrompt] = useState(scene.prompt || '');
  const [segments, setSegments] = useState(scene.segments || 1);
  const [inheritPrompt, setInheritPrompt] = useState(scene.inherit_prompt || false);
  const [choiceOptions, setChoiceOptions] = useState<Array<{label: string; prompt: string}>>(
    scene.edges?.map(e => ({ label: e.label || '', prompt: e.prompt || '' })) || []
  );

  useEffect(() => {
    setName(scene.name || '');
    setPrompt(scene.prompt || '');
    setSegments(scene.segments || 1);
    setInheritPrompt(scene.inherit_prompt || false);
    setChoiceOptions(scene.edges?.map(e => ({ label: e.label || '', prompt: e.prompt || '' })) || []);
  }, [scene]);

  const handleSave = () => {
    const updatedScene: Scene = {
      ...scene,
      name: name || scene.id,
      prompt: prompt || null,
      segments,
      inherit_prompt: inheritPrompt,
    };

    onUpdate({
      ...node,
      data: updatedScene,
    });
  };

  const handleSaveChoiceOptions = () => {
    // Store choice options in the scene data
    // Don't modify edges here - they'll be created when user connects nodes in ReactFlow
    // The save graph logic will merge these choice options with ReactFlow edges
    const updatedScene: Scene = {
      ...scene,
      name: name || scene.id,
      // Store choice options as metadata
      edges: choiceOptions.map((option, index) => {
        // Keep existing target if edge is already connected, otherwise use placeholder
        const existingEdge = scene.edges?.find(e => {
          // Try to match by index or label
          return scene.edges?.indexOf(e) === index;
        });
        
        return {
          target: existingEdge?.target || '',
          label: option.label,
          prompt: option.prompt,
        };
      }),
    };

    onUpdate({
      ...node,
      data: updatedScene,
    });
    
    log.info('NodeEditor', 'Saved choice options', {
      nodeId: scene.id,
      optionCount: choiceOptions.length,
    });
  };

  const updateChoiceOption = (index: number, field: 'label' | 'prompt', value: string) => {
    const updated = [...choiceOptions];
    if (!updated[index]) {
      updated[index] = { label: '', prompt: '' };
    }
    updated[index][field] = value;
    setChoiceOptions(updated);
  };

  const addChoiceOption = () => {
    setChoiceOptions([...choiceOptions, { label: '', prompt: '' }]);
  };

  const removeChoiceOption = (index: number) => {
    const updated = choiceOptions.filter((_, i) => i !== index);
    setChoiceOptions(updated);
  };

  const showVideoFields =
    scene.kind === SceneType.ROOT || scene.kind === SceneType.EXTENSION;

  const getSceneTypeColor = (type: SceneType) => {
    switch (type) {
      case SceneType.ROOT:
        return 'bg-purple-500';
      case SceneType.EXTENSION:
        return 'bg-blue-500';
      case SceneType.CHOICE:
        return 'bg-yellow-500';
      case SceneType.END:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Edit Scene</h2>
          <Badge className={`mt-2 ${getSceneTypeColor(scene.kind)}`}>
            {scene.kind.toUpperCase()}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-4">
        {/* Scene Name */}
        <div className="space-y-2">
          <Label htmlFor="scene-name">Scene Name</Label>
          <Input
            id="scene-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            placeholder="Enter scene name"
          />
        </div>

        {/* Video-specific fields */}
        {showVideoFields && (
          <>
            <div className="space-y-2">
              <Label htmlFor="segments">Segments (8s each)</Label>
              <Input
                id="segments"
                type="number"
                min="1"
                max="10"
                value={segments}
                onChange={(e) => setSegments(parseInt(e.target.value) || 1)}
                onBlur={handleSave}
              />
              <p className="text-xs text-muted-foreground">
                Total duration: {segments * 8} seconds
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={handleSave}
                rows={4}
                placeholder="Enter video generation prompt"
              />
            </div>

            {scene.kind === SceneType.EXTENSION && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="inherit-prompt"
                    checked={inheritPrompt}
                    onChange={(e) => {
                      setInheritPrompt(e.target.checked);
                      setTimeout(handleSave, 0);
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <Label htmlFor="inherit-prompt" className="cursor-pointer">
                    Inherit prompt from choice
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {inheritPrompt
                    ? 'Will use the choice label as the prompt'
                    : 'Will use the explicit prompt above (or extend with no prompt if empty)'}
                </p>
              </div>
            )}
          </>
        )}

        {scene.kind === SceneType.CHOICE && (
          <>
            <Alert>
              <AlertDescription>
                <strong>Choice scenes</strong> generate a video for each option.
                Each choice needs a label (button text) and a prompt (video content).
                Connect child nodes for each choice.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Choice Options</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addChoiceOption}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Choice
                </Button>
              </div>

              {choiceOptions.map((option, index) => (
                <Card key={index} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">Choice {index + 1}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeChoiceOption(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="space-y-1">
                    <Label htmlFor={`choice-label-${index}`} className="text-xs">
                      Button Label
                    </Label>
                    <Input
                      id={`choice-label-${index}`}
                      value={option.label}
                      onChange={(e) => updateChoiceOption(index, 'label', e.target.value)}
                      placeholder="e.g., Open the door"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`choice-prompt-${index}`} className="text-xs">
                      Video Prompt
                    </Label>
                    <Textarea
                      id={`choice-prompt-${index}`}
                      value={option.prompt}
                      onChange={(e) => updateChoiceOption(index, 'prompt', e.target.value)}
                      placeholder="Describe what happens in this choice"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </Card>
              ))}

              {choiceOptions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Add choice options and connect child nodes
                </p>
              )}

              {choiceOptions.length > 0 && (
                <Button onClick={handleSaveChoiceOptions} className="w-full mt-3" size="sm">
                  <Save className="mr-2 h-3 w-3" />
                  Save Choice Options
                </Button>
              )}
            </div>
          </>
        )}

        {scene.kind === SceneType.END && (
          <Alert>
            <AlertDescription>
              <strong>End scenes</strong> mark the end of a playthrough. No
              edges should connect from this node.
            </AlertDescription>
          </Alert>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={scene.notes || ''}
            onChange={(e) => {
              const updatedScene: Scene = { ...scene, notes: e.target.value };
              onUpdate({ ...node, data: updatedScene });
            }}
            rows={3}
            placeholder="Add notes about this scene"
          />
        </div>
      </div>

      <Separator />

      <Button onClick={handleSave} className="w-full">
        <Save className="mr-2 h-4 w-4" />
        Save Changes
      </Button>
    </div>
  );
}
