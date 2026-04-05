"""
Build horizontal-strip spritesheets from PixelLab character frames.
Each direction gets its own sheet: frames laid out left-to-right.

Output goes to src/client/public/sprites/characters/<name>/
with files like: walk_south.png, walk_south-east.png, run_south.png, jump_south.png
"""
import os
import sys
from PIL import Image

DIRECTIONS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
ANIMATIONS = {
    'walking': 'walk',
    'running-6-frames': 'run',
    'jumping-1': 'jump',
    'breathing-idle': 'idle',
}

def build_sheets(src_dir: str, name: str, out_base: str):
    out_dir = os.path.join(out_base, name)
    os.makedirs(out_dir, exist_ok=True)

    # Copy idle/rotation sprites as a single horizontal strip
    rot_dir = os.path.join(src_dir, 'rotations')
    if os.path.isdir(rot_dir):
        frames = []
        for d in DIRECTIONS:
            path = os.path.join(rot_dir, f'{d}.png')
            if os.path.exists(path):
                frames.append(Image.open(path))
        if frames:
            w, h = frames[0].size
            strip = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
            for i, f in enumerate(frames):
                strip.paste(f, (i * w, 0))
            strip.save(os.path.join(out_dir, 'idle.png'))
            print(f'  idle: {len(frames)} frames -> {w * len(frames)}x{h}')

    # Build animation strips per direction
    anim_dir = os.path.join(src_dir, 'animations')
    if not os.path.isdir(anim_dir):
        print(f'  No animations directory found')
        return

    for anim_folder, anim_prefix in ANIMATIONS.items():
        anim_path = os.path.join(anim_dir, anim_folder)
        if not os.path.isdir(anim_path):
            continue

        for direction in DIRECTIONS:
            dir_path = os.path.join(anim_path, direction)
            if not os.path.isdir(dir_path):
                continue

            # Collect frames in order
            frame_files = sorted(
                [f for f in os.listdir(dir_path) if f.startswith('frame_') and f.endswith('.png')]
            )
            if not frame_files:
                continue

            frames = [Image.open(os.path.join(dir_path, f)) for f in frame_files]
            w, h = frames[0].size

            # Create horizontal strip
            strip = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
            for i, f in enumerate(frames):
                strip.paste(f, (i * w, 0))

            out_file = f'{anim_prefix}_{direction}.png'
            strip.save(os.path.join(out_dir, out_file))

        print(f'  {anim_prefix}: {len(DIRECTIONS)} directions')


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    asset_dir = os.path.join(base, 'assets', 'art', 'characters', 'test')
    out_base = os.path.join(base, 'src', 'client', 'public', 'sprites', 'characters')

    characters = {
        'male': 'base-male-light',
        'female': 'base-female-light',
        'male-medium': 'base-male-medium',
        'female-medium': 'base-female-medium',
        'male-dark': 'base-male-dark',
        'female-dark': 'base-female-dark',
    }

    for name, folder in characters.items():
        src = os.path.join(asset_dir, folder)
        if not os.path.isdir(src):
            print(f'Skipping {name}: {src} not found')
            continue
        print(f'Building {name} from {folder}...')
        build_sheets(src, name, out_base)

    print('Done!')


if __name__ == '__main__':
    main()
