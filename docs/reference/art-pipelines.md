# Art asset pipelines — runbook

How to add real artwork to the game. Both pipelines are title-keyed: an
artwork whose `name` has a map entry in `app/game/art/artImages.ts` renders
the real asset; every other title keeps its procedural placeholder. Coverage
grows one title at a time with no system changes and no save migration
(titles are already persisted on `Artwork`).

System design: design doc → Commissions & Works → "Real artwork assets".
Statue source shortlist: [../artifacts/statue-scan-catalog.md](../artifacts/statue-scan-catalog.md).

## Paintings (pixelated public-domain masters)

1. **Pick a work.** Pre-1600 paintings are public domain, and faithful photos
   of 2D PD art carry no new copyright (Bridgeman v. Corel) — Wikimedia
   Commons PD-Art files are safe to ship. Prefer works that plausibly match
   an existing title pool entry (`TITLES` / `CHURCH_TITLES` in
   `app/game/art/artists.ts`). For panels wider than ~2:1, use an official
   detail-crop file or plan a `focal_x` (the Leonardo Annunciation uses 0.82
   to land on Mary — a center crop hits empty background).
2. **Add to `SOURCES`** in `scripts/make-pixel-art.py`: slug → (960px
   Wikimedia thumb URL, focal_x). Get the URL from the Commons API
   (`action=query&titles=File:...&prop=imageinfo&iiprop=url&iiurlwidth=960`).
3. **Run** (needs `pip install Pillow`):

   ```sh
   python3 scripts/make-pixel-art.py
   ```

   Idempotent — re-downloads every source, writes 48×60 16-color PNGs
   (~2 KB) to `public/art/`. Eyeball the output at 4× nearest-neighbor; if a
   wide panel reads as mush, tune its `focal_x`.
4. **Wire**: add the title → `/art/<slug>.png` entry to `ART_IMAGES`. That's
   the whole integration — thumbnails and the in-world easel canvas both read
   the map.

## Statues (low-poly scans)

1. **Pick a scan** from the catalog (all threedscans.com — published without
   restrictions, links verified Aug 2026). Simple/standing poses survive low
   tri counts best; complex poses (Hermes) are why the baseline is 600, not
   300.
2. **Download + unzip** (zips are 20–130 MB; ignore any `__MACOSX` sidecar):

   ```sh
   curl -sL -o scan.zip "<download url>" && unzip scan.zip
   ```

3. **One-time env**: `pip install trimesh fast-simplification "numpy<2"`.
   On Python 3.9 pin `fast-simplification==0.1.7` (newer releases need 3.10+)
   and use a venv — an old conda numpy will fight the wheels.
4. **Run**:

   ```sh
   python3 scripts/make-low-poly-statue.py <scan.stl|.obj> <name>   # default 600 tris
   ```

   Writes `public/models/statues/<name>.glb` (~30 KB): two-stage quadric
   decimation (rough cut → largest-body floater removal → finish), z-up→y-up
   with an upside-down auto-flip (base = widest slice), flat shading baked,
   normalized to height 1.0 with feet at the origin. Scans keep their own
   socle base — deliberate (base-on-plinth reads as presentation).
5. **Wire**: add the title → `/models/statues/<name>.glb` entry to
   `STATUE_MODELS`. Marble vs bronze comes from the artwork's `material` at
   render time, not the asset — any scan can be either.
6. **Verify in-game**: `/?demo&pause` displays several mapped titles on
   plinths (see `app/game/demo/demoCity.ts` for which); the statue streams in
   async over the procedural placeholder's plinth position.

## Tri-count baseline

600 flat-shaded tris, picked from an in-game 1200/600/300/150 ladder
(Aug 2026): 1200 reads a fidelity tier above the kit, 300 chunks up complex
poses, 150 goes abstract. Performance is not a factor at display-art counts —
statues are individual meshes, one draw call each regardless of tri count;
pick targets on looks alone.
