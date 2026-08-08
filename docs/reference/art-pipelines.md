# Art asset pipelines — runbook

How to add real artwork to the game. Both pipelines are title-keyed: an
artwork whose `name` has a map entry in `app/game/art/artImages.ts` renders
the real asset; every other title keeps its procedural placeholder. Coverage
grows one title at a time with no system changes and no save migration
(titles are already persisted on `Artwork`).

System design: design doc → Commissions & Works → "Real artwork assets".
Statue source shortlist: [../artifacts/statue-scan-catalog.md](../artifacts/statue-scan-catalog.md).
Painting source shortlist: [../artifacts/painting-source-catalog.md](../artifacts/painting-source-catalog.md).

## Paintings (pixelated public-domain masters)

Painting titles ARE the works, same as the sculptures: both painter pools name
real paintings and `ART_IMAGES` covers every one, so adding a painting means
adding a title *and* its source in the same change (`artists.check.ts` fails
on either half alone, and on any title that repeats across pools — the title
is the asset key).

1. **Pick a work** from [../artifacts/painting-source-catalog.md](../artifacts/painting-source-catalog.md)
   (60 works, verified against the Commons API Aug 2026). Pre-1600 paintings
   are public domain, and faithful photos of 2D PD art carry no new copyright
   (Bridgeman v. Corel) — Commons PD-Art files are safe to ship. **Aspect
   ratio picks the source, not fame**: the crop is 4:5, so 0.70–0.95 ships for
   free, past ~1.2 needs a `focal_x`, and below 0.65 the vertical-center crop
   can land between the two things worth seeing (there is no `focal_y`). Three
   kinds of file waste a build: **wide frescoes** (the Last Supper at 4:5 is
   four apostles — the composition is the point and the crop destroys it),
   **tondi** (a circular panel crops to a rectangle of middle, and a
   white-background tondo file keeps white corners that read as a bug —
   the Fra Angelico Adoration was swapped for Botticelli's rectangular Zanobi
   altar for exactly this), and **greyscale study photos**, which museum
   uploads are full of and the file name never admits (every MET file of the
   Petrus Christus *Goldsmith* is B&W except `DT711`; the tell before you look
   is a PNG 2–3× the ~2 KB norm, because noise defeats the quantizer).
2. **Add to `SOURCES`** in `scripts/make-pixel-art.py`: slug → (960px
   Wikimedia thumb URL, focal_x). Get the URL from the Commons API — never
   hand-assemble it, the `/a/ab/` hash prefix is not guessable and a guess
   404s: `action=query&titles=File:...&prop=imageinfo&iiprop=url&iiurlwidth=960`
   (batch with `|`). A file narrower than 960px serves the original instead,
   under `/commons/` rather than `/commons/thumb/`.
3. **Run** (needs `pip install Pillow`):

   ```sh
   python3 scripts/make-pixel-art.py
   ```

   Idempotent — re-downloads every source, writes 48×60 16-color PNGs
   (~2 KB) to `public/art/`.
4. **Contact-sheet every build.** Paste all of `public/art/` into one grid at
   4× nearest-neighbor (Pillow, `Image.NEAREST`) and look at it — this is what
   caught the greyscale Goldsmith, the white-cornered tondo, and Uccello's
   *Battle of San Romano*, which at 48×60 is an unreadable brown mass of
   lances at every `focal_x` and got benched for Botticelli's *Pallas and the
   Centaur*. Reject-and-replace is normal: budget for it the way the statue
   pipeline does. Test a candidate before wiring it by importing the script
   and calling `pixelate()` on the downloaded source.
5. **Wire**: add the title → `/art/<slug>.png` entry to `ART_IMAGES` *and*
   the title to the right pool in `artists.ts` (secular or church — the split
   is who asks). Thumbnails and the in-world easel canvas both read the map;
   `npm test` asserts the pools and the map agree in both directions.

## Statues (low-poly scans)

Sculpture titles ARE the works — the pools in `artists.ts` name real
sculptures and `STATUE_MODELS` covers every one, so adding a statue means
adding a title *and* its scan in the same change (`artists.check.ts` fails on
either half alone). Budget for rejects: of thirteen scans tried in the Aug
2026 roster pass, five didn't survive the pipeline (below).

