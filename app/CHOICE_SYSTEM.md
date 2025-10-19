# Choice System - How It Works

## Overview

**CHOICE nodes now generate videos!** Each choice option creates a separate video showing what happens if the player selects that choice.

## How It Works

### In Designer Mode

1. **Create a Choice Node**
   - Click "+ Choice Scene" to add a choice node
   - Select the choice node to edit it

2. **Add Choice Options**
   - Click "+ Add Choice" button
   - For each choice, set:
     - **Button Label**: What the player sees (e.g., "Open the door")
     - **Video Prompt**: What happens in the video (e.g., "The hero opens the creaking wooden door")

3. **Connect Child Nodes**
   - Each choice MUST have exactly one child node
   - Connect edges from the choice node to child nodes
   - Typically: Choice → Extension → End or Choice → End

### Example Graph Structure

```
Root (8s): "Hero approaches dungeon"
  ↓
Choice Node: "At the entrance"
  ├─ Choice 1: "Enter cautiously" → Ext1: "Sneaking inside" → End
  └─ Choice 2: "Charge in" → Ext2: "Running boldly" → End
```

### Video Generation

When you click "Create Game":

1. **Root generates**: 8s video of approaching dungeon
2. **Choice generates TWO videos**:
   - Choice 1 video: Extends Root + "enter cautiously" prompt → 16s video
   - Choice 2 video: Extends Root + "charge in" prompt → 16s video
   (Both generated concurrently!)
3. **Extension nodes**: 
   - Ext1 extends Choice1 video
   - Ext2 extends Choice2 video

### Playback Flow

1. **Start Game**: Play Root → Extension chain (final extension before choice)
2. **Reach Choice**: Show choice overlay with buttons
3. **Player Clicks Choice 1**: 
   - Plays Choice 1 video (16s showing approach + entering cautiously)
   - After video ends, advances to Ext1 (or plays Ext1 if it exists)
4. **Game Continues**: Extension chains, more choices, etc.

## Key Concepts

### Choice Videos Extend Parent

Each choice video extends from the parent video (or root if no parent):
- Root (8s) → Choice has 2 options
  - Option 1 video: Root + Option 1 content = 16s
  - Option 2 video: Root + Option 2 content = 16s

### Children Extend From Choice Videos

The child node after a choice extends from THAT choice's video:
```
Choice (option 1 video: 16s)
  ↓
Extension (extends option 1 video: 24s total)
```

### Multiple Paths = Multiple Videos

If you have 3 choices, you generate 3 separate videos:
```
Root (8s)
  ↓
Choice (3 options)
  ├─ Option 1 video (16s) → Child 1
  ├─ Option 2 video (16s) → Child 2
  └─ Option 3 video (16s) → Child 3
```

## Validation Rules

1. **Choice nodes MUST have**:
   - At least one edge/option
   - Each edge must have a label (button text)
   - Each edge must have a prompt (video content)
   - Exactly one child node per choice option
   - All child nodes must be unique (no sharing)

2. **Example Valid:**
```
Choice: 2 edges → 2 unique child nodes ✅
```

3. **Example Invalid:**
```
Choice: 2 edges → 1 child node ❌ (missing child)
Choice: 2 edges → same child twice ❌ (not unique)
```

## Storage

Choice videos are stored differently:
- **Regular videos**: `videoFiles[nodeId] = path`
- **Choice videos**: `choiceVideos[nodeId] = [{ videoPath, targetNodeId, videoObject }, ...]`

File naming:
- Regular: `{nodeId}.mp4`
- Choice: `{nodeId}_choice_{index}.mp4`

Example:
- `choice_123_choice_0.mp4` - First option
- `choice_123_choice_1.mp4` - Second option
- `choice_123_choice_2.mp4` - Third option

## Benefits

1. ✅ **Visual Feedback**: Player sees what happens for their choice
2. ✅ **Smooth Transitions**: Video continues naturally after choice
3. ✅ **Branching Stories**: Each path feels unique with its own video
4. ✅ **Concurrent Generation**: All choice videos generate at once
5. ✅ **Extension Support**: Children can extend from choice videos

## Tips

- Keep choice prompts descriptive but focused
- Remember: Choice videos extend from parent, so they include all previous content
- Child extensions will extend from the choice video, creating a continuous story
- Test all paths to ensure smooth transitions!

