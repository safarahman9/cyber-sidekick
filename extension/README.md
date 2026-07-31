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
  toolbar, on any page.
- **Doesn't:** read or scan the page you're currently on. There's no
  `content_scripts` or `host_permissions` in the manifest, so this extension
  has zero access to other tabs or browsing activity, on purpose. If the
  team later wants a "scan the page I'm on" extension feature (similar to
  Nishaanth's link scanner or Christina's page-flagging), that requires
  adding real permissions and a background/content script, which is a
  meaningfully bigger build and worth deciding on as a team first, since it
  starts to overlap with what their tools already do.

## If you want it in the actual Chrome Web Store or Firefox Add-ons later

- **Chrome Web Store:** one-time $5 developer registration fee, then a
  review that typically takes a few days to about a week.
- **Firefox Add-ons (AMO):** free, similar review timeline.

Both are optional and separate from the free unpacked-loading method above,
only needed if the team wants this permanently installable by the public
outside a demo.
