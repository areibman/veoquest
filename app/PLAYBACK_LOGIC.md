# Playback Logic - Extension Chain Optimization

## The Problem

When you have a chain like `Root → Ext1 → Ext2 → Choice`, the extension videos literally extend the previous videos:
- Root generates an 8s video
- Ext1 extends Root, creating a 16s video (contains Root + Ext1)
- Ext2 extends Ext1, creating a 24s video (contains Root + Ext1 + Ext2)

Playing each one sequentially would show:
- 8s (Root) → 16s (Ext1) → 24s (Ext2) = 48 seconds total, with massive duplication!

## The Solution

**Play only the FINAL extension in a chain**, which contains all previous content.

### Example Flow

```
Root (8s) → Ext1 (16s) → Ext2 (24s) → Choice
                                        ├─ Opt1 → Ext3 (8s) → End
                                        └─ Opt2 → Ext4 (16s) → Ext5 (24s) → End
```

**Playback:**
1. Start game: Play Ext2 (24s video containing all content from Root→Ext1→Ext2)
2. Choice appears
3. Select Opt1: Play Ext3 (8s)
4. Select Opt2: Play Ext5 (24s video containing Ext4→Ext5)

### Implementation

The `findFinalExtensionInChain()` function:
1. Starts from a given scene (Root or after Choice)
2. Follows edges while:
   - There's only ONE edge (no branching)
   - Next node is an EXTENSION
   - Haven't hit a CHOICE or END
3. Returns the LAST extension in the chain

### When It's Applied

- **New Game**: Start from Root → find final extension → play that
- **After Choice**: Selected edge target → find final extension → play that
- **Loaded Save**: Use the saved node (no modification)

### Benefits

1. ✅ No duplicate content (don't replay root multiple times)
2. ✅ Correct video ordering (extensions contain all previous content)
3. ✅ Faster playback (24s instead of 48s in example above)
4. ✅ Seamless experience (one continuous video per segment)

### Code Location

See `app/play/[graphId]/page.tsx`:
- `findFinalExtensionInChain()` - Finds the last extension
- `handleSelectSaveGame()` - Uses it when starting new game
- `handleChoiceSelected()` - Uses it after making choices

