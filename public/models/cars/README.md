# Car models

Drop `.glb` files here. Anything in `public/` is served from the site root, so
`public/models/cars/suv.glb` is fetched as `/models/cars/suv.glb`.

## Naming

Name by **body type**, not by vehicle. The showroom has six cars drawn from
three silhouettes, and the paint colour is applied per car from
`SH_CARS` in `components/stage/rooms3d/CarShowroom3D.tsx` — so three models
cover the floor:

    coupe.glb     low two-door    (used by the silver coupé and the red sports car)
    saloon.glb    four-door       (used by the dark, white and black saloons)
    suv.glb       tall estate     (the hero on the turntable)

A fourth file named after a car's id — `suv-hero.glb`, say — overrides the
body type for that one car if the hero deserves its own model.

## What works best

- **`.glb`**, binary glTF. `.blend`, `.max` and `.fbx` need a Blender export
  pass first; send them anyway and I will say whether they convert cleanly.
- **Under ~5 MB each after compression.** Marketplace models commonly arrive
  at 50–200 MB with 4K textures. They get decimated, Draco-compressed and
  dropped to 1–2K maps before shipping — a demo that downloads 600 MB of cars
  is not a demo.
- **Paint and glass on separate materials**, if the model allows it. The paint
  is then recoloured per car and still responds to the scene lighting, instead
  of being a fixed colour baked into the asset.
- **Facing −X**, sitting on the floor at the origin, roughly 4.7–4.9 m long.
  None of that is essential — orientation and scale are a transform — but
  matching it means no per-model fiddling.

## Licensing

Generic or concept vehicles only. Models of real marques are usually licensed
*editorial use only*, which excludes a commercial sales tool, and a badged car
in a client's demo is a trademark risk that belongs to nobody here. Keep the
licence file next to the model.
