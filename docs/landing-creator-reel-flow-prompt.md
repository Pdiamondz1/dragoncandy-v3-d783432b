# Landing "Creator showreel" — Google Flow / Veo prompt package

Reference for generating the ambient reel that fills the **Creator hub** `VideoSlot`
on the Dark-Luxe landing (`src/components/landing/CreatorHubSection.tsx`, the
`CREATOR_REEL` / `CREATOR_REEL_POSTER` constants).

## Constraints the reel must satisfy

From the landing code (`VideoSlot.tsx`):

- **Plays muted, looped, ambient** → must read with **zero sound** and **loop without a
  jarring cut**. Audio is a bonus (only heard if a visitor taps the controls), not the story.
- **16:9, no text** → the slot is `aspect-video` and the section already shows the
  "Creator hub / level up" headline, so **no subtitles, no on-screen text, no rendered
  logos** (Veo mangles text/logos anyway — brand it with *teal + pink lighting* instead).

From Flow / Veo 3.1 (mid-2026):

- Generates **4 / 6 / 8s clips** at up to **1080p, 16:9**.
- **"Extend"** chains ~7s hops (up to ~148s) for a longer montage.
- For an ambient background loop, a single tight **8s clip is cleanest** (smallest file,
  easiest loop). Extend only for a richer showreel.
- Prompt framework: `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance] + [Audio]`,
  with a specific shot type + camera move.

---

## Recommended concept — "The Craft"

Matches the section copy best ("creators sharpen their craft… get booked") and shows the
creator↔restaurant duality in one frame. Paste into Flow (Veo 3.1, 16:9, 1080p):

```text
Cinematic medium tracking shot, shallow depth of field, slow dolly-in. A stylish
young content creator in her mid-20s, warm brown skin, natural curls, casual-chic
outfit, holds a smartphone on a small gimbal and films an overhead shot of a vibrant
gourmet dish — glistening tacos with fresh garnish and a drizzle of sauce — on a dark
marble restaurant table. Faint steam rises. She smiles, confident and in flow, fine-
tuning the angle. Context: a moody upscale restaurant interior, warm Edison bulbs
melting into soft bokeh, deep charcoal shadows, with subtle teal and magenta neon rim
light catching her hair and the edge of the phone. Style: premium, editorial, modern,
low-key cinematic; teal-and-pink accent glow against near-black tones. The camera
pushes in slowly and settles. Audio: warm lo-fi hip-hop beat, soft restaurant murmur,
faint clink of cutlery. No subtitles, no text overlays, no on-screen logos.
```

## Alternate A — "Crave" (food-hero, the "candy")

Pure texture; safest loop because there's no face/hands continuity to break. Great if you
want the reel to feel like mood, not narrative:

```text
Extreme close-up macro, cinematic slow motion, slow rack focus. A chef's hands plate
a luxurious dessert — dark chocolate shards, a dusting of gold, a swirl of pink
raspberry coulis — on matte black ceramic. A thin ribbon of sauce falls in slow
motion; focus pulls from the falling sauce to the finished plate. Context: a dark,
premium restaurant kitchen pass, deep shadows, faint glints of stainless steel.
Lighting: dramatic low-key, a teal kicker light from the left and a soft magenta glow
from the right against a near-black background. Hyper-detailed, glossy, editorial food
cinematography. Audio: deep cinematic ambient hum, a single soft chime, a gentle
sizzle. No subtitles, no text, no logos.
```

## Alternate B — "Level Up" (energy montage)

Faster, more people, growth feeling. Build as **4 × 8s clips chained in Flow's
Extend/Scenebuilder** — generate clip 1, then Extend with each next prompt. Keep
lighting + wardrobe identical across clips so the cuts feel intentional:

1. Creator filming b-roll of a sizzling dish, gimbal move, teal/pink rim light.
2. Over-the-shoulder: same creator editing the clip on a laptop, color grade glowing on her face.
3. Phone screen close-up: the post going live, a follower count ticking up (numbers only, no UI text).
4. Creator and a restaurant owner laughing together at the table, hero dish between them, warm + teal/pink lighting.

---

## Consistency + quality tips

- **Use "Ingredients"** for a consistent look: upload one reference still (a Nano Banana Pro
  dark-luxe frame, or a brand-lit photo) as Ingredient A so every clip shares the teal/pink
  palette and grain.
- **Generate 3–4 takes per prompt and pick the cleanest** — Veo can warp hands/food/small props.
- **For the loop:** prefer continuous motion (slow push/orbit) over a big reveal, so the hard
  loop-cut is subtle. If a take is perfect but the cut is visible, add a short crossfade in post.
- **Poster frame:** generate a matching 1920×1080 still in Nano Banana Pro (same prompt,
  "single cinematic frame") for `CREATOR_REEL_POSTER`, or grab a clean first frame.

---

## When the MP4 is ready — export → host → wire

1. **Web-optimize** (Flow exports are heavy; this strips it down + front-loads the moov atom
   so it starts instantly):

   ```bash
   # ambient version (silent — what the landing actually plays):
   ffmpeg -i flow-export.mp4 -c:v libx264 -profile:v high -pix_fmt yuv420p \
     -crf 24 -vf "scale=1920:-2" -movflags +faststart -an creator-reel.mp4
   ```

   Target **< ~5–8 MB** for a snappy mobile load. (Keep audio instead of `-an` with
   `-c:a aac -b:a 128k` if you want sound when a visitor taps the controls.)

2. **Host on Supabase Storage** — upload to a public bucket with a long cache-control:
   `https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/landing/creator-reel.mp4`

3. **Wire it in** on a **fresh branch off latest `origin/main`** (the old
   `feat/landing-video-autoplay` branch is already merged) — set `CREATOR_REEL` +
   `CREATOR_REEL_POSTER` in `CreatorHubSection.tsx`, `npm run build`, Codex second review, PR.

---

## Sources

- [Veo 3.1 prompting guide — Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Veo prompt guide — Google DeepMind](https://deepmind.google/models/veo/prompt-guide/)
- [Veo 3.1 in Flow workflow guide — Skywork](https://skywork.ai/blog/veo-3-1-flow-ultimate-guide/)
