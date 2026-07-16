# Commission brief — low-poly architectural fittings (batch 1)

*Status (July 2026): batch 1 was **built procedurally instead** — all four pieces are
generated in `render/proceduralPieces.ts` to these exact specs (see
[procedural-pieces.md](procedural-pieces.md) "What's built"). This brief stays as the
dimensional spec those pieces trace back to, and as the template for the batch-2/3
briefs (bifora/rose window, dome, ivy — the pieces that still need an artist).*

*The send-ready request script. Paste into a Fiverr/ArtStation/email request, attach the
reference files listed at the bottom. Maintainer notes for running the commission (who to
filter for, what comes next) stay in [procedural-pieces.md](procedural-pieces.md) §2 —
everything below this line is written for the artist.*

---

Hi! I'm building a cozy low-poly city builder set in Renaissance Italy — isometric camera,
warm terracotta-and-sandstone palette, visually similar to Dorfromantik. The buildings are
kitbashed from Kenney's (CC0) Fantasy Town Kit plus pieces we generate in code, and I need
a small set of custom pieces the kit doesn't have. This first request is a paid test batch
of **four architectural fittings** — two windows, a door, and a tileable arch. I've
attached reference photos for each. If it goes well there's a roadmap of follow-up batches
(bifora and rose tracery windows, a cathedral dome, ivy).

## The four pieces

Scale reference: **1 unit = one grid cell**. A cottage's wall box is exactly 1×1×1 units;
a door is 0.75 units tall. Everything below is in those units.

### 1. Rectangular window

A plain stone frame around a window opening, for stucco townhouses — see the Florence
street reference: quiet grey pietra serena surrounds on colored plaster. Chunky,
flat-faceted.

- Opening: exactly **0.18 wide × 0.40 tall**
- Frame border around it: ~0.03–0.05, your call on proportions; a slightly projecting
  sill at the base is welcome
- Behind the opening, a flat **recessed panel** (the dark interior you see through the
  window) set back from the frame face — this is a separate material (`reveal`)
- **Shutters, if easy** (quote with and without): a louvered shutter leaf like the
  reference photo, delivered as its **own separate .glb** so we can mount it open beside
  the window or closed over it. All-`wood`, ~0.09 wide × 0.40 tall per leaf

### 2. Arched window

The same window with a **semicircular arched head**, like the palazzo reference: a
voussoir arch (visible wedge stones are welcome as low-poly facets) on a stone surround.
Opening 0.18 wide, 0.40 to the spring line, half-circle on top (total opening height
≈ 0.49). Same frame border, sill, and recessed reveal as #1. This one goes on churches
and civic buildings and gets recolored to dark green marble on some of them, so keep the
whole frame a single `stone` material.

### 3. Door

A complete doorway that actually reads as a door — stone frame (two jambs + lintel) with
a paneled or planked wooden leaf.

- Opening: **0.4 wide × 0.75 tall**
- Frame border: ~0.04–0.06, standing proud of the wall like the window frames; a low
  threshold step at the base is welcome
- Keep the head flat (lintel) — arched portals come in a later batch
- **Export the wooden leaf and the stone frame as two separate .glb files**, modeled
  together but split at export (same coordinates so they recompose). We recolor them
  independently in-engine — a one-file door would turn the wood green whenever we
  recolor the frame

### 4. Tileable arch (arcade bay)

One bay of a ground-floor arcade, like the riverfront reference photo: a pier carrying a
round arch. Placed in a row it must **tile seamlessly** — two copies side by side, offset
by exactly the bay width, share a full pier with no gap or doubled geometry.

- Bay: **1 unit wide × 1 unit tall**, depth ≤ 0.25, all `stone`
- Half a pier at each end of the bay (so neighboring copies complete each other); if a
  freestanding row needs an end cap, include a separate closing-pier piece
- Open through — no back wall, no reveal; it reads as a passage or loggia

## Technical requirements

These are hard requirements — the engine loads the files automatically and discards
anything outside this contract.

| rule | value |
|---|---|
| format | binary **.glb** (glTF 2.0) per piece, **plus the .blend source** |
| scale | 1 unit = 1 cell (door = 0.75 units tall) |
| axes / origin | **Y-up**, y = 0 at the bottom of the piece. Windows and door: the wall plane is **x = 0** — flat closed back at x = 0, build outward into +x, opening centered on z = 0. Arch bay: freestanding, x/z centered on 0 |
| depth | windows and door: nothing deeper than **0.07** proud of the wall (x ≤ 0.07). Arch bay: ≤ 0.25 |
| transforms | **baked into the geometry** — the engine overwrites root/node transforms on load |
| materials | flat-color materials, **named exactly**: `stone` (frames, arch), `reveal` (dark interior), `wood` (door leaf, shutters). Placeholder colors are fine — we recolor by material name in code |
| textures | **none** — no texture maps, no UV unwrap needed, no PBR maps (all discarded at load) |
| style | chunky low-poly, flat-shaded facets, straight edges, **no bevels, no smoothing** — match the attached kit pieces. Aim under ~150 triangles per window, ~250 for the door (both files together) and the arch bay (the kit's whole window panel is 278; its wall block is 76) |
| geometry hygiene | no two faces of the piece coplanar with each other (they flicker at distance); wall fittings get closed solid backs |

## Process, acceptance, licensing

- Fixed price for the batch of four (please quote the rectangular window with and without
  the shutter leaf). This is a test batch — there are two more batches on the roadmap for
  whoever nails this one.
- Acceptance: I drop each .glb into the engine and screenshot it on real buildings; one
  round of revisions included.
- **Full commercial rights / work-for-hire**, source files included. Please confirm this
  explicitly in your quote — platform default licenses often aren't sufficient.

## Attachments to include when sending

*(maintainer checklist — attach before sending)*

- 2–3 in-game screenshots (a cottage row, the cathedral, a street at play distance)
- The three reference photos in `docs/reference/`: palazzo facade (arched windows,
  voussoirs), Florence street (rectangular windows + louvered shutters), riverfront
  arcade (tileable arch)
- `public/models/town/door.glb` and `shutters.glb` (the kit leaves these pieces replace —
  scale anchors)
- `public/models/town/wall-block.glb` or a kit screenshot as the style/tri-budget anchor
