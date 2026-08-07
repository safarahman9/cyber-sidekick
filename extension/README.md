# AI Cybersafety Superhero — Browser Extension (free, unpacked)

This is a minimal browser extension shell. It doesn't duplicate any of the
chat, diary, or scan logic — the popup just loads the live deployed PWA
(`https://unique-khapse-3e711e.netlify.app/`) in an iframe. One codebase,
two entry points: the website and the toolbar icon.

## Load it for free (no Chrome Web Store account or fee needed)

**Chrome / Edge / Brave:**
1. Go to `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `extension` folder
5. The AI Cybersafety Superhero icon appears in your toolbar — click it to open the popup

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` inside this folder

This is exactly how developers demo and test extensions before publishing,
completely free, no review wait. It resets when the browser restarts, so for
a live demo just re-load it right before presenting.

## What this version does and doesn't do

- **Does:** gives one-click access to the full checker from the browser
  toolbar, on any page. Has a **"Scan this page"** button (v1.1.0) that
  reads the current tab's URL, title, and visible text on demand. As of
  **v1.2.0**, it also has an **"Automatically check sites I visit"** toggle,
  **off by default**.
- **The two-tier safety design, on purpose:**
  - **Tier 1 — on-demand, content-reading** ("Scan this page" button, or
    pasting into chat): reads URL, title, and page text, only when
    explicitly triggered.
  - **Tier 2 — automatic, domain-only** (the toggle, when turned on): a
    background script (`background.js`) checks each new page's URL against
    Google Safe Browsing only. It never fetches or reads the page itself
    for this path. This distinction is deliberate: automatic, all-the-time
    checking should be the lightest-touch check available, full content
    reading stays reserved for moments the person explicitly asked for it.
  - **Nothing is stored anywhere.** No list of visited sites, no logs, no
    database. The only extension-side "state" is a small badge icon
    reflecting the most recent check, cleared on every new page load.
  - The exclude list (banking, government, major identity providers) is
    checked before both tiers, even with the toggle on, those sites are
    never automatically checked.
  - **Known trade-off:** enabling the toggle requires Chrome's broad
    `host_permissions` grant, which shows the standard "read and change all
    your data on the websites you visit" warning at install. That's a real,
    unavoidable cost of any automatic (not click-triggered) checking, which
    is exactly why it defaults to off and is a separate opt-in toggle
    rather than always-on behavior.
  - If the team wants automatic checking to also read page content (not
    just the domain), that's a meaningfully bigger privacy and trust
    decision, and worth deciding on as a team first, since it starts to
    overlap more with what Christina's and Nishaanth's tools already do.

## If you want it in the actual Chrome Web Store or Firefox Add-ons later

- **Chrome Web Store:** one-time $5 developer registration fee, then a
  review that typically takes a few days to about a week.
- **Firefox Add-ons (AMO):** free, similar review timeline.

Both are optional and separate from the free unpacked-loading method above,
only needed if the team wants this permanently installable by the public
outside a demo.
