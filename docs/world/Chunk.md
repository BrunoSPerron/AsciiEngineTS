# Chunk

A Chunk is a fixed-size square section of the world, 32×32 tiles. The world is divided into an infinite grid of chunks; each is identified by its chunk coordinates `(cx, cy)`, where world position `(wx, wy)` maps to chunk `(floor(wx/32), floor(wy/32))`.

Chunks are the unit of loading and unloading. Only chunks within `chunk_view_distance` of the player's current chunk are kept in memory at any time. See [[Engine]] for how to configure view distance.

---

## Tiles

Each chunk stores a flat array of 1024 tiles (32×32). A tile has three fields:

| Field | Type | Description |
|---|---|---|
| `glyph` | `string` | The character rendered at this position |
| `solid` | `boolean` | Whether entities are blocked by this tile |
| `style` | `string?` | Optional CSS class suffix for per-tile coloring |

See [[guides/AddingATileStyle]] for how to define and apply tile styles.

---

## Lifecycle

Chunks are created lazily — the first time any code refers to a chunk coordinate, that chunk is allocated and passed to the [[#Chunk generation|chunk generator]] if one is set. They are destroyed when they fall outside the active view distance.

Chunks track a `dirty` flag. When set, the renderer re-renders the chunk's HTML on the next frame. Modifying tiles via `world.setTileStyle()` sets this flag automatically.

---

## Chunk generation

Register a generator on the world before the game starts:

```ts
engine.world.setChunkGenerator((cx, cy, chunk) => {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = y * 32 + x
      chunk.tiles[i] = { glyph: '.', solid: false }
    }
  }
})
```

The generator receives the chunk coordinates and the blank chunk — all tiles default to `{ glyph: ' ', solid: false }`. It is called exactly once per chunk, on first access.

The generator is a plain function, so you can close over any state you need — noise functions, region maps, seed values, and so on.

---

## Related

- [[Region]] — logical groupings of chunks
- [[guides/AddingATileStyle]] — per-tile CSS styling
- [[Engine]] — chunk view distance configuration