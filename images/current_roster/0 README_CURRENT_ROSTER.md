# race full  Directory

- use roster images for the character selection screen, as well as for the paired discord user panel, we will have a the roster image above the assigned user panel to show which player has what character.



# horse full  Directory

- use for middle when picking characters simulating overwatch character selection style
- use as win image as well, we will add a visual efect sequence to along with the image shown

# Racing Sprites Directory

## Required Sprite Files

The game engine expects these small racing sprite files ([varied size]x112px):

- `reinhardt_sprite_small.png`
- `torbjorn_sprite_small.png` 
- `mercy_sprite_small.png`
- `brigitte_sprite_small.png`
- `orisa_sprite_small.png`
- `soldier76_sprite_small.png`

## Sprite Requirements

### Technical Specs
- **Size**: wizes vary, racing sprites should have the y res be 112, x values may differ, for racing, what matters is the center origin of the sprite object crossing the finish line, not the image itself.
- **Format**: PNG with transparency
- **Facing Direction**: All sprites should face **LEFT** by default
- **Style**: Downscaled, pixelated versions of the full horse forms

### Sprite Behavior
- Sprites will automatically flip horizontally when characters go right
- The track system rotates sprites based on direction
- Sprites start facing left and move:
  1. Left along the front straight
  2. Up-left around the left turn  
  3. Right along the back straight
  4. Down-right around the right turn
  5. Back to left on the home straight

### Track Path
Characters follow this path on your `large_map.png`:
- **Start**: Front center (facing left)
- **Path**: Front → Left → Back → Right → Front (oval)
- **Distance**: 1600 meters total
- **Finish**: When distance is completed (not time-based)