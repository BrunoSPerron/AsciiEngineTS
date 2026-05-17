A Chunk is a fixed-size square section of the world, 32×32 tiles. The world is divided into an infinite grid of chunks; each is identified by its chunk coordinates `(cx, cy)`, where world position `(wx, wy)` maps to chunk `(floor(wx/32), floor(wy/32))`.

Chunks are the unit of loading and unloading. Only chunks within `chunk_view_distance` of the player's current chunk are kept in memory at any time. See [[Engine]] for how to configure view distance.

---
## Tiles

Each chunk stores a flat array of 1024 tiles (32×32). A tile has three fields:

| Field   | Type      | Description                                     |
| ------- | --------- | ----------------------------------------------- |
| `glyph` | `string`  | The character rendered at this position         |
| `solid` | `boolean` | Whether entities are blocked by this tile       |
| `style` | `string?` | Optional CSS class suffix for per-tile coloring |

See [[Adding a Tile Style|adding a tile style]] for how to define and apply tile styles.

---
## Lifecycle

Chunks are created lazily. The first time any code refers to a chunk coordinate, that chunk is allocated and passed to the [[#Chunk generation|chunk generator]] if one is set. They are destroyed when they fall outside the active view distance.

Chunks track a `dirty` flag. When set, the renderer re-renders the chunk's HTML on the next frame.
Modifying tiles via `world.setTilesStyle()` sets this flag automatically.

---
## Chunk generation

Register a generator on the world before the game starts:

```ts
engine.world.setChunkGenerator((_cx, _cy, chunk) => {
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const edge = x < 2 || y < 2 || x >= CHUNK_SIZE - 2 || y >= CHUNK_SIZE - 2
      if (edge) {
        const tile = chunk.get(x, y)
        tile.glyph = '#'
        tile.solid = true
      }
    }
  }
})
```

The generator receives the chunk coordinates and the blank chunk. All tiles defaults to 
```{ glyph: ' ', solid: false, style: undefined }```
 It is called exactly once per chunk, on first access.

The generator is a plain function, so you can close over any state you need: noise functions, region maps, seed values, and so on.

---
## Related

- [[Region]] — logical groupings of chunks
- [[Adding a Tile Style]] — per-tile CSS styling
- [[Engine]] — chunk view distance configuration
