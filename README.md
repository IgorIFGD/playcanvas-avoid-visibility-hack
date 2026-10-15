# PlayCanvas: avoid pausing when the tab is hidden

A small snippet that keeps a PlayCanvas app (engine **v1.x and v2.x**) running when the browser tab is hidden or the window loses focus. In other words, it disables the "pause" behaviour.

File: [playcanvas-avoid-visibility-api.js](playcanvas-avoid-visibility-api.js)

## Why it's needed

- Browsers stop `requestAnimationFrame` in hidden tabs, and the engine's main loop is built on it, so the app freezes.
- `setInterval`/`setTimeout` on the main thread are throttled in background tabs (about 1 call/sec, then about 1/min), so a naive timer-based loop is not enough.
- The engine suspends the sound manager when the page is hidden.

## What it does

1. **Hides the page state** from the game and other scripts: `document.hidden` is always `false`, `document.visibilityState` is always `'visible'`, `document.hasFocus()` returns `true`, and `window.onblur`/`onfocus` are neutralised. These overrides are defined on the `document`/`window` objects themselves.
2. **Waits for the app** (`pc.AppBase.getApplication()` / `pc.app`) to have a graphics device, then injects the hack.
3. **When the tab becomes hidden** (using the real visibility state):
   - sets `pc.platform.browser = false`, so the engine's `tick()` stops scheduling `requestAnimationFrame`;
   - sets `app.autoRender = false` (the app updates but does not render, which saves GPU);
   - calls `app.tick()` at 60 FPS from a **Web Worker timer**, which is not throttled (falls back to `setInterval` if a Worker can't be created, e.g. CSP).
4. **When the tab becomes visible again**, it stops the timer, restores `pc.platform.browser` and `autoRender`, and calls `app.tick()` once to restart the normal `requestAnimationFrame` loop.
5. **Patches `AppBase.prototype.isHidden`** to return `false`, so the engine doesn't suspend audio.

It logs to the console when the pause is prevented and when normal rendering resumes.

## Usage

Add the script to your project so that it loads **before** the app starts, as a regular script (not an ESM script), for example:

- **PlayCanvas Editor:** upload the file as a script asset and add it to the *Scripts* list in project settings, or
- **Self-hosted/exported build:** include it in `index.html`:

```html
<script src="playcanvas-avoid-visibility-api.js"></script>
```

No configuration is needed. To change the background tick rate, edit `MANUAL_TICK_FPS` at the top of the file. To keep rendering while hidden, remove the `app.autoRender = false` line.

## Caveats

- The snippet overrides `document.hidden`, `visibilityState` and related properties on the page, so other code that relies on them (analytics, pause menus, etc.) will always see a visible, focused page.
- It relies on engine internals (`platform.browser` and `AppBase.tick`), which may change in future engine versions.
- Browsers may still throttle or suspend tabs in some situations (battery saver, memory saver, mobile OS backgrounding), which this can't prevent.

## License

MIT
