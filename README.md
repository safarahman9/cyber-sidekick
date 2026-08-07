# D5 — Unified Prototype

## Live app

**https://aicybersafetysuperhero.netlify.app/**

This is the current, live deployment. Unlike D2 (an archived early
snapshot), this link is meant to always reflect the actual current state of
the project through D5 and beyond.

Before submitting: open this exact link in a private/incognito window
and confirm it loads. A rename or redeploy since this README was written
could have changed it.

## Backup: source code

If the live site is unreachable for any reason during grading, the full
source is here:

**https://github.com/safarahman9/cyber-sidekick**

## What "unified" means here

D5 consolidates the four individual D2 prototypes into one product, built
on Safa's PWA as the base UI, rather than keeping four separate tools
running side by side:

- **Safa's PWA is the foundation** — the scam checker, chat interface, and
  overall app structure that everything else was built into
- **Christina's browser extension concept** — became the actual extension,
  which wraps the PWA itself (one-click page scanning, flagged-site
  warnings) rather than a separate standalone tool
- **Nishaanth's local AI safeguard** — its role shifted from running its
  own separate local model to calling the same shared backend the PWA
  uses, so detection logic lives in one place instead of two
- **Rishad's logging & structured Q&A approach** — its schema became the
  standard format the Risk Diary uses to record and structure every check,
  rather than a separate logging system
- **Shared backend** — one set of Netlify functions (scam checking, site
  reputation, privacy policy scanning) that the PWA, extension, and desktop
  app all call, so a fix made once reaches every surface at the same time

## What's included in D5

- The AI Cybersafety Superhero PWA: scam checker, privacy policy scanner,
  risk diary, accessibility tools
- Browser extension: page scanning, privacy policy scanner, flagged-site
  warnings
- Desktop app: native wrapper for Windows/Mac/Linux
- Shared Netlify backend: `chat.js`, `site-check.js`, `privacy-scan.js`

## Team

Team T3 — Ontario Tech University, XBIT 4500 Capstone Study Project
Client: Claudiu Popa, Informatica Security Corporation / KnowledgeFlow
Cybersafety Foundation
