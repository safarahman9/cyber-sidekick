// popup.js — runs the "Scan this page" button and the auto-check toggle.
//
// SAFEGUARDS (read this before changing anything):
// 1. "Scan this page" only runs on click, using `activeTab`, access to the
//    current tab only, only for this user gesture, gone the moment the
//    popup closes.
// 2. The "Automatically check sites I visit" toggle below is OFF by
//    default. Turning it on only enables background.js's domain-reputation
//    check (Safe Browsing), it does NOT enable page-content reading, that
//    stays reserved for explicit actions (this button, or pasting into
//    chat).
// 3. EXCLUDE_HOSTS below is a starting list of sensitive destinations
//    (banking, government login, major identity providers) that are
//    never scanned automatically, even on click. This list is illustrative,
//    not exhaustive — extend it before relying on it for anything beyond a
//    demo. When a page matches, the button explains why and stops.
// 4. Only URL, page title, and a short slice of visible text are read on
//    click. No form field values, no cookies, no storage, no page HTML
//    beyond plain innerText.

const EXCLUDE_HOSTS = [
  // Canadian banks
  'rbc.com', 'royalbank.com', 'scotiabank.com', 'td.com', 'bmo.com', 'cibc.com',
  'tangerine.ca', 'desjardins.com', 'nbc.ca',
  // Government / tax / identity
  'canada.ca', 'cra-arc.gc.ca', 'gc.ca', 'irs.gov',
  // Common identity / payment providers
  'accounts.google.com', 'login.microsoftonline.com', 'login.live.com',
  'appleid.apple.com', 'paypal.com', 'login.yahoo.com'
];

function isExcluded(hostname) {
  return EXCLUDE_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
}

const scanBtn = document.getElementById('scanBtn');
const scanNote = document.getElementById('scanNote');
const app = document.getElementById('app');

scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  const originalLabel = scanBtn.textContent;
  scanBtn.textContent = 'Scanning…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) throw new Error('no active tab');

    let hostname;
    try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); }
    catch (e) { throw new Error('unreadable tab url'); }

    if (!/^https?:$/.test(new URL(tab.url).protocol)) {
      scanNote.textContent = "This isn't a regular web page, so there's nothing to scan here.";
      return;
    }

    if (isExcluded(hostname)) {
      scanNote.textContent = 'This looks like a banking, government, or account-login page. AI Cybersafety Superhero does not automatically read pages like this. Paste specific text into the chat below instead if you want it checked.';
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = window.getSelection ? window.getSelection().toString() : '';
        const text = selection || (document.body ? document.body.innerText.slice(0, 2000) : '');
        return { url: location.href, title: document.title, text, mode: selection ? 'selection' : 'page' };
      }
    });

    const params = new URLSearchParams({
      scanurl: result.url || tab.url,
      scantitle: result.title || '',
      scantext: result.text || '',
      scanmode: result.mode || 'page'
    });
    // Reuses the same ?scanurl=&scantitle=&scantext= handler the bookmarklet
    // and share-target already use on the live site, no new endpoint needed.
    app.src = 'https://unique-khapse-3e711e.netlify.app/?' + params.toString();
    scanNote.textContent = 'Sent the current page to AI Cybersafety Superhero below.';
  } catch (err) {
    scanNote.textContent = "Couldn't read this page (some pages, like the Chrome Web Store or internal browser pages, can't be scanned). Paste text into the chat below instead.";
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = originalLabel;
  }
});

/* ---------- automatic-check toggle (off by default) ---------- */
// Reads/writes the same chrome.storage.local key background.js checks
// before doing anything. Flipping this only ever changes whether the
// domain-reputation check runs, it never enables page-content reading.
const STORAGE_KEY = 'autoCheckEnabled';
const autoToggle = document.getElementById('autoToggle');

chrome.storage.local.get(STORAGE_KEY).then((stored) => {
  autoToggle.checked = !!stored[STORAGE_KEY];
});

autoToggle.addEventListener('change', () => {
  chrome.storage.local.set({ [STORAGE_KEY]: autoToggle.checked });
});

/* ---------- report to CAFC ---------- */
document.getElementById('reportBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://antifraudcentre-centreantifraude.ca/report-signalez-eng.htm' });
});

