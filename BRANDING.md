# Nestworth, branding & icon

This documents the app name, the icon concept, and ready-to-paste prompts for
generating a higher-fidelity or alternative icon in Midjourney, DALL-E, and other
tools. A matching hand-built vector icon already ships in the app
(`app/build/icon.svg`, `app/public/favicon.svg`, `app/build/icon.png`), so these
prompts are for polishing or exploring variations, not a blocker.

> Trademark note: names below are chosen to be uncommon and finance-evocative,
> but you must verify domain and trademark availability before any commercial or
> public release. For a personal, local app this is not a concern.

---

## Name

**Chosen: Nestworth** (applied in `app/src/lib/constants.ts` `APP_NAME` and
`app/package.json`). It fuses "nest egg" and "net worth", which is exactly what
the app tracks, and it is easy to say and spell. To change it, edit `APP_NAME`,
`package.json` `name`/`productName`/`build.appId`, and `index.html` `<title>`.

### Alternatives (all coined or uncommon, to reduce collision)

| Name | Idea |
|---|---|
| **Nestworth** (chosen) | Nest egg + net worth |
| Penvault | Pennies saved + a vault (security) |
| Ledgerly | Ledger + a soft modern suffix |
| Sumworth | Sum of what you are worth |
| Tallyloom | Weaving your tallies together |
| Coinquil | Coin + tranquil (calm money) |
| Worthwell | Net worth + wellness |
| Keelwise | Keel (steady ship) + wise, steady finances |
| Cairnly | Cairn (stacked stones marking progress) |
| Fjordly | Deep, calm Nordic waters, quiet money |

Avoid: Mint, Monarch, Tally, Koinly, Fathom, Sure, Ghostfolio, Copilot Money,
Rocket Money, and similar existing finance brands.

---

## Icon concept

A rounded-square tile with an indigo gradient and a white "growth" glyph: three
ascending bars behind a rising trend arrow. It reads instantly as personal
finance and stays legible down to 16px. Keep it flat, geometric, and
single-accent; no gloss, no literal dollar signs, no sparkles.

- Gradient: `#4338CA` -> `#4F46E5` -> `#6366F1` (top-left to bottom-right)
- Glyph: pure white, rounded caps; back bars at 55% and 75% opacity for depth
- Corner radius: about 24% of the tile
- Safe area: keep the glyph within the centre 70%

---

## Midjourney (v6 / v7)

Primary (app icon):

```
a minimalist finance app icon, rounded square tile with a smooth indigo gradient
from #4338CA to #6366F1, centered white geometric glyph of three ascending bars
behind a rising trend arrow, flat vector, clean geometric shapes, rounded stroke
caps, generous padding, subtle depth, single accent color, no text, no dollar
sign, crisp at small sizes, iOS app icon style, studio background --ar 1:1
--style raw --v 6.1
```

Alternative concepts to explore (swap the glyph clause):

```
... centered white glyph of a stylized bird nest cradling three coins with a
small upward arrow, flat vector ... --ar 1:1 --style raw --v 6.1
```

```
... centered white monogram letter N formed by an upward trending line and a
coin dot, flat vector, negative space ... --ar 1:1 --style raw --v 6.1
```

Wordmark (optional):

```
modern fintech wordmark logo "Nestworth", lowercase geometric sans-serif,
indigo #4F46E5, tight letter spacing, a small ascending-bars mark as the dot over
a letter, on white, vector, minimal, no gradient background --ar 3:1 --style raw
--v 6.1
```

Add `--no text, letters, words, dollar sign, glossy, 3d, drop shadow, photo,
realistic` to suppress unwanted elements.

---

## DALL-E 3 (ChatGPT) or Bing Image Creator

DALL-E prefers full sentences and follows color/detail instructions well:

```
Design a modern personal-finance app icon as a single square image. A rounded
square tile filled with a smooth diagonal indigo gradient from deep indigo
(#4338CA) at the top-left to a lighter indigo (#6366F1) at the bottom-right. In
the center, a clean white geometric symbol: three ascending rounded bars with a
rising trend arrow sweeping up to the right over them. Flat vector style,
rounded stroke ends, balanced padding, subtle sense of depth by making the two
back bars slightly translucent. No text, no letters, no dollar sign, no gloss,
no drop shadow. It must stay clear and recognizable at very small sizes. Minimal,
premium, trustworthy.
```

For a set: append "Provide it centered on a plain light-gray background so it can
be cropped to a square app icon."

---

## Stable Diffusion / Ideogram / SDXL

Prompt:

```
flat vector app icon, rounded square, indigo gradient background #4338CA to
#6366F1, white minimalist growth glyph of ascending bars and a rising arrow,
geometric, clean, centered, high contrast, crisp edges, dribbble, behance,
minimal, 1:1
```

Negative prompt:

```
text, letters, watermark, dollar sign, currency symbol, gloss, glossy, 3d,
bevel, drop shadow, photo, realistic, noise, gradient banding, clutter, busy
```

Ideogram handles small in-icon text if you ever want the "N" monogram; keep the
same colors.

---

## Turning a generated image into app icons

If you generate a raster you like, export a 1024x1024 PNG with a transparent or
solid background, drop it in `app/build/icon.png` (electron-builder converts it to
the Windows `.ico` automatically), and replace `app/public/favicon.svg` /
`app/build/icon.svg` if you also have a vector. Then `npm run dist` picks it up.
The included `npm run icon` script rasterizes the current SVG to
`build/icon.png` via sharp.
