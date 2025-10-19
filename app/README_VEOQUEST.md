# VeoQuest - Interactive Video Game Builder

An interactive web application for building story-driven video games with branching narratives using Google's Gemini Veo API.

## Features

- **Designer Mode**: Visual graph builder using ReactFlow to create story plots with diverging paths
- **Scene Types**:
  - **Root**: Starting point of the game
  - **Extension**: Continues from the previous video (can extend with or without prompt)
  - **Choice**: Pauses gameplay for user decisions (no video generated)
  - **End**: Terminal nodes marking the end of a playthrough
- **Video Generation**: Automated generation using Google Gemini Veo API with:
  - Concurrent generation (cascade strategy)
  - Multi-segment support (for videos longer than 8 seconds)
  - Progress tracking with SSE
- **Play Mode**: Interactive video player with:
  - Auto-advance between scenes
  - Choice overlays for decision points
  - Multiple save game slots
- **Save Game System**: Track multiple playthroughs with progress saving

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set Up Environment Variables**:
   Create a `.env.local` file in the `app` directory:
   ```
   API_KEY=your_google_genai_api_key_here
   ```
   
   Get your API key from [Google AI Studio](https://ai.google.dev/)

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Open Browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Creating a Game (Designer Mode)

1. Click "Create New Game" from the landing page
2. Use the toolbar to add scene nodes:
   - **Root Scene**: Start of your game (required - exactly one)
   - **Extension Scene**: Continues the video story
   - **Choice Scene**: Presents options to the player
   - **End Scene**: Marks the end of a path
3. Connect nodes by dragging from output to input handles
4. Click on a node to edit its properties in the sidebar:
   - Set scene name
   - Configure prompt (for Root/Extension scenes)
   - Set number of segments (each segment = 8 seconds)
   - Toggle "inherit prompt" for Extension scenes
5. Save your graph
6. Click "Create Game" to generate all videos

### Video Generation

- Videos are generated in a cascade pattern:
  - Root generates first
  - As each video completes, its children start generating concurrently
  - This allows 10+ videos to generate simultaneously
- Generation progress is shown in real-time
- Videos are saved to `/public/generated-videos/{graphId}/{nodeId}.mp4`

### Playing a Game

1. Click "Play Game" from the landing page
2. Select a game with generated videos
3. Choose "New Game" or load an existing save
4. Watch videos and make choices when prompted
5. Progress is auto-saved after each scene

## Architecture

### Core Libraries

- **ReactFlow**: Graph visualization and editing
- **Zustand**: State management
- **Google GenAI SDK**: Video generation
- **Next.js 15**: Framework with App Router

### Data Flow

1. **Designer** → Creates SceneGraph → Saves to localStorage
2. **Generate Videos** → SSE API route → Orchestrates concurrent generation → Saves videos and Video objects
3. **Play Mode** → Loads graph → Plays videos → Manages save games

### Key Files

- `lib/sceneGraph.ts`: Scene graph data structures and validation
- `lib/videoGeneration.ts`: Video generation orchestration with dependency management
- `lib/graphStorage.ts`: Graph and video persistence
- `lib/saveGameStorage.ts`: Save game management
- `api/generate-videos/route.ts`: SSE endpoint for video generation
- `designer/page.tsx`: Graph builder UI
- `play/[graphId]/page.tsx`: Game player UI

## Scene Graph Specification

### Scene Types

```typescript
enum SceneType {
  ROOT = 'root',          // Single entry point
  CHOICE = 'choice',      // No video, pauses for user choice
  EXTENSION = 'extension', // Continues from parent video
  END = 'end'            // Terminal node
}
```

### Extension and Prompt Inheritance

- **Explicit prompt**: Set `prompt` field directly
- **Inherit prompt**: Set `inherit_prompt: true` to use the choice label as the prompt
- **No prompt**: Leave both empty to extend without new prompt (for longer videos)

### Validation Rules

- Exactly one ROOT node required
- CHOICE nodes must have labeled edges
- END nodes cannot have outgoing edges
- All nodes must be reachable from ROOT

## Logging

The application uses comprehensive logging with timestamps:

```
[2025-10-19T10:32:15.123Z] [INFO] [VideoGeneration] Starting cascade generation
[2025-10-19T10:32:15.125Z] [VIDEO] [root] GENERATION_START
[2025-10-19T10:32:45.678Z] [VIDEO] [root] GENERATION_COMPLETE
```

Check browser console for detailed logs during development.

## Troubleshooting

### Videos not generating

- Check that `API_KEY` is set in `.env.local`
- Verify graph validation passes
- Check browser console for detailed error logs

### "Graph not found" error

- Graphs are stored in localStorage
- Clear browser cache may delete graphs
- Export graphs as JSON for backup (future feature)

### SSE connection errors

- Check that `/api/generate-videos` route is accessible
- Ensure no timeout middleware is interfering
- Check server logs for errors

## Future Enhancements

- Export/import graphs as JSON
- Cloud storage integration
- Video preview mode
- Cost estimation before generation
- Batch generation queue management
- Style and reference image support
- Video stitching for multiple segments

## License

Apache-2.0

