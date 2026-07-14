---
name: verify
description: Build/launch/drive recipe for verifying Patronage changes end-to-end in headless Chromium.
---

# Verifying Patronage in a headless session

## Launch

```bash
npm install                      # if node_modules missing
(npm run dev -- --port 5199 > /tmp/dev.log 2>&1 &)
curl -s -o /dev/null -w "%{http_code}" http://localhost:5199/   # expect 200
```

Gotcha: if the page shows `504 Outdated Optimize Dep`, the Vite dep cache is
stale (server started mid-install) — `rm -rf node_modules/.vite` and restart.

## Drive (playwright-core + preinstalled Chromium)

`npm i playwright-core` in a scratch dir (no browser download needed), then:

```js
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", // ls /opt/pw-browsers for the exact dir
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--no-proxy-server"],
});
```

- `--no-proxy-server` is required — the environment's HTTPS proxy breaks
  localhost fetches (ERR_CONNECTION_RESET). Google-Fonts CSS still fails
  (cert error); harmless.
- WebGL2 works under SwiftShader but FPS is ~1 — never use headless FPS as a
  perf signal; count draw calls / meshes / instances instead.

## Useful flows

- `/?demo` seeds a full test city (population ~450 once loaded, then drifts);
  `&pause` freezes the tick; `&cam=x,z[,radius]` frames a spot;
  `&map=<seed>` forces a map; `&crowd=<n>` forces the citizen-figure count.
- Wait for readiness by watching the loading overlay, not `scene.isReady()`
  (models stream in): `!document.body.innerText.includes("Preparing the city")`.
- Dev builds expose `window.__scene` (Babylon Scene) and `window.__store`
  (Zustand store) — drive the sim with real store actions, e.g.
  `__store.getState().setPopulation(7)`, and inspect meshes/thin instances
  via `__scene.meshes`.
- Known pre-existing sight: the colored grid beside the demo plaza is the
  market's goods, not an artifact.
