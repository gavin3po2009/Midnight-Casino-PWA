# ARCADE — Game Launcher (PWA)

Fully offline Progressive Web App for **omnilauncher.link**.

## Features

- Installable on Chromebook, phone, and desktop
- Launcher shell fully offline after first visit
- Drop `.html` games next to the launcher → they appear after rescan
- Games cached on first open → playable offline after that

## Custom domain setup (omnilauncher.link)

1. Push this folder to the **root** of your GitHub repo
2. In `index.html`, find `CONFIG` and set:
   ```js
   repo: 'YOUR_GITHUB_USERNAME/YOUR_REPO_NAME',
   ```
   Example: `repo: 'alice/omnilauncher',`
3. Connect the repo to Vercel and point **omnilauncher.link** at it
4. Open the site → press **⟳** to scan for games

Without `CONFIG.repo` set, auto-scan won’t work on a custom domain (GitHub can’t be guessed from the domain alone).

## Adding games

1. Commit any `.html` files next to `index.html` (or one folder deep)
2. Push
3. Open the launcher → **⟳ RESCAN**
4. New cards appear; open once online to cache for offline play

## Deploy checklist

```
index.html
manifest.json
sw.js
README.md
fonts/
icons/
YourGame.html   ← drop games here
```

## Offline behavior

| Part | Offline? |
|------|----------|
| Launcher UI + fonts | Yes (after first visit) |
| Games opened once | Yes |
| GitHub rescan | Needs network |
| Brand-new unopened games | Need one online open first |

## Chromebook install

1. Open https://omnilauncher.link
2. Chrome menu → **Install ARCADE…**
3. Launch from the Chrome OS app launcher (not a browser tab)