/* ---------- privacy policy scanner ---------- */
// Two-step: first find the actual privacy-policy link on whatever page the
// person is on (a homepage, a checkout page, wherever), using activeTab +
// scripting only on click. Then hand that URL to privacy-scan.js, which
// fetches and reads THAT page server-side, not the page the person started
// on. Falls back to scanning the current page directly only if it already
// looks like a policy page itself, or if no link could be found at all.
const PRIVACY_ENDPOINT = 'https://unique-khapse-3e711e.netlify.app/.netlify/functions/privacy-scan';

const privBtn = document.getElementById('privBtn');
const privNote = document.getElementById('privNote');
const privResult = document.getElementById('privResult');

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

// Runs inside the page (via executeScript). Looks for the most likely
// privacy-policy link on the page, and separately reports whether the
// CURRENT page itself already looks like a policy/terms page.
//
// Broadened after real-world testing turned up misses: many sites put the
// link in a <footer> with generic-looking text ("Privacy"), or the link
// text doesn't say "privacy" at all but the URL path does (icon links,
// "Legal" dropdowns). This checks, in order: footer links first (where
// policy links usually live), then any link anywhere, matching on EITHER
// visible text OR the URL path, plus aria-label as a third signal.
function findPolicyLinkInPage() {
  const TEXT_PATTERN = /privacy( policy| notice)?|data protection|your data|gdpr|ccpa/i;
  const PATH_PATTERN = /\/(privacy|privacy-policy|privacy-notice|data-protection|legal\/privacy)(\/|$|[?#])/i;
  const EXCLUDE = /privacy settings|cookie settings|privacy preferences|manage cookies/i;

  function scoreAnchor(a) {
    const label = (a.textContent || '').trim();
    const aria = (a.getAttribute('aria-label') || '').trim();
    const href = a.href || '';
    if (!href || !/^https?:/.test(href)) return null;
    if (EXCLUDE.test(label) || EXCLUDE.test(aria)) return null;
    let path = '';
    try { path = new URL(href).pathname; } catch (e) { /* ignore */ }
    const textMatch = TEXT_PATTERN.test(label) || TEXT_PATTERN.test(aria);
    const pathMatch = PATH_PATTERN.test(path);
    if (!textMatch && !pathMatch) return null;
    // Text match on a short, clean label ("Privacy", "Privacy Policy") is the
    // strongest signal; a matching URL path alone is good too but slightly
    // weaker (could be a blog post about privacy, etc).
    const score = (textMatch ? 2 : 0) + (pathMatch ? 1 : 0);
    return { href, label, score };
  }

  function bestFrom(anchors) {
    let best = null;
    for (const a of anchors) {
      const scored = scoreAnchor(a);
      if (scored && (!best || scored.score > best.score)) best = scored;
    }
    return best;
  }

  const footer = document.querySelector('footer');
  const footerAnchors = footer ? Array.from(footer.querySelectorAll('a[href]')) : [];
  const allAnchors = Array.from(document.querySelectorAll('a[href]'));

  // Prefer a footer match over a same-scoring match elsewhere, footers are
  // where these links live on the overwhelming majority of sites.
  const best = bestFrom(footerAnchors) || bestFrom(allAnchors);

  const currentLooksLikePolicy = PATH_PATTERN.test(location.pathname) || /privacy policy|privacy notice|terms of service/i.test(document.title);
  const fallbackText = document.body ? document.body.innerText.slice(0, 15000) : '';
  return {
    linkUrl: best ? best.href : null,
    origin: location.origin,
    currentLooksLikePolicy,
    currentUrl: location.href,
    fallbackText
  };
}

function list(items) {
  return (items && items.length)
    ? `<ul>${items.map((i) => `<li>${escapeHTML(i)}</li>`).join('')}</ul>`
    : `<ul><li>Not clearly addressed in this text</li></ul>`;
}

function renderPrivacyResult(data, policyUrl) {
  const risk = (data.risk_level || 'Medium').toLowerCase();
  const flags = Array.isArray(data.red_flags) ? data.red_flags : [];
  const flagList = flags.length
    ? `<ul>${flags.map((f) => {
        const sev = (f.severity || 'Medium').toLowerCase() === 'high' ? 'high' : 'medium';
        return `<li class="flag-${sev}">${escapeHTML(f.flag || f)}</li>`;
      }).join('')}</ul>`
    : '';

  // Every href here was verified server-side to be a real link pulled
  // straight from the scanned page - never a guessed or generic URL. See
  // findPolicyUrlViaSearch / next_steps validation in privacy-scan.js.
  const steps = Array.isArray(data.next_steps) ? data.next_steps.filter((s) => s && s.href) : [];
  const stepsHtml = steps.length
    ? `<div class="priv-section next-steps"><h3>Take action</h3>${steps.map((s, i) => {
        const icon = s.type === 'mailto' ? '✉️' : '↗';
        return `<a class="priv-action" href="${escapeHTML(s.href)}" target="_blank" rel="noopener noreferrer">${icon} ${escapeHTML(s.label || 'Open link')}</a>`;
      }).join('')}</div>`
    : '';

  privResult.innerHTML = `
    <span class="priv-risk ${risk}">${escapeHTML(data.risk_level || 'Medium')} permissiveness</span>
    <div class="priv-summary">${escapeHTML(data.summary || '')}</div>
    <div class="priv-section"><h3>Data collected</h3>${list(data.data_collected)}</div>
    <div class="priv-section"><h3>Shared with</h3>${list(data.shared_with)}</div>
    <div class="priv-section"><h3>Your rights</h3>${list(data.your_rights)}</div>
    ${flags.length ? `<div class="priv-section flags"><h3>Red flags</h3>${flagList}</div>` : ''}
    ${stepsHtml}
    <a class="priv-link" href="${policyUrl}" target="_blank" rel="noopener noreferrer" id="privOpenPlain">View the full policy →</a>
    ${flags.length ? `<button class="privbtn" id="privHighlightBtn" style="margin-top:8px;">🔦 Open policy &amp; highlight flags</button>` : ''}
  `;
  privResult.classList.add('show');

  const highlightBtn = document.getElementById('privHighlightBtn');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
      const quotes = flags
        .filter((f) => f.quote)
        .map((f) => ({ quote: f.quote, severity: (f.severity || 'Medium').toLowerCase() === 'high' ? 'high' : 'medium' }));
      // Sent to the background service worker, not handled here, so the
      // highlight still runs even if opening the new tab closes this popup.
      chrome.runtime.sendMessage({ type: 'HIGHLIGHT_POLICY', url: policyUrl, quotes });
    });
  }

  // Remember this scan so reopening the popup shows it again instead of a
  // blank state, even after "View the full policy" navigates away.
  chrome.storage.local.set({ lastPrivacyScan: { data, policyUrl, t: Date.now() } }).catch(() => {});
}

