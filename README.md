# The Midnight Casino — PWA

A fully offline Progressive Web App version of *The Midnight Casino*.

## Features

- Installable on phone & desktop
- **Fully offline** after first visit (all fonts, CSS, JS, and assets are cached)
- Progress saved in the browser (`localStorage`)
- No external network requests once installed

## Deploy on Vercel + GitHub

1. Create a new GitHub repository
2. Upload **all files in this folder** to the **root** of the repo:
   ```
   index.html
   manifest.json
   sw.js
   README.md
   fonts/
   icons/
   ```
3. Go to [vercel.com](https://vercel.com) → **Add New Project**
4. Import the GitHub repo
5. Leave settings default (no build command needed)
6. Click **Deploy**

You’ll get a free HTTPS URL. Open it and install the app.

## Local testing

```bash
npx serve .
```

Then open `http://localhost:3000` in Chrome and check:
- DevTools → Application → Manifest
- DevTools → Application → Service Workers
- Toggle “Offline” and reload — everything still works

## Notes

- The service worker caches every asset on install.
- After the first load, you can turn off Wi-Fi and the casino still runs.
- Fictional stakes only — no real money.
