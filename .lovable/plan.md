

## Fix Creator Card Thumbnail Cropping

**Problem:** Creator card thumbnails use `object-cover` in a small fixed 144x144px area, which crops faces and images so you can't see the full picture.

**Solution:** Change the thumbnail image fitting from `object-cover` to `object-contain` with a neutral background, so the entire image is visible without cropping. This preserves the card layout while showing the full creator photo.

### Changes

**File: `src/components/creator-browse/CreatorCard.tsx`**

1. On the `<img>` element (line 129), change `object-cover` to `object-contain` and add a light gray background (`bg-gray-100`) so letterboxed areas look clean instead of white.

2. Apply the same `bg-gray-100` to the thumbnail container div (line 124) for consistency.

### Technical Detail

- Line 124: Add `bg-gray-100` to the thumbnail wrapper div
- Line 129: Change `className` from `"w-full h-full object-cover"` to `"w-full h-full object-contain"`

No other files affected. The card dimensions and layout remain identical.

