## Configuration

Place an `engine-settings.toml` file anywhere under your [[Assets|asset glob]] root. All fields are optional; missing fields fall back to engine defaults.

```toml
[game]
title = "My Ascii Game"
initial_theme = "Flamingo"
engine_themes = ["Burgundy Pink", "Deep Sea", "Flamingo", "Midnight"]

[world]
chunk_view_distance = 3

[camera]
half_life = 400          # ms to close half the distance to target
initial_position = [20, 20]

[bindings]
pause = ['Escape']
confirm = ['Enter', 'NumpadEnter', 'Space']
cancel = ['Escape', 'ShiftLeft']
up = ['KeyW', 'ArrowUp', 'Numpad7', 'Numpad8', 'Numpad9']
down = ['KeyS', 'ArrowDown', 'Numpad1', 'Numpad2', 'Numpad3']
left = ['KeyA', 'ArrowLeft', 'Numpad1', 'Numpad4', 'Numpad7']
right = ['KeyD', 'ArrowRight', 'Numpad3', 'Numpad6', 'Numpad9']
```

| Section    | Key                   | Default         | Description                                                                                            |
| ---------- | --------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `game`     | `title`               | `"AsciiEngine"` | Sets `document.title`                                                                                  |
| `game`     | `initial_theme`       | `"Copper"`      | Theme applied on load                                                                                  |
| `game`     | `engine_themes`       | `[...]`(all)    | Whitelist of [[Theming#Built-in themes\|engine themes]] loaded in the [[ThemeManager\|theme manager]]. |
| `world`    | `chunk_view_distance` | `3`             | Radius of loaded [[Chunk\|chunks]] around the player                                                   |
| `camera`   | `half_life`           | `400`           | Smoothing. ms to close half the distance to target                                                     |
| `camera`   | `initial_position`    | `[0, 0]`        | Camera position before a target is assigned                                                            |
| `bindings` | _(any action)_        | see above       | Maps action names to key codes                                                                         |
