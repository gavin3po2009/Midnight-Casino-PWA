# ARCADE — Game Launcher (PWA)

Fully offline Progressive Web App version of the pixel game launcher.

## Features

- Installable on Chromebook, phone, and desktop
- **Launcher shell is fully offline** after first visit (fonts, UI, icons cached)
- Game HTML files are cached on first open → playable offline after that
- GitHub repo scan works when online; cached library works offline
- No external font CDNs

## Deploy (GitHub + Vercel)

1. Create a GitHub repo
2. Put **all files from this folder at the repo root**:
   ```
   index.html
   manifest.json
   sw.js
   README.md
   fonts/
   icons/
   ```
3. Drop any `.html` games next to the launcher (or one folder deep)
4. Import the repo in [vercel.com](https://vercel.com) → Deploy
5. Optional: point your custom domain (e.g. omnilauncher.link)

## Local test

```bash
npx serve .
```

Open Chrome → Application → Manifest / Service Workers.  
Toggle Offline and confirm the launcher still loads.

## Offline behavior

| Component              | Offline? |
|------------------------|----------|
| Launcher UI + fonts    | Yes (after first visit) |
| Previously opened games| Yes (cached on first open) |
| GitHub “rescan”        | No (needs network) |
| Brand-new game files never opened | No until opened once online |

## Config

Edit `CONFIG` near the top of `index.html`:

- `title` — launcher name
- `repo` — `'owner/repo'` (needed on custom domains)
- `games` — manual list if you don’t want auto-scan
- `exclude` — filenames to hide

## Chromebook install

1. Open the site in Chrome
2. Menu → **Install ARCADE…** / install icon in the address bar
3. Launch from the Chrome OS launcher (not a regular tab)
