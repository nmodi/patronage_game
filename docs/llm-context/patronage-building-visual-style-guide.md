# Patronage Building Architecture Visual Style Guide

## Core direction

> **A medieval masonry town gradually acquiring Renaissance order.**

The city should feel built over time rather than designed all at once. Ordinary streets remain practical, dense, and slightly irregular. Patronage introduces cleaner proportions, formal facades, civic monuments, and elite residences.

## 1. Art-direction principles

1. **Urban before picturesque.** Buildings form streets and piazzas. Central buildings should not sit as isolated objects in grass.
2. **Vernacular majority.** Most buildings use simple plaster, brick, rubble, timber doors, and terracotta roofs.
3. **Selective Renaissance formality.** Symmetry, formal portals, string courses, paired windows, rustication, and strong cornices belong mainly to palazzi, prosperous townhouses, churches, hospitals, and civic buildings.
4. **Readable at the default camera.** Silhouette, roof, ground-floor opening, and major window rhythm matter more than micro-detail.
5. **Controlled procedural variation.** Vary a small number of meaningful modules. Do not make buildings randomly crooked.
6. **Function at street level.** Service identity should come from architecture before props.
7. **Warm material unity.** Roofs unify the city; facades provide restrained variation.

## 2. Urban fabric

Reference screenshot: `ref-props-style-guide.png`  

### Center

- Attached or nearly attached rows
- Taller and narrower townhouses
- Service fronts facing roads, markets, and piazzas
- Minimal grass gaps between the building and the street
- Church, tower, manor, tavern, market, and civic buildings as anchors

### Edge

- More detached cottages
- Lower heights
- Small gardens, yards, workshops, and agricultural transitions
- Greater space between structures

### Density gradient

| Area | Typical fabric |
| --- | --- |
| Main piazza | Civic and religious landmarks, palazzi, market, tavern |
| Main streets | Attached townhouses, shop-houses, workshops |
| Side streets | Mostly housing with occasional neighborhood services |
| Town edge | Detached cottages, yards, suppliers, agricultural buildings |

## 3. Building hierarchy

| Type | Height | Massing | Facade | Roof | Ornament |
| --- | --- | --- | --- | --- | --- |
| Cottage | 1 story, occasional low addition | Low, simple, full-footprint | Slightly irregular | Shallow gable; rare hip | Minimal |
| Townhouse | 2 to 3 stories | Narrow and vertical | More ordered upper windows | Gable or shallow hip | Door surround; rare string course |
| Shop-house | Usually 2 stories | Townhouse shell with active ground floor | Commercial bay below, domestic above | Gable | Awning, counter, chimney |
| Tavern / inn | 2 stories | Broad frontage or long hall | Strong public entrance | Gable or hip | Terrace, benches, bay rhythm |
| Manor | 3 principal registers | Broad street-wall mass | Ordered and formal | Shallow hip | Heavy base, portal, paired windows, cornice |

## 4. Facade grammar

### Ground floors

- Heavier, smaller, and more closed than upper floors
- Residential entrance: narrow timber door
- Prosperous residence: dressed-stone surround or modest round arch
- Shop or workshop: broad bay, folding shutter-counter, or shallow arch
- Manor or civic building: formal portal

### Windows

- Cottage front: 1 to 2 windows
- Townhouse front: 1 ground-floor window plus 2 to 3 upper windows
- Side facades: fewer windows than the current repeated grid
- Rear facades: may be less regular
- Round arches and paired windows: reserved for higher-status buildings
- Shutters: common on ordinary housing
- Large uninterrupted glazing: prohibited

### Horizontal detail

- No formal banding on ordinary cottages
- Thin sill band or string course on prosperous townhouses
- Strong floor divisions and cornice on palazzi
- Avoid decorative trim on every floor of every building

## 5. Roof and skyline grammar

### Allowed

- Low to moderate pitch, visually about 18 to 30 degrees
- Terracotta roof family
- Small pitch and ridge-height variation
- Gable roofs for cottages, townhouses, and shop-houses
- Shallow hip roofs for prosperous houses, inns, and palazzi
- Split roof massing for a rear annex, oven, or service wing
- Logical chimney placement connected to ovens, hearths, or workshops

### Avoid

- Steep northern-European roofs
- Rows of dormers
- Fantasy turrets
- Strongly different roof colors
- Random roof rotation
- Flat-roofed ordinary housing as a dominant type

For attached rows, place gable ends on party-wall sides and eaves toward the street and rear.

## 6. Material palette