// Chrome throws away the popup's DOM every time it closes - clicking "View
// the full policy" or "Open policy & highlight flags" opens a new tab,
// which closes this popup, so without this the scan would be gone the next
// time it's opened. Restores the last result on load and shows when it was
// from, until the person runs a new scan (which overwrites it above).
async function restoreLastPrivacyScan() {
  try {
    const stored = await chrome.storage.local.get('lastPrivacyScan');
    const entry = stored.lastPrivacyScan;
    if (!entry || !entry.data) return;

    renderPrivacyResult(entry.data, entry.policyUrl);

    const when = entry.t ? new Date(entry.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const note = document.createElement('div');
    note.className = 'priv-restored-note';
    note.innerHTML = `<span>Showing your last scan${when ? ' from ' + escapeHTML(when) : ''}.</span><button id="privDismissRestored">Clear</button>`;
    privResult.prepend(note);

    document.getElementById('privDismissRestored').addEventListener('click', () => {
      privResult.classList.remove('show');
      privResult.innerHTML = '';
      chrome.storage.local.remove('lastPrivacyScan').catch(() => {});
    });
  } catch (e) { /* no stored scan, or storage unavailable - just show the empty state */ }
}
restoreLastPrivacyScan();

// Shared by both the auto-detect button and the manual-paste fallback.
async function scanPolicy({ url, company, text }) {
  privResult.classList.remove('show');
  privNote.textContent = '';

  if (url) {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        privNote.textContent = 'Please enter a valid http(s) URL.';
        return;
      }
    } catch (e) {
      privNote.textContent = "That doesn't look like a valid URL.";
      return;
    }
  }

  const res = await fetch(PRIVACY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: url || undefined, company: company || undefined, text: text || undefined })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    privNote.textContent = data.error || 'Could not scan this page right now.';
    return;
  }

  privNote.textContent = '';
  renderPrivacyResult(data, data.url || url);
}

