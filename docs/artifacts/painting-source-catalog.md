# Painting source catalog

Public-domain painting sources for the pixel-art pipeline
(`scripts/make-pixel-art.py`; full recipe in
[../reference/art-pipelines.md](../reference/art-pipelines.md)). The statue
equivalent is [statue-scan-catalog.md](statue-scan-catalog.md).

**Licensing.** Every file below is a Wikimedia Commons file of a pre-1600
painting: the work is public domain by age, and a faithful photo of 2D PD art
carries no new copyright (Bridgeman v. Corel), so these ship with no credit
obligation. Files whose *photographer* asserts CC BY-SA over a flat
reproduction were skipped on sight — there is a PD- or CC0-tagged alternative
for every work here, so nothing is worth arguing about. All file names, pixel
sizes and license tags verified live against the Commons API, August 2026
(~75 candidate files across 70 works).

**Aspect ratio is the whole game.** The pipeline center-crops to 4:5 (0.80)
before downsampling to 48×60. Read the `ar` column as:

| ar | what happens |
|---|---|
| 0.70–0.95 | safe — near-4:5 already, the crop takes slivers |
| 0.95–1.2 | mild horizontal crop; check nothing important sits at the edges |
| > 1.2 | **needs a `focal_x`** (given per row) or an official detail-crop file |
| < 0.65 | tall panel — the crop keeps the *vertical middle*, and there is no `focal_y` knob (see Gaps) |

**Titles are the key.** `ART_IMAGES`, `TITLES` and `CHURCH_TITLES` are all
keyed by the title string, so no title may repeat — not within a pool and not
across the secular/church split. That rule is what benches several fine
works below: there is one *Baptism of Christ* slot, one *Adoration of the
Magi*, one *Annunciation*. Where two masters painted the same subject, one
gets the plain title and the other needs its distinguishing name (Crivelli's
*Annunciation with Saint Emidius*) or waits on the bench.

## Shipped (24 titles, August 2026)

The ★ wave below is **in the game** — 12 secular + 12 church, every painter
title a real work with its own source. The two invented titles are gone
(**Madonna of the Lilies**, which named no work at all, and **Portrait of a
Young Merchant**, a made-up name over a real Met panel), as are the two
generic ones (**Fresco of the Last Judgment**, **Altarpiece of the Virgin**).
Retiring a painting title cost nothing: unmapped titles fall back to the
procedural canvas, so old saves keep rendering and no save migration was
needed.

Three sources failed in the field and were replaced — see Field notes.

## Roster

★ = shipped. The unmarked rows are equally viable and verified the same way;
the roster is deliberately deeper than the pools need, so a later pass can
pick for spread across subject and generation rather than take whatever was
verified. Adding one is a `SOURCES` line plus an `ART_IMAGES` line plus a
pool entry.

### Secular — `TITLES.painter` (30)