| Material | Suggested color |
| --- | --- |
| Warm plaster | `#D8C9A7` |
| Limewash cream | `#E5D8B8` |
| Pale ochre | `#C9A66B` |
| Faded rose | `#B77A67` |
| Brick | `#A65E46` |
| Rubble stone | `#827A68` |
| Dressed ashlar | `#B9AD93` |
| Terracotta roof | `#AE5D3E` |
| Faded terracotta | `#C47750` |
| Dark terracotta | `#7F432F` |
| Timber | `#6C4A32` |
| Iron | `#40413E` |

### Distribution

- **Cottage:** plaster, rubble, patchy finish; ashlar is rare
- **Townhouse:** plaster and brick; limited ashlar or stone trim
- **Bakery and tavern:** warmer plaster and brick; dark timber at active frontage
- **Manor:** controlled ashlar and stone registers; minimal random finish variation

## 7. Procedural recipes

### Cottage

- Full 4 by 4 wall mass
- One story
- One door and 1 to 2 front windows
- Gable roof, with a rare shallow-hip variant
- Optional chimney, low rear annex, or service bay
- No formal string course or cornice
- Three target variants

### Townhouse

- Full 4 by 4 party-wall mass
- Two or three stories
- Narrow vertical proportion
- More orderly upper window rhythm
- Gable default; prosperous shallow-hip variant
- Optional stone doorway or thin string course
- Three to four target variants

### Bakery

- Two-story shop-house
- Broad ground-floor shop or oven bay
- Domestic upper windows
- Large oven chimney
- Optional private side door
- Two target variants: integrated shop-house and projecting bakehouse
- Props are secondary to the shop opening and chimney

### Tavern / inn

- Broad two-story neighborhood anchor
- Strong public entrance, awning, or arch bay
- Upper guest-room windows
- Long facade divided into a small number of readable bays
- Terrace, benches, and tables
- Two target variants: long public hall and urban inn

### Manor

- One refined main type
- Broad street-wall mass
- Three visible registers
- Heavier ground floor
- Formal portal
- Ordered upper bays
- Paired or arched principal-floor windows
- Strong cornice
- No surrounding lawn

## 8. Procedural variation budget

### Keep invariant

- Gameplay footprint
- Declared front and player rotation
- Main wall mass filling the footprint
- Building class and silhouette
- Terracotta roof family
- Deterministic rendering and batching behavior

### Vary deliberately

- Story count within the recipe
- Gable versus shallow hip
- Explicit door and window layout
- Rear annex or service bay
- Chimney position
- Facade finish
- Limited status-appropriate trim

| Building | Target | Primary variation |
| --- | --- | --- |
| Cottage | 3 variants | Massing, opening layout, finish |
| Townhouse | 3 to 4 variants | Stories, roof, facade order |
| Bakery | 2 variants | Integrated frontage vs projecting bakehouse |
| Tavern | 2 variants | Long hall vs urban inn |
| Manor | 1 refined type | Small finish variation only |

## 9. Camera-readability rules

At the default isometric view:

- Building type should be identifiable from silhouette and one major facade tell
- Windows must not become dense visual noise
- A service building must remain identifiable without reading a sign
- Palazzi and churches must remain visually dominant
- Small props should reinforce identity, not create it
- Attached buildings must not produce visible grass seams, roof collisions, or buried details

## 10. Do and do not

### Do

- Form attached street rows near the center
- Use taller, narrower central housing
- Make service ground floors visibly active
- Keep ordinary facades slightly irregular
- Restrict classical order to elite and civic buildings
- Maintain a coherent terracotta roof field
- Preserve clean, low-poly readability

### Do not

- Add extensive half-timber framing
- Add steep roofs, dormer rows, or fantasy turrets
- Place every building with grass on all sides
- Repeat identical window grids on every facade
- Use large glass storefronts
- Use oversized shop signs as the main identifier
- Make all streets uniformly symmetrical and Renaissance-classical
- Make random crookedness the main source of variation

## 11. Screenshot review

Capture and review:

1. Default city overview
2. Attached cottage and townhouse row
3. Bakery front and chimney
4. Both tavern variants
5. Manor beside ordinary housing
6. Inactive service building
7. Rotated and diagonal placement cases

Evaluate:

- Street-wall continuity
- Building hierarchy
- Silhouette variety
- Ground-floor readability
- Roof coherence
- Material distribution
- Prop clutter
- Batching and performance regressions

## Reference anchors

- Michelozzo, Palazzo Medici, Florence, begun 1444
- Leon Battista Alberti, Palazzo Rucellai, Florence, mid-15th century
- Italian Renaissance republican cities, where streets, piazzas, art, and architecture communicated civic identity
