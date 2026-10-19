# Xenri Japanese Cuisine · website

A static, no-build site. Every file sits in one flat folder, so you can drag the whole set into a GitHub repo and deploy it on Cloudflare Pages without a build step.

## Files

| File | What it does |
| --- | --- |
| `index.html` | All page content and SEO (Open Graph tags, Restaurant schema) |
| `styles.css` | Design tokens, layout, responsive rules, reduced-motion rules |
| `app.js` | Lenis smooth scroll on GSAP's ticker, ScrollTrigger scenes, SplitText reveals, menu, magnetic buttons |
| `scene.js` | The WebGL background film ("sumi ink in pond water"). It scrubs with scroll, ripples under the cursor, and changes palette per section |
| `charts.js` | Bklit-style interactive charts (honours timeline, review distribution, live service clock) plus the open/closed status in KL time |
| `favicon.svg` | Browser tab icon |
| `404.html` | Not-found page (Cloudflare Pages serves it automatically) |
| `_headers` | Cloudflare Pages caching and security headers |
| `robots.txt`, `sitemap.xml` | Search engine basics |

Libraries load from jsdelivr at pinned versions: GSAP 3.14.2 (core, ScrollTrigger, SplitText) and Lenis 1.3.26. Fonts are Shippori Mincho and Zen Kaku Gothic New from Google Fonts.

## Deploy

1. Create a new GitHub repository, choose **Add file → Upload files**, drag in every file from this folder and commit.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Build settings: Framework preset **None**, build command **empty**, build output directory **/**.
4. Deploy, then add the custom domain under **Custom domains**.

## Before you point xenri.com at Cloudflare (important)

The photos, the two PDF menus and the PDPA notice currently load from the client's existing WordPress site (`https://xenri.com/wp-content/uploads/...`). Once the xenri.com DNS moves to Cloudflare Pages, those links stop working.

Before switching DNS:

1. Download each file referenced under `https://xenri.com/wp-content/uploads/` in `index.html` and `styles.css` into this folder. Keep the original file names.
2. Find and replace in `index.html`:
   - `https://xenri.com/wp-content/uploads/2022/10/` → nothing (empty)
   - `https://xenri.com/wp-content/uploads/2022/11/` → nothing
   - `https://xenri.com/wp-content/uploads/2024/03/` → nothing
   - `https://xenri.com/wp-content/uploads/2024/08/` → nothing
   - `https://xenri.com/wp-content/uploads/2025/09/` → nothing
3. Leave the `og:image` and schema `image` URLs absolute, but change them to the new location, e.g. `https://xenri.com/Main-Page_1-scaled.jpg`.

The originals are 2560px wide. Resizing them to about 1800px (JPG quality 80) will make the site noticeably faster.

## Optional: a real background film

`scene.js` looks for a file named `xenri-film.mp4` next to `index.html`. If it is there, the video is pulled into the WebGL layer, scrubbed by scroll, graded to each section's palette and rippled by the cursor. If it is missing, the procedural ink-and-water film plays instead. This is the normal state and needs no setup.

For smooth scroll-scrubbing, encode with a keyframe on every frame, no audio, and keep it under about 12 MB:

```
ffmpeg -i source.mov -an -c:v libx264 -preset slow -crf 24 -g 1 -pix_fmt yuv420p -movflags +faststart -vf scale=1600:-2 xenri-film.mp4
```

Slow, dark footage works best: steam over a bowl, a knife through fish, koi under the corridor, sake being poured.

## Editing content

- **Copy, links, dishes, rooms:** `index.html`. Each section is commented (`<!-- HERO -->`, `<!-- MENUS -->` and so on).
- **Opening hours:** `SERVICES` at the top of `charts.js` (drives the live status everywhere) plus the hours table and schema in `index.html`.
- **Honours chart data:** `HONOURS` in `charts.js`. **Review numbers:** `REVIEWS` in `charts.js`. Update these every few months.
- **Colours and type:** the `:root` tokens at the top of `styles.css`.
- **Background palette per section:** `TONES` in `scene.js`. Each section's `data-tone` attribute picks its row.

## Facts to confirm with the client

These came from public sources and should be checked before launch:

- **Address.** This site uses the address you supplied (Lot 20, 22 & 24, Jalan AW/1, Wisma Elken). The current xenri.com lists "Lot 9, Lorong 4/137C, Batu 5, Jalan Kelang Lama, 58000".
- **Honours.** 2008 Hong Kong Grand Cuisine Gold Medal and 2009 MIGF five Awards of Excellence (attributed to Chef Thomas Chan's team in press). Malaysia Tatler Best Restaurants, dated 2014 from the certificate photo. HAPA Award 2023–24.
- **Reviews.** Google 4.3 from 684 reviews with a 397/180/62/23/22 split, and Tripadvisor 4.0 from 39, as listed in October 2026.
- **TA.KE.EN.** Opened January 2023. Private rooms seat 16 to 30 (from 2023 press coverage).
- **Mark.** The 千里 seal in the nav and loader is typeset from the logo's calligraphy. If the client has a vector (SVG) of the brush mark, swap it in.

## Accessibility and performance notes

- Honours `prefers-reduced-motion`: no smooth scroll, no pinning, a static background frame, and charts shown in their final state.
- Every chart has a keyboard-focusable equivalent and a text list beside it.
- The WebGL canvas renders at reduced resolution (about 0.5–0.6×) and pauses when the tab is hidden.
- If JavaScript or the CDN fails, the page is still a complete, readable site.