// Same trust model as "Scan this page": activeTab + scripting, only on
// click. If findPolicyLinkInPage can't find a link in the live DOM, the
// company/origin is sent to the server, which searches for the real URL
// (see privacy-scan.js / findPolicyUrlViaSearch) rather than guessing.

privBtn.addEventListener('click', async () => {
  privBtn.disabled = true;
  const originalLabel = privBtn.textContent;
  privBtn.textContent = 'Finding policy…';
  privResult.classList.remove('show');
  privNote.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) throw new Error('no active tab');
    if (!/^https?:$/.test(new URL(tab.url).protocol)) {
      privNote.textContent = "This isn't a regular web page, so there's nothing to scan here.";
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findPolicyLinkInPage
    });

    if (result.linkUrl) {
      // Found an actual privacy-policy link on the page - scan THAT page.
      privBtn.textContent = 'Scanning…';
      await scanPolicy({ url: result.linkUrl });
    } else if (result.currentLooksLikePolicy) {
      // No link found, but they're already sitting on what looks like a policy page.
      privBtn.textContent = 'Scanning…';
      await scanPolicy({ url: result.currentUrl, text: result.fallbackText });
    } else {
      // No link visible in the page's DOM (common on app pages with no
      // marketing footer, or JS-rendered footers). Let the server search
      // for the company's real policy page rather than guessing at paths.
      privBtn.textContent = 'Searching for policy…';
      await scanPolicy({ company: result.origin });
    }
  } catch (err) {
    privNote.textContent = "Couldn't read this page (some pages, like the Chrome Web Store or internal browser pages, can't be scanned).";
  } finally {
    privBtn.disabled = false;
    privBtn.textContent = originalLabel;
  }
});

/* ---------- privacy policy scanner: lookup by company name or domain ---------- */
// This doesn't touch the current tab at all - it fetches the COMPANY'S
// homepage itself (extension host_permissions allow this cross-origin),
// parses it for a privacy-policy link the same way findPolicyLinkInPage
// does on a live page, and falls back to common paths if that comes up
// empty. Works from any tab, or even with no relevant tab open at all.
const privManualUrl = document.getElementById('privManualUrl');
const privManualBtn = document.getElementById('privManualBtn');

function resolveOrigin(input) {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    // Bare domain ("netflix.com") or plain company name ("Netflix").
    if (/\s/.test(v) || !v.includes('.')) {
      // Plain name with no dot: best-effort guess at a .com domain.
      v = v.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
    }
    v = 'https://' + v;
  }
  try { return new URL(v).origin; } catch (e) { return null; }
}

