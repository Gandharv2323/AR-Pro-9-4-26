# How to Add Your Own 3D Assets

## Folder Structure

Drop `.glb` files into the correct subfolder — they'll **auto-appear** in the catalogue:

```
assets/models/
├── glasses/
│   ├── glasses_01.glb    ← Classic Oval
│   ├── glasses_02.glb    ← Aviator Gold
│   └── ...               ← Add more here
├── shirts/
│   ├── shirt_01.glb
│   └── ...
├── hats/
│   └── hat_01.glb
├── watches/
│   └── watch_01.glb
└── bags/
    └── bag_01.glb
```

## File Format

| Format | Support | Notes |
|--------|---------|-------|
| `.glb` | ✅ Best | Binary GLTF, includes textures. Recommended. |
| `.gltf` | ✅ | Text GLTF, separate textures. Ensure textures are alongside. |

**PBR materials are fully supported:**
- `metalness` + `roughness` maps → photorealistic look
- `normalMap` → surface detail
- `emissiveMap` → glow effects (great for glowing rims)

## Coordinate System

Zyro AR expects models **centred at origin** with:
- Glasses: front of lenses facing **+Z**, width along **±X**
- Shirts: collar at top **+Y**, waist at **-Y**
- Hats: brim at bottom **-Y**, crown at **+Y**

If model appears facing wrong direction, rotate it in Blender before exporting.

## Scale

Models are auto-scaled based on face landmarks.
Rough target sizes (in Blender units = metres):
- Glasses: ~0.14m wide
- Hat: ~0.30m wide
- Shirt: ~0.50m wide

## Recommended Free Sources

- [Sketchfab](https://sketchfab.com) — search "glasses low poly" or "sunglasses"
- [Google Poly (archived)](https://poly.pizza)
- [Kenney.nl](https://kenney.nl) — game assets, CC0 license
- Create in [Blender](https://blender.org) (free) → export as `.glb`

## Update manifest.json

After adding models, add entries to `manifest.json`:

```json
{
  "id": "glasses_06",
  "category": "glasses",
  "name": "My Cool Glasses",
  "modelUrl": "assets/models/glasses/my_cool_glasses.glb",
  "thumbnail": "assets/thumbnails/my_cool_glasses.jpg",
  "isNew": true
}
```

`thumbnail` is optional — a category emoji will be shown if omitted.
