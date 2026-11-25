"""Render thumbnails from uncompressed local LUMO GLB assets.

Run from the project with Blender 4.3 or newer. Point LUMO_MODEL_OUTPUT
at the uncompressed GLB export directory:
LUMO_MODEL_OUTPUT=/tmp/lumo-raw-models blender -b -t 4 --python scripts/render_catalog_previews.py -- \
  /tmp/lumo-catalog-previews corsair-rm850e-2023 samsung-990-pro-2tb

Convert the resulting transparent PNGs to WebP for the catalog.
"""

from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_product_models import OUTPUT, cameras_and_lighting


ANGLES = {
    'case': (-0.75, 0.3, 0.85),
    'cpu': (-0.92, 0.33, 0.38),
    'gpu': (-0.65, -0.91, 0.52),
    'other': (-0.70, 0.46, 0.73),
}


def camera_angle(identifier):
    if 'ryzen' in identifier or 'intel-core' in identifier:
        return ANGLES['cpu']
    if 'rtx' in identifier or 'sapphire-pulse' in identifier:
        return ANGLES['gpu']
    if identifier.startswith('fractal') or 'flow' in identifier:
        return ANGLES['case']
    return ANGLES['other']


def to_millimeters(position):
    return (position.x * 1000, position.z * 1000, -position.y * 1000)


def render(identifier, destination):
    source = OUTPUT / f'{identifier}.glb'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    corners = [
        obj.matrix_world @ Vector(point)
        for obj in bpy.context.scene.objects
        if obj.type == 'MESH'
        for point in obj.bound_box
    ]
    if not corners:
        raise ValueError(f'Model {source} has no renderable geometry')
    bounds_min = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    bounds_max = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    bounds = bounds_max - bounds_min
    center = (bounds_min + bounds_max) * .5
    angle = camera_angle(identifier)
    direction = Vector((angle[0], -angle[2], angle[1])).normalized()
    camera = center + direction * max(0.195, bounds.length * 1.9)
    cameras_and_lighting(to_millimeters(center), to_millimeters(camera), bounds.length * 1.12)
    scene = bpy.context.scene
    scene.eevee.taa_render_samples = 12
    scene.render.resolution_x = 460
    scene.render.resolution_y = 460
    scene.render.filepath = str(destination / f'{identifier}.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    output_dir = Path(args[0]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    for part_id in args[1:]:
        if not part_id.replace('-', '').isalnum():
            raise ValueError(f'Invalid part identifier: {part_id}')
        render(part_id, output_dir)