| ★ | Title in game | Work | ar | Crop | Commons file |
|---|---|---|---|---|---|
| ★ | Allegory of Spring | Botticelli, *Primavera*, c. 1480 | 1.51 | shipped | `Sandro Botticelli - La Primavera - Google Art Project.jpg` |
| ★ | The Birth of Venus | Botticelli, c. 1485 | 1.59 | `focal_x` 0.45 | `Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg` |
| ★ | Lady with an Ermine | Leonardo, c. 1489 | 0.74 | safe | `Lady with an Ermine - Leonardo da Vinci - Google Art Project.jpg` |
| ★ | Mona Lisa | Leonardo, c. 1503 | 0.67 | safe | `Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg` |
| ★ | Portrait of a Man with a Medal | Botticelli, 1474 — the merchant portrait, for real | 0.72 | safe | `Sandro Botticelli - Portrait of a Man with a Medal of Cosimo the Elder.jpg` |
| ★ | An Old Man and His Grandson | Ghirlandaio, c. 1490 | 0.74 | safe | `Ghirlandaio, Domenico - An Old Man and His Grandson - Louvre - Google Art Project.jpg` |
| ★ | Portrait of Baldassare Castiglione | Raphael, c. 1514 | 0.80 | exact 4:5, zero crop | `Baldassare Castiglione, by Raffaello Sanzio, from C2RMF retouched.jpg` |
| ★ | The School of Athens | Raphael, 1509–11 | 1.53 | `focal_x` 0.5 — Plato and Aristotle hold the centre | `Raphael School of Athens.jpg` |
| ★ | The Tempest | Giorgione, c. 1508 | 0.89 | safe | `Giorgione, The tempest.jpg` |
| ★ | A Goldsmith in His Shop | Petrus Christus, 1449 — the guild subject, CC0 (Met) | 0.87 | safe; **use `DT711`** — the Met's other uploads of this panel are B&W | `A Goldsmith in his Shop MET DT711.jpg` |
| ★ | The Moneylender and His Wife | Quentin Matsys, 1514 — banking, weighed out on the table | 1.06 | mild | `Massysm Quentin — The Moneylender and his Wife — 1514.jpg` |
| | Portrait of a Musician | Leonardo, c. 1485 | 0.76 | safe | `Leonardo da Vinci - Portrait of a Musician - Pinacoteca Ambrosiana.jpg` |
| | La Belle Ferronnière | Leonardo, c. 1495 | 0.69 | safe | `La Belle Ferronière - Google Arts.jpg` |
| | Ginevra de' Benci | Leonardo, c. 1474 | 0.94 | mild | `Leonardo da Vinci - Ginevra de' Benci - Google Art Project.jpg` |
| ★ | Pallas and the Centaur | Botticelli, c. 1482 — took the *San Romano* slot when that panel wouldn't read | 0.76 | safe | `Botticelli Pallas and the Centaur.jpg` |
| | Portrait of Giovanna Tornabuoni | Ghirlandaio, 1489–90 | 0.63 | tall — profile sits high, check the crop | `Domenico Ghirlandaio, 1489-1490 - Portrait of Giovanna Tornabuoni - Google Art Project.jpg` |
| | Portrait of Doge Leonardo Loredan | Bellini, 1501 | 0.71 | safe | `Giovanni Bellini, portrait of Doge Leonardo Loredan.jpg` |
| | Portrait of a Man (Il Condottiere) | Antonello da Messina, 1475 | 0.89 | safe | `Antonello da Messina - Portrait of a Man (Il Condottiere) cleaned version.jpg` |
| | Portrait of a Princess of the House of Este | Pisanello, c. 1440 | 0.70 | safe | `Pisanello 016.jpg` |
| | Portrait of Simonetta Vespucci | Piero di Cosimo, c. 1480 | 0.72 | safe | `Piero di Cosimo - Portrait de femme dit de Simonetta Vespucci - Google Art Project.jpg` |
| | Portrait of a Halberdier | Pontormo, 1529–30 | 0.76 | safe | `Pontormo (Jacopo Carucci) (Italian, Florentine) - Portrait of a Halberdier (Francesco Guardi?) - Google Art Project.jpg` |
| | Self-Portrait in a Convex Mirror | Parmigianino, 1524 | 1.01 | mild | `Francesco Mazzola, called Parmigianino - Self-Portrait in a Convex Mirror - Google Art ProjectFXD.jpg` |
| | Portrait of Lucrezia Panciatichi | Bronzino, c. 1540 | 0.80 | exact 4:5 | `Agnolo di Cosimo Tori detto Bronzino (Firenze, 1503-1572) - Ritratto di Lucrezia Panciatichi - 736 - Uffizi Gallery.jpg` |
| | Eleonora di Toledo with her Son Giovanni | Bronzino, c. 1545 | 0.82 | safe | `Bronzino - Eleonora di Toledo col figlio Giovanni - Google Art Project.jpg` |
| | Portrait of a Man with a Quilted Sleeve | Titian, c. 1510 | 0.82 | safe | `Titian - Portrait of a man with a quilted sleeve.jpg` |
| | Bacchus and Ariadne | Titian, 1520–23 | 1.11 | mild | `Titian - Bacchus and Ariadne - Google Art Project.jpg` |
| | Venus of Urbino | Titian, 1534 | 1.42 | `focal_x` 0.45; reclining nude — a deliberate tone call | `Tiziano - Venere di Urbino - Google Art Project.jpg` |
| | Two Venetian Ladies | Carpaccio, c. 1490 | 0.67 | safe | `Vittore Carpaccio 079.jpg` |
| | The Chess Game | Sofonisba Anguissola, 1555 — the roster's one woman painter | 1.27 | `focal_x` 0.45 | `The Chess Game (Sofonisba Anguissola) 1555 (4096x3236px).jpg` |
| | Parnassus | Mantegna, 1497 | 1.21 | `focal_x` 0.5 | `La Parnasse, by Andrea Mantegna, from C2RMF retouched.jpg` |
| | Allegory of Good Government | Lorenzetti, 1338 — pre-Renaissance, but the civic-fresco subject is on the nose for this game | 1.85 | `focal_x` 0.25 — the enthroned Commune | `Ambrogio Lorenzetti - Allegory of Good Government - Google Art Project.jpg` |

Northern works, plausible as collected imports rather than local commissions —
keep them a minority of the pool or the city stops reading as Italian:

| Title in game | Work | ar | Crop | Commons file |
|---|---|---|---|---|
| The Arnolfini Portrait | van Eyck, 1434 | 0.73 | safe | `Van Eyck - Arnolfini Portrait.jpg` |
| Self-Portrait at Twenty-Eight | Dürer, 1500 | 0.72 | safe | `Albrecht Dürer - 1500 self-portrait (High resolution and detail).jpg` |
| The Ambassadors | Holbein, 1533 | 1.01 | mild | `Hans Holbein the Younger - The Ambassadors - Google Art Project.jpg` |
| The Tower of Babel | Bruegel, 1563 — a city under construction, which is the whole game | 1.37 | `focal_x` 0.45 | `Pieter Bruegel the Elder - The Tower of Babel (Vienna) - Google Art Project - edited.jpg` |
| Vertumnus | Arcimboldo, 1591 | 0.81 | safe | `Giuseppe Arcimboldo - Rudolf II of Habsburg as Vertumnus - Google Art Project.jpg` |

### Church — `CHURCH_TITLES.painter` (30)

| ★ | Title in game | Work | ar | Crop | Commons file |
|---|---|---|---|---|---|
| ★ | The Adoration of the Magi | Botticelli, Zanobi altar, c. 1475 — replaced the Fra Angelico tondo, which cropped to white corners | 1.23 | `focal_x` 0.5 | `Botticelli - Adoration of the Magi (Zanobi Altar) - Uffizi.jpg` |
| ★ | The Annunciation | Leonardo, c. 1472 | 2.20 | shipped (`focal_x` 0.82) | `Leonardo da Vinci - Annunciazione - Google Art Project.jpg` |
| ★ | Saint Jerome in His Study | Antonello da Messina, c. 1475 — already a pool title, now with its work | 0.79 | safe | `Antonello da Messina - St Jerome in his study - National Gallery London.jpg` |
| ★ | The Last Judgment | Michelangelo, 1536–41 — replaces "Fresco of the Last Judgment" | 0.91 | safe | `Last Judgement (Michelangelo).jpg` |
| ★ | The Madonna of the Goldfinch | Raphael, 1506 | 0.72 | safe | `Raffaello Sanzio - Madonna del Cardellino - Google Art Project.jpg` |
| ★ | The Sistine Madonna | Raphael, 1512 | 0.74 | safe | `Raphael - The Sistine Madonna - Google Arts & Culture.jpg` |
| ★ | The Lamentation of Christ | Mantegna, c. 1480 | 1.17 | mild — the foreshortened body runs the full width | `Andrea Mantegna - Lamentation of Christ - Pinacoteca di Brera (Milan).jpg` |
| ★ | The Baptism of Christ | Verrocchio + Leonardo, c. 1475 — the workshop story every player half-knows | 0.84 | safe | `Andrea del Verrocchio, Leonardo da Vinci - Baptism of Christ - Uffizi.jpg` |
| ★ | The Mystical Nativity | Botticelli, c. 1500 | 0.69 | safe | `Mystic Nativity, Sandro Botticelli.jpg` |
| ★ | The Annunciation with Saint Emidius | Crivelli, 1486 | 0.71 | safe | `The Annunciation, with Saint Emidius - Carlo Crivelli - National Gallery.jpg` |
| ★ | The Expulsion from the Garden of Eden | Masaccio, c. 1425 | 0.78 | safe — use the restoration file, not the 0.56 chapel photo | `Masaccio-TheExpulsionOfAdamAndEveFromEden-Restoration.jpg` |
| ★ | The Montefeltro Altarpiece | Piero della Francesca, c. 1472 — replaces "Altarpiece of the Virgin" | 0.69 | safe | `Piero della Francesca 046.jpg` |
| | Saint Augustine in His Study | Botticelli, c. 1480 — pairs with the Antonello Jerome | 0.82 | safe | `Sandro Botticelli 052.jpg` |
| | The Transfiguration | Raphael, 1518–20 | 0.68 | safe | `Raphaël, La Transfiguration, 1518–1520, huile sur bois, 405 × 278 cm, Musées du Vatican, Pinacothèque, inv. 4.jpg` |
| | Portrait of Pope Julius II | Raphael, 1511 — the patron who commissioned half this list | 0.74 | safe | `Raffaello Sanzio - Ritratto di Papa Giulio II (National Gallery, London).jpg` |
| | The Madonna of the Magnificat | Botticelli, c. 1483 | 1.00 | tondo — the crop keeps a rectangle of middle, losing the circle | `Madonna of the Magnificat.png` |
| | The Deposition | Pontormo, 1528 | 0.62 | tall, but the figures fill top to bottom | `Jacopo Pontormo - Kreuzabnahme Christi.jpg` |
| | The Madonna of the Harpies | Andrea del Sarto, 1517 | 0.84 | safe | `Andrea del Sarto - Madonna delle Arpie - Google Art Project.jpg` |
| | The Ognissanti Madonna | Giotto, c. 1310 | 0.65 | tall; gold ground — see quantization caveat | `Madonna di Ognissanti by Giotto.jpg` |
| | The Vision of Saint Bernard | Filippino Lippi, 1486 | 0.95 | mild | `Bernardo claraval filippino lippi.jpg` |
| | The Holy Trinity | Masaccio, 1425–28 | 0.62 | tall — the crop lands on Christ and drops God's head and the donor tomb | `Masaccio, Holy Trinity, 1425-28, Santa Maria Novella, Florence.jpg` |
| | The Virgin of the Rocks | Leonardo, c. 1483–86 (Louvre) | 0.63 | tall; the pyramid group holds the middle | `Leonardo Da Vinci - Vergine delle Rocce (Louvre).jpg` |
| | Madonna and Child with Two Angels | Filippo Lippi, c. 1465 | 1.24 | `focal_x` 0.45 | `Madonna with child and angels.jpg` |
| | The Damned Cast into Hell | Signorelli, 1499–1504 | 1.05 | mild | `Luca Signorelli - The Damned - WGA21220.jpg` |
| | The Agony in the Garden | Bellini, c. 1459 | 1.59 | `focal_x` 0.4 | `Bellini,Giovanni - Agony in the Garden - National Gallery.jpg` |
| | The Madonna of the Meadow | Bellini, c. 1505 | 1.29 | `focal_x` 0.45 | `Giovanni bellini, madonna del prato 01.jpg` |
| | The Delivery of the Keys | Perugino, 1481–82 | 1.61 | `focal_x` 0.5 | `Perugino - Entrega de las llaves a San Pedro (Capilla Sixtina, 1481-82).jpg` |
| | The Adoration of the Shepherds | Giorgione, c. 1505 | 1.22 | `focal_x` 0.6 — the holy group sits right | `Giorgione - Adoration of the Shepherds - National Gallery of Art.jpg` |
| | The Descent from the Cross | van der Weyden, c. 1435 | 1.29 | `focal_x` 0.5 | `El Descendimiento, by Rogier van der Weyden, from Prado in Google Earth.jpg` |
| | The Portinari Altarpiece | Hugo van der Goes, 1475 — Flemish, commissioned by a Medici agent in Bruges for Florence | 0.67 | verify the file frames the centre panel, not a wing | `Hugo van der Goes Portinari 04.JPG` |
| | The Burial of the Count of Orgaz | El Greco, 1586 | 0.82 | safe | `El Greco - The Burial of the Count of Orgaz.JPG` |

## Bench — verified, deliberately not rostered

| Work | ar | Why benched | Commons file |
|---|---|---|---|
| Leonardo, *The Last Supper*, 1495–98 | 1.92 | at 4:5 you get four apostles; the composition is the point and the crop destroys it | `Leonardo da Vinci (1452-1519) - The Last Supper (1495-1498).jpg` |
| Michelangelo, *Creation of Adam*, c. 1512 | 2.20 | two hands at 48px is a gamble; the famous gap is one pixel | `Michelangelo - Creation of Adam (cropped).jpg` |
| *The Ideal City*, Urbino, c. 1480–90 | 3.47 | the perfect subject, the worst ratio here — would need a detail crop, not the panel | `Formerly Piero della Francesca - Ideal City - Galleria Nazionale delle Marche Urbino.jpg` |
| Botticelli, *Venus and Mars*, c. 1485 | 2.50 | two-figure panel; either figure alone reads thin | `Venus and Mars National Gallery.jpg` |
| Bosch, *Garden of Earthly Delights*, c. 1500 | 1.76 | triptych; a 4:5 slice is unreadable and the subject is a tone mismatch anyway | `The Garden of Earthly Delights by Bosch High Resolution.jpg` |
| Veronese, *The Wedding at Cana*, 1563 | 1.49 | 130 figures at 48×60 is mush | `Les Noces de Cana - Paolo Veronese - Musée du Louvre Peintures INV 142 ; MR 384.jpg` |
| Gentile Bellini, *Procession in Piazza San Marco*, 1496 | 3.79 | only PD files are pre-cropped strips | `Accademia - Procession in piazza San Marco by Gentile Bellini (cropped).jpg` |
| Mantegna, *San Zeno Altarpiece*, 1457–60 | 1.38–1.50 | every PD file is an in-situ photo including the frame and wall | `Verone - San Zeno - Retable de Mantegna..jpg` |
| Bellini, *San Zaccaria Altarpiece*, 1505 | 0.56 | the obvious "Altarpiece of the Virgin" — but the crop is a midriff band; Montefeltro rosters instead | `Pala di San Zaccaria (Venezia).jpg` |
| Titian, *Assumption of the Virgin*, 1516–18 | 0.54 | tall *and* the only PD file is 1050px — barely over the 960px thumb the script requests | `Tizian 041.jpg` |
| Duccio, *Maestà*, 1308–11 | 1.06 | pre-Renaissance gold ground; only mid-res PD files exist | `Maest 0 duccio 1308-11 siena duomo.jpg` |
| Uccello, *The Battle of San Romano*, c. 1438–40 | 1.77 | **tried and rejected** — at 48×60 the lances and horses read as one brown mass at `focal_x` 0.20, 0.35 and 0.50 alike; *Pallas and the Centaur* took the slot | `San Romano Battle (Paolo Uccello, London) 01.jpg` |
| Fra Angelico + Lippi, *Adoration of the Magi* tondo, c. 1440–60 | 1.00 | **shipped Aug 2026, then replaced** — the file is a tondo on white, so the 4:5 crop keeps white corners that read as a rendering bug | `Fra Angelico, Fra Filippo Lippi, The Adoration of the Magi.jpg` |
| Leonardo, *Vitruvian Man*, c. 1490 | 0.74 | a drawing, not a painting — the one candidate that suits an *architect* title, if blueprint art ever wants real assets | `Da Vinci Vitruve Luc Viatour.jpg` |

Blocked purely by the one-title-one-work rule — each duplicates a rostered
title and would need a distinguishing name to ship:

| Work | ar | Collides with | Commons file |
|---|---|---|---|
| Piero della Francesca, *Baptism of Christ*, 1450s | 0.70 | Verrocchio/Leonardo *Baptism* | `Piero della Francesca - Battesimo di Cristo (National Gallery, London).jpg` |
| Gentile da Fabriano, *Adoration of the Magi*, 1423 | 1.58 | the shipped Botticelli *Adoration* | `Gentile da fabriano, adorazione dei magi.jpg` |
| Ghirlandaio, *Saint Jerome in His Study*, 1480 | 0.65 | the Antonello *Jerome* | `Domenico Ghirlandaio - St Jerome in his study.jpg` |
| Simone Martini, *Annunciation*, 1333 | 0.82 | the Leonardo *Annunciation* | `Simone Martini 080.jpg` |
| Fra Angelico, *Annunciation* (Prado), c. 1426 | 1.01 | the Leonardo *Annunciation* | `La Anunciación, by Fra Angelico, from Prado in Google Earth.jpg` |
| Tintoretto, *Last Supper*, 1594 | 1.50 | benched Leonardo *Last Supper* | `Tintoretto, Jacopo - Ultima cena - San Giorgio Maggiore.jpg` |

## Field notes — what the first 24 taught

The contact sheet is not optional. Three of twenty-four sources failed in a
way no amount of metadata reading would have caught:

- **Greyscale uploads hide in plain sight.** Every Met file of the Petrus
  Christus *Goldsmith* is a black-and-white study photo except `DT711` — same
  title, same CC0 tag, same plausible dimensions. The tell before you look is
  file size: the B&W version quantized to 4.9 KB against a ~2 KB norm, because
  photographic noise defeats a 16-colour palette.
- **Tondo files carry their background.** The Fra Angelico *Adoration* had
  shipped for months; against 23 neighbours it was obvious that the circle on
  white reads as a bug, not a tondo. Swapped for Botticelli's rectangular
  Zanobi altar under the same title — the map is title-keyed, so it was a
  one-line source change.
- **Some famous panels simply will not survive 48×60.** *The Battle of San
  Romano* is a brown mass of lances at every `focal_x`. No knob fixes it;
  budget for reject-and-replace the way the statue pipeline does.

## Gaps and cautions

- **No `focal_y`.** Tall panels (ar < 0.65 — Masaccio's *Trinity*, Bellini's
  *San Zaccaria*, Titian's *Assunta*) get a vertically centred crop that can
  land between the two things worth seeing. The lazy fix is to prefer
  near-4:5 sources, which the roster mostly does; if a tall altarpiece really
  has to ship, add `focal_y` next to `focal_x` rather than hand-cropping and
  re-uploading a file.
- **Wide frescoes are this pipeline's version of the statue-relief trap.**
  The crop keeps ~40% of a 2:1 panel, and what makes the work famous is
  usually in the part it throws away. Use an official detail-crop file or
  bench it.
- **Tondi crop badly.** A circular composition (Doni, *Magnificat*) squeezed
  to 4:5 loses the arcs that make it read as a tondo and keeps a rectangle of
  middle.
- **Gold grounds are unproven.** 16-colour quantization on flat gilding
  (Giotto, Gentile, Duccio, Crivelli) may posterize into bands. Eyeball one at
  4× before committing the group.
- **Portrait-heavy by construction.** The safe-ar filter selects for
  portraits, because that is what 4:5 panels are. If the gallery starts
  reading as a wall of heads, the fix is to spend `focal_x` on the narrative
  works (San Romano, Delivery of the Keys, Agony in the Garden) rather than to
  loosen the ratio rule.
