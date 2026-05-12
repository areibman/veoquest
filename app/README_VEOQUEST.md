# VeoQuest Prototype

VeoQuest is now organized around a publisher catalog, validated scenario blueprints, a visual graph editor, local durable state, fake Veo 3.1 generation, and a mobile-friendly player.

## Current Prototype

- Catalog seed data includes multiple games, a free base scenario, and a locked expansion scenario.
- Local persistence uses a schema-versioned `localStorage` database with games, content packs, entitlements, blueprints, validation results, scenarios, nodes, choices, clips, generation jobs, playthroughs, and playthrough events.
- The builder supports single-prompt blueprint drafting, JSON import/export, continuous graph validation, cost estimates, explicit generation approval, selected/full dummy clip generation, and playtesting.
- The player restores in-progress playthroughs, gates locked content, supports publisher preview, presents readable choice overlays, accepts mouse/touch/keyboard input, and records the route taken.
- Fake Veo 3.1 generation lives in `lib/fakeVeo31.ts` and never calls real Veo or Gemini services.

## Blueprint Contract

- Canonical schema: `docs/scenario-blueprint.schema.json`
- Valid example: `docs/scenario-blueprint.example.json`

Agents such as Codex, Cursor, and Claude Code should target `schemaVersion: "veoquest.blueprint.v1"`, then run the app validator before any media generation is approved.

## Useful Commands

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

## Known Prototype Boundaries

The persistence layer is local-first and browser-scoped rather than SQLite-backed. Payment, accounts, real media storage, and real Veo 3.1 integration are intentionally left as future integration points behind the current model boundaries.
