MOVE Photos v13

Fixes:
- Mouse photo click now uses card-level pointer events instead of relying on the
  viewport's pointer capture.
- Click on a photo: opens detail.
- Drag on a photo (>7px): pans the collage.
- Keyboard Enter/Space still works.
- Removed the empty box below the selected image by forcing hidden fallback
  content to display:none.
- Detail modal is taller/wider.
- Selected image uses object-fit:contain so portrait and landscape photos are
  fully visible.
- Metadata spacing/type sizes are reduced so all information fits without a
  right-side scrollbar.
