# Building the AI Cybersafety Superhero desktop installer

This folder is an Electron wrapper around the live PWA. It needs to be built
on the target OS (or via CI) — an installer can't be produced inside a
sandboxed Linux container with no display, which is why this is source, not
a finished `.exe`/`.dmg`.

## One-time setup

```
cd desktop-app
npm install
```

## Run it locally (no installer, just a window, for testing)

```
npm start
```

## Build a real installer

```
npm run dist
```

This uses `electron-builder`, which reads the `build` section of
`package.json` and produces:

- **Windows** → `dist/AI Cybersafety Superhero Setup <version>.exe` (NSIS
  installer). Must be run on Windows, or via a Windows CI runner —
  electron-builder can sometimes cross-build Windows targets from Mac/Linux,
  but it's unreliable without Wine installed and isn't worth fighting for a
  capstone deadline.
- **Mac** → `dist/AI Cybersafety Superhero-<version>.dmg`. Must be built on
  macOS. Unsigned builds will show a Gatekeeper warning on first launch
  (right-click → Open bypasses it) unless you have an Apple Developer
  certificate to sign with — not required for the demo, but worth flagging
  in the user manual.
- **Linux** → `dist/AI Cybersafety Superhero-<version>.AppImage`. Can be built
  from Linux (including this kind of sandboxed environment, if you want to
  hand that specific job to Claude Code running locally with a real
  filesystem instead of this chat).

## What it does

`main.js` opens a native window pointed at your live deployment
(`unique-khapse-3e711e.netlify.app`). It is not a separate offline app —
the chat, diary, and privacy scanner still call your Netlify functions over
the internet exactly like the website and extension do. This keeps one
source of truth: fix a bug in the web app, and the desktop app is
automatically fixed too, no separate release needed.

If a fully offline app is ever wanted instead (chat UI works without
internet, though scam-checking itself still needs the API), that's a
different, bigger project — copying `index.html` and assets into a local
`app/` folder and loading `file://` instead of the live URL — worth doing
only if that's an actual requirement from the client, not by default.

## Icon

Currently reuses `icon.png` (512×512) for all platforms. Windows and Mac
prefer multi-resolution `.ico`/`.icns` files for the sharpest result at
small sizes (taskbar, dock) — electron-builder can auto-generate these from
a single high-res PNG, so this is optional polish, not a blocker.