1. **Pick a scan** from the catalog (all threedscans.com — published without
   restrictions, links verified Aug 2026). Simple/standing poses survive low
   tri counts best; complex poses (Hermes) are why the baseline is 600, not
   300. Two kinds of source are a waste of time: **reliefs and panels**
   (the Saint Anna retable decimates fine and then renders as a blank white
   board in-scene — low-poly carving has no depth to catch the light), and
   scans whose figure is a minority of the geometry (the Ephebe/Idolino and
   the Plato herm are dominated by a planar plinth/backdrop artifact that
   survives decimation because its boundary edges can't collapse — the same
   thing floors those meshes ~1500 tris instead of 600, so a build that
   *stalls well above target is the tell*, before you ever look at it).
2. **Download + unzip** (zips are 20–130 MB; ignore any `__MACOSX` sidecar):

   ```sh
   curl -sL -o scan.zip "<download url>" && unzip scan.zip
   ```

3. **One-time env**: `pip install trimesh fast-simplification scipy networkx
   "numpy<2"` (scipy *and* networkx — floater removal calls `mesh.split`,
   which dies with "no graph engines available" without them, and different
   scans take different engine paths). On Python 3.9 pin
   `fast-simplification==0.1.7` (newer releases need 3.10+) and use a venv —
   an old conda numpy will fight the wheels.
4. **Run**:

   ```sh
   python3 scripts/make-low-poly-statue.py <scan.stl|.obj> <name>          # default 600 tris
   python3 scripts/make-low-poly-statue.py <scan> <name> 1200 flip yup align
   ```

   Orientation is three independent knobs, and threedscans is mixed enough
   that you will need them: `yup` skips the z-up→y-up rotation (Theodoric,
   Saint Hugh, the Transi, Queen Margaret and the Eagle are already y-up —
   the tell is a figure lying on its side, i.e. a GLB whose z extent runs
   several times its height); `align` stands the longest principal axis up
   for scans that hang at an arbitrary angle off their plinth; `flip` inverts
   the right-side-up guess. All three are opt-in on purpose — auto-detection
   tips reclining figures on end.

   Writes `public/models/statues/<name>.glb` (~30 KB): two-stage quadric
   decimation (rough cut → largest-body floater removal → finish), the
   orientation pass above, upside-down auto-flip by putting the scan's one big
   flat plane (socle/turntable) face down (`flip` inverts the guess if it
   misses; the decimator is nondeterministic, so eyeball every build — a
   flat-shaded contact sheet straight off the GLB with trimesh + matplotlib
   painter's-algorithm polygons catches orientation in seconds, but only
   in-scene catches "reads as a white board"), flat shading baked, normalized
   to height 1.0 with feet at the origin. Scans keep their own socle base —
   deliberate (base-on-plinth reads as presentation). Reclining/wide pieces
   need no special wiring: `statueFit` (art/display.ts) detects >1.2×
   long-axis-to-height at load and the renderer seats them fit-scaled on a
   low slab instead of the round pedestal — but give them 1200 tris; their
   figure-plus-base composition mushes at 600.
5. **Wire**: add the work's real name to the right pool in `artists.ts`
   (secular or church — those are the only two, and the split is who asks,
   not what it's made of) and the title → `/models/statues/<name>.glb` entry
   to `STATUE_MODELS`. Marble vs bronze comes from the artwork's `material`
   at render time, not the asset — every title can arrive as either, so never
   pick a scan for its medium.
6. **Verify in-game**: `/?demo&pause` displays five mapped titles on plinths
   (see `app/game/demo/demoCity.ts`); the statue streams in async over the
   procedural placeholder's plinth position. To eyeball a title the demo
   doesn't carry, temporarily swap it into one of those five rows. Headless
   recipe that worked: launch Chrome with `--remote-debugging-port` +
   swiftshader flags, wait out the "Preparing" overlay, then aim
   `__scene.activeCamera` at each `statue-*` mesh's absolute position and
   `Page.captureScreenshot` — the `--screenshot` CLI can't frame a plinth
   whose world position you don't know yet.

## Tri-count baseline

600 flat-shaded tris, picked from an in-game 1200/600/300/150 ladder
(Aug 2026): 1200 reads a fidelity tier above the kit, 300 chunks up complex
poses, 150 goes abstract. Performance is not a factor at display-art counts —
statues are individual meshes, one draw call each regardless of tri count;
pick targets on looks alone.
