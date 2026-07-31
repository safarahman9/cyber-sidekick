# Cyber Sidekick Browser Extension (free, unpacked)

This is a minimal browser extension shell. It doesn't duplicate any of the
chat, diary, or scan logic, the popup just loads the live deployed PWA
(`https://unique-khapse-3e711e.netlify.app/`) in an iframe. One codebase,
two entry points: the website and the toolbar icon.

## Load it for free (no Chrome Web Store account or fee needed)

**Chrome / Edge / Brave:**
1. Go to `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `extension` folder
5. The Cyber Sidekick icon appears in your toolbar, click it to open the popup

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` inside this folder

This is exactly how developers demo and test extensions before publishing,
completely free, no review wait. It resets when the browser restarts, so for
a live demo just re-load it right before presenting.

## What this version does and doesn't do

- **Does:** gives one-click access to the full checker from the browser
  toolbar, on any page. As of v1.1.0, it also has a **"Scan this page"**
  button that reads the current tab's URL, title, and visible text on
  demand and runs it through the same checker.
- **How the scan is kept safe, on purpose:**
  - Uses only the `activeTab` permission, Chrome grants this for the
    current tab only, only for the moment you click, it expires the
    instant the popup closes. There is no `content_scripts` and no
    `host_permissions`, so nothing runs automatically in the background
    and nothing persists between clicks.
  - A hardcoded exclude list (`popup.js` → `EXCLUDE_HOSTS`) blocks
    scanning on banking sites, government/tax sites, and major identity
    providers (Google, Microsoft, Apple, PayPal accounts) even when the
    button is clicked. This list is a starting point, not exhaustive,
    extend it before relying on it beyond a demo.
  - Only page URL, title, and up to ~2000 characters of visible text are
    read, no form values, no cookies, no storage, no page HTML beyond
    plain `innerText`.
  - **Known limitation:** this reads the page as it exists in the DOM at
    the moment you click, which covers JavaScript-rendered content (unlike
    the server-side link inspection in `chat.js`, which only sees static
    HTML). What it can't do is see content behind a login wall it doesn't
    have your credentials for, or anything that loads after you click
    away.
  - If the team later wants this to run automatically as you browse
    (rather than only on click), that requires `host_permissions` and a
    background/content script, a meaningfully bigger and more sensitive
    build, and worth deciding on as a team first since it starts to
    overlap with what Christina's and Nishaanth's tools already do.

## If you want it in the actual Chrome Web Store or Firefox Add-ons later

- **Chrome Web Store:** one-time $5 developer registration fee, then a
  review that typically takes a few days to about a week.
- **Firefox Add-ons (AMO):** free, similar review timeline.

Both are optional and separate from the free unpacked-loading method above,
only needed if the team wants this permanently installable by the public
outside a demo.
