# Re-rendering a room

The ten rooms in this demo are not real-time 3D. Each one was path-traced
offline in Blender, once per lighting circuit, and the web app sums those
images live. That is why a scene change is instant and why the lighting is
photometric rather than approximated.

**You do not need Blender to change the lighting.** Every dimmer level,
colour temperature, scene, curtain position, RGB colour and gain lives in
the app, and new scenes — even whole new rooms built from existing plates —
can be authored without ever opening this folder. `scripts/measure-plates.py`
in the repo root measures the result offline, using the same maths as the
shader.

You need what is in here only to change **what is in the room**: the
furniture, the camera, the architecture, or a lighting circuit that was
never rendered.

---

## 1. Install

1. **Blender 4.2 LTS** for macOS (Apple Silicon) from
   [blender.org/download/lts](https://www.blender.org/download/lts/). Drag it
   to Applications and open it once so macOS approves it.
2. The converter's Python dependencies:
   ```
   pip3 install openexr numpy pillow
   ```

## 2. Get the models

The geometry and textures are **not in this repository**. They are 487 MB of
third-party assets from Sketchfab and Poly Haven, plus two 4K sky HDRIs, and
git cannot compress them — every clone would pay for them forever.

Download `uniser-render-models.zip` from the repository's **Releases** page
and unzip it so that `render/models/` exists beside the scripts.

Every asset directory keeps its `license.txt`, and those **are** tracked in
git. Each one records the asset's title, author and source URL, so the set is
re-downloadable by hand if the archive is ever lost — and they are the legal
record for redistribution, which matters more.

### Four assets are not in the archive

Twenty-four of the twenty-eight are CC-BY-4.0: free to redistribute and to
use commercially, provided the author is credited. Four are not, so they are
excluded from the bundle and must be fetched individually from the URLs in
their `license.txt`, by whoever is going to use them, under terms they
accept themselves.

| Asset | Licence | The restriction |
|---|---|---|
| `models/room/armchair` | Sketchfab Standard | Commercial use is fine; redistributing the model file is not |
| `models/cabin/decor_metal_sculpture` | CC-BY-NC-4.0 | No commercial use |
| `models/cabin/sofa_cabin` | CC-BY-NC-ND-4.0 | No commercial use; no distributing modified versions |
| `models/lobby/decor_2` | CC-BY-NC-SA-4.0 | No commercial use; share-alike |

The three **NC** assets are a live question rather than a handover
technicality: they appear in the CXO Cabin and the Hotel Lobby, which are
part of a commercial sales demo. If this is shown or sold commercially they
should be swapped for CC-BY or CC0 equivalents and those two rooms
re-rendered. The Sketchfab Standard armchair in the Hotel Room is fine to
keep using — only republishing the file is restricted.

Note also that CC-BY-4.0 requires the author to be credited "wherever you
share it". The twenty-four credit lines are in the `license.txt` files; the
deployed demo does not currently surface them anywhere.

## 3. Which script built which room

The plate sets in `public/plates/` came from these scripts and no others.
This mapping is the one thing that cannot be recovered by looking at the
files, so it is worth trusting over a filename: three of these are *not* the
highest version number in the author's working folder.

| Room | Script | Renders | Plate sets in `public/plates/` |
|---|---|---|---|
| Hotel Restaurant | `restaurant_build_v7i.py` | `--final`, `--daysky` | `restaurant` |
| Car Showroom | `showroom_build_v13.py` | `--final` | `showroom` |
| Hotel Lobby | `lobby_build_v15.py` | `--final` | `lobby` |
| Hotel Room | `room_build_v11.py` | `--final`, `--closed`, `--sheer` | `room`, `room_closed`, `room_sheer` |
| CXO Cabin | `cabin_build_v2.py` | `--final`, `--closed` | `cabin`, `cabin_closed` |
| Office Workspace | `office_own_v2.py` | `--final`, `--closed`, `--fanblur` | `office`, `office_closed` |
| Boardroom | `boardroom_build_v1.py` | `--final`, `--closed`, `--screen` | `boardroom`, `boardroom_closed`, `boardroom_screen` |
| Bedroom | `bedroom_build_v1.py` | `--final`, `--closed`, `--fanblur` | `bedroom`, `bedroom_closed`, `bedroom_fan` |
| Living Room | `living_build_v1.py` | `--final`, `--closed`, `--fanblur` | `living`, `living_closed`, `living_fan` |
| Den / Media Room | `den_build_v4.py` | `--final`, `--closed`, `--screen` | `den`, `den_closed`, `den_screen` |

Two notes on that table.

`office_own_v2.py` is the script that produced the shipped office plates,
confirmed against render timestamps. The author's folder also holds
`office_build_v16.py` and `office_build_v17.py`, which are a later 380-line
revision that was **never rendered**; v16 differs from v17 only in its own
docstring. Re-render the office from either and you will get a different
room from the one the app ships.

`office --fanblur` was never run — `public/plates/office_fan/` does not
exist, and the app handles its absence by showing a spinning hotspot marker
instead of composited blades. Render it and the composite lights up on its
own, with no code change.

## 4. The three passes

Every script takes the same shape. Run from this folder:

```bash
BL=/Applications/Blender.app/Contents/MacOS/Blender

# Build the scene and save the .blend. About a minute.
$BL -b -P den_build_v4.py -- --build

# Low-resolution look check. 10-20 minutes.
$BL -b -P den_build_v4.py -- --preview

# The real thing: 1920x1080, one EXR layer per circuit. Hours.
$BL -b -P den_build_v4.py -- --final
```

Open the `.blend` that `--build` writes to look around before committing to a
render. Numpad 0 is the hero camera; Z then Rendered gives a live preview.

A room with more than one plate set needs one `--final` per set, each with
its own flag:

```bash
$BL -b -P den_build_v4.py -- --final            # curtains open, screen up
$BL -b -P den_build_v4.py -- --final --closed   # curtains closed
$BL -b -P den_build_v4.py -- --final --screen   # curtains closed, screen down
```

Other flags: `--cpu` forces CPU rendering if the GPU path misbehaves,
`--skytest` renders four quick frames at HDRI rotations 0/90/180/270 to
choose a sky angle, `--daylight` and `--daysky` render the exterior passes
separately.

Outputs land in `out_<room>/`: `passes_final*.exr` with one layer per circuit
plus the daylight passes, and `hotspots.json`.

## 5. Converting EXR to web plates

```bash
python3 convert_plates_v4.py out_den/passes_final_0001.exr
```

This writes a `plates/` directory **beside the script**, always with that
name. Move and rename it to its destination yourself:

```bash
mv plates ../public/plates/den
```

Repeat per set. Pass several EXRs in one invocation to merge their layers
into a single set, which is how a separately rendered daylight pass gets
folded in.

What it writes:

- `hd/<layer>.webp` at 1920×1080 and `sd/<layer>.webp` at 960×540, one per
  circuit.
- `manifest.json` — the layer list, dimensions and decode constants.
- `hotspots.json`, copied from the render output if present.
- `still_hd.jpg` / `still_sd.jpg`.

**The still it writes is wrong, by design, and must be replaced.** It is
every circuit at 70% and 2700 K summed together — a state no scene in the
room ever reaches, which is why the shipped ones were overbright and orange.
The app uses the still to hold the frame until the shader lands, so it has to
match the room's *opening scene* or there is a visible jump. Regenerate both
sizes from the repo root:

```bash
npx tsx scripts/dump-state.mts den work > /tmp/den-work.json
python3 scripts/measure-plates.py --dir public/plates/den \
        --still /tmp/den-work.json --out public/plates/den
```

That path drives the real store, settles it, and renders through the app's
own decode, gains and tone curve.

## 6. After a re-render

The gains in `components/stage/plates/profiles/<room>.ts` are a measurement
of a particular render. A new render invalidates them. Re-derive rather than
adjusting by eye:

```bash
python3 scripts/measure-plates.py --dir public/plates/den --gains lumens.json \
        --ref dn_general --target 0.25
python3 scripts/measure-plates.py --dir public/plates/den     # check the targets
```

`--gains` takes a `{layer: lumens}` map built from each circuit's
`fixtures × lumensEach` in the space file. The report checks the curtain
window against where the covering actually changes the picture, so a camera
that has moved fails loudly instead of quietly wiping the wrong rectangle.

## 7. Conventions the app depends on

- **Layer names are the contract.** A pass named `dn_cove` becomes the device
  `dn-cove`. Rename a pass and you rename a circuit.
- **`hotspots.json`** carries `points` — `{u, v, visible}` per circuit and
  per point of interest — and named rectangles. Rect order is
  `[u0, v0, u1, v1]` with **v measured downward**, and a screen's rect drops
  from `v0` to `v1`.
- **Rect names in use:** `fan_rect`, `tv_rect`, `screen_rect`, `curtain_rect`.
- **Check a curtain rect before trusting it.** The den shipped
  `curtain_rect` as `[0, 0, 0.7802, 1]`, which describes the room *beside*
  the drapes rather than the drapes; the space file declares the measured
  band instead and says so. `measure-plates.py` scores a declared window
  against where closing the covering really changes the picture.
- **Empty layers are fine.** The den's five exterior passes are empty because
  it is an enclosed room; the converter skips a pass with no light in it and
  the app treats a missing layer as absent rather than as an error.

## 8. Deliberately not here

Old script versions, the `out_*` render folders, the `.blend` files and the
EXRs. All are reproducible from what is here, and together they came to about
10 GB. The author's working folder has them if a specific historical render
is ever needed.