// Same scoring approach as findPolicyLinkInPage, but run against HTML text
// fetched directly rather than a live page's DOM, using DOMParser (which
// popup.js has full access to, being a regular extension page).
function extractPolicyLinkFromHtml(html, origin) {
  const TEXT_PATTERN = /privacy( policy| notice)?|data protection|your data|gdpr|ccpa/i;
  const PATH_PATTERN = /\/(privacy|privacy-policy|privacy-notice|data-protection|legal\/privacy)(\/|$|[?#])/i;
  const EXCLUDE = /privacy settings|cookie settings|privacy preferences|manage cookies/i;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  function resolve(href) {
    try { return new URL(href, origin).href; } catch (e) { return null; }
  }
  function scoreAnchor(a) {
    const label = (a.textContent || '').trim();
    const aria = (a.getAttribute('aria-label') || '').trim();
    const rawHref = a.getAttribute('href') || '';
    const href = resolve(rawHref);
    if (!href || !/^https?:/.test(href)) return null;
    if (EXCLUDE.test(label) || EXCLUDE.test(aria)) return null;
    let path = '';
    try { path = new URL(href).pathname; } catch (e) { /* ignore */ }
    const textMatch = TEXT_PATTERN.test(label) || TEXT_PATTERN.test(aria);
    const pathMatch = PATH_PATTERN.test(path);
    if (!textMatch && !pathMatch) return null;
    return { href, score: (textMatch ? 2 : 0) + (pathMatch ? 1 : 0) };
  }
  function bestFrom(anchors) {
    let best = null;
    for (const a of anchors) {
      const scored = scoreAnchor(a);
      if (scored && (!best || scored.score > best.score)) best = scored;
    }
    return best;
  }
  const footer = doc.querySelector('footer');
  const footerAnchors = footer ? Array.from(footer.querySelectorAll('a[href]')) : [];
  const allAnchors = Array.from(doc.querySelectorAll('a[href]'));
  const best = bestFrom(footerAnchors) || bestFrom(allAnchors);
  return best ? best.href : null;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

async function findPolicyForOrigin(origin) {
  // Quick free check: fetch the homepage itself and look for a policy link
  // in its raw HTML. Cheap and instant when it works (most non-SPA sites).
  // Misses client-side-rendered footers (e.g. Canva) - that's fine, the
  // caller falls through to the server's web-search-based lookup instead
  // of guessing at paths.
  try {
    const res = await fetchWithTimeout(origin, 6000);
    if (res && res.ok) {
      const html = await res.text();
      const found = extractPolicyLinkFromHtml(html, origin);
      if (found) return found;
    }
  } catch (e) { /* homepage unreachable, let the caller fall back to search */ }
  return null;
}

async function runManualScan() {
  const input = privManualUrl.value.trim();
  if (!input) { privNote.textContent = 'Enter a company name, domain, or policy URL first.'; return; }

  privManualBtn.disabled = true;
  const original = privManualBtn.textContent;
  privNote.textContent = '';
  privResult.classList.remove('show');

  try {
    // If it's already a full URL to a specific page (has a path beyond
    // "/"), trust it and scan directly - this is still the fastest path
    // when someone already has the exact policy link handy.
    if (/^https?:\/\//i.test(input)) {
      let hasPath = false;
      try { hasPath = new URL(input).pathname.replace(/\/$/, '').length > 0; } catch (e) { /* ignore */ }
      if (hasPath) {
        privManualBtn.textContent = '…';
        await scanPolicy({ url: input });
        return;
      }
    }

    // Otherwise treat the input as a company/domain. Try the quick
    // homepage scrape first (free, instant), then let the server search
    // for the real URL if that comes up empty.
    const origin = resolveOrigin(input);
    if (!origin) { privNote.textContent = "That doesn't look like a company name, domain, or URL."; return; }

    privManualBtn.textContent = 'Finding policy…';
    const found = await findPolicyForOrigin(origin);
    if (found) {
      privManualBtn.textContent = 'Scanning…';
      await scanPolicy({ url: found });
      return;
    }

    privManualBtn.textContent = 'Searching…';
    await scanPolicy({ company: origin });
  } finally {
    privManualBtn.disabled = false;
    privManualBtn.textContent = original;
  }
}
privManualBtn.addEventListener('click', runManualScan);
privManualUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') runManualScan(); });

/* ---------- flagged-result banner ---------- */
// On open, check whether background.js already flagged the current tab
// (stored only in chrome.storage.session, memory-only, cleared when the
// browser closes or the tab closes) and show why, if so.
const RESULT_PREFIX = 'tabResult_';
const THREAT_LABELS = {
  MALWARE: 'known malware',
  SOCIAL_ENGINEERING: 'phishing / social engineering',
  UNWANTED_SOFTWARE: 'unwanted software',
  POTENTIALLY_HARMFUL_APPLICATION: 'potentially harmful app'
};

(async function checkFlaggedBanner(){
  const flagBanner = document.getElementById('flagBanner');
  const flagBody = document.getElementById('flagBody');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    const key = RESULT_PREFIX + tab.id;
    const stored = await chrome.storage.session.get(key);
    const result = stored[key];
    if (!result) return;
    const labels = (result.threats || []).map((t) => THREAT_LABELS[t] || t.toLowerCase()).join(', ') || 'a known-scam list';
    flagBody.textContent = 'Google Safe Browsing flagged this domain for: ' + labels + '. Consider leaving this site.';
    flagBanner.classList.add('show');
  } catch (e) { /* no active tab or storage unavailable, just skip the banner */ }
})();
