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
      scanNote.textContent = 'This looks like a banking, government, or account-login page. Cybersafety Superhero does not automatically read pages like this. Paste specific text into the chat below instead if you want it checked.';
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
    scanNote.textContent = 'Sent the current page to Cybersafety Superhero below.';
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
    ? `<ul>${flags.map((f) => `<li>${escapeHTML(f.flag || f)}</li>`).join('')}</ul>`
    : '';

  privResult.innerHTML = `
    <span class="priv-risk ${risk}">${escapeHTML(data.risk_level || 'Medium')} permissiveness</span>
    <div class="priv-summary">${escapeHTML(data.summary || '')}</div>
    <div class="priv-section"><h3>Data collected</h3>${list(data.data_collected)}</div>
    <div class="priv-section"><h3>Shared with</h3>${list(data.shared_with)}</div>
    <div class="priv-section"><h3>Your rights</h3>${list(data.your_rights)}</div>
    ${flags.length ? `<div class="priv-section flags"><h3>Red flags</h3>${flagList}</div>` : ''}
    <a class="priv-link" href="${policyUrl}" target="_blank" rel="noopener noreferrer" id="privOpenPlain">View the full policy →</a>
    ${flags.length ? `<button class="privbtn" id="privHighlightBtn" style="margin-top:8px;">🔦 Open policy &amp; highlight flags</button>` : ''}
  `;
  privResult.classList.add('show');

  const highlightBtn = document.getElementById('privHighlightBtn');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
      const quotes = flags.map((f) => f.quote).filter(Boolean);
      // Sent to the background service worker, not handled here, so the
      // highlight still runs even if opening the new tab closes this popup.
      chrome.runtime.sendMessage({ type: 'HIGHLIGHT_POLICY', url: policyUrl, quotes });
    });
  }
}

// Shared by both the auto-detect button and the manual-paste fallback.
async function scanPolicyUrl(targetUrl, fallbackText) {
  privResult.classList.remove('show');
  privNote.textContent = '';
  try {
    const parsed = new URL(targetUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      privNote.textContent = 'Please enter a valid http(s) URL.';
      return;
    }
  } catch (e) {
    privNote.textContent = "That doesn't look like a valid URL.";
    return;
  }

  const res = await fetch(PRIVACY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: targetUrl, text: fallbackText || undefined })
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    privNote.textContent = data.error || 'Could not scan this page right now.';
    return;
  }

  privNote.textContent = '';
  renderPrivacyResult(data, targetUrl);
}

// If no link was found in the page's DOM, most sites still put their policy
// at one of a handful of standard paths. Try those against the same origin
// before giving up - this covers link text/markup patterns the DOM search
// didn't anticipate (JS-rendered footers, mega-menus, unusual wording).
// Runs from the extension's own context, which has broad host_permissions,
// so this cross-origin check isn't blocked by the page's own CORS policy.
const COMMON_POLICY_PATHS = [
  '/privacy', '/privacy-policy', '/privacypolicy', '/privacy-notice',
  '/legal/privacy', '/legal/privacy-policy', '/policies/privacy',
  '/about/privacy', '/en/privacy', '/privacy.html'
];

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

async function guessPolicyUrl(origin) {
  const attempts = COMMON_POLICY_PATHS.map(async (path) => {
    try {
      const res = await fetchWithTimeout(origin + path, 4000);
      return res && res.ok ? res.url : null;
    } catch (e) {
      return null;
    }
  });
  const results = await Promise.all(attempts);
  return results.find(Boolean) || null;
}

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

    let targetUrl = null;
    let fallbackText = null;

    if (result.linkUrl) {
      // Found an actual privacy-policy link on the page - scan THAT page.
      targetUrl = result.linkUrl;
    } else if (result.currentLooksLikePolicy) {
      // No link found, but they're already sitting on what looks like a policy page.
      targetUrl = result.currentUrl;
      fallbackText = result.fallbackText;
    } else {
      privBtn.textContent = 'Trying common paths…';
      targetUrl = await guessPolicyUrl(result.origin);
      if (!targetUrl) {
        privNote.textContent = "Couldn't find a privacy policy on this page or at any standard location. Try the box below to paste one directly.";
        return;
      }
    }

    privBtn.textContent = 'Scanning…';
    await scanPolicyUrl(targetUrl, fallbackText);
  } catch (err) {
    privNote.textContent = "Couldn't read this page (some pages, like the Chrome Web Store or internal browser pages, can't be scanned).";
  } finally {
    privBtn.disabled = false;
    privBtn.textContent = originalLabel;
  }
});

/* ---------- privacy policy scanner: manual URL fallback ---------- */
const privManualUrl = document.getElementById('privManualUrl');
const privManualBtn = document.getElementById('privManualBtn');

async function runManualScan() {
  const url = privManualUrl.value.trim();
  if (!url) { privNote.textContent = 'Paste a privacy policy URL first.'; return; }
  privManualBtn.disabled = true;
  const original = privManualBtn.textContent;
  privManualBtn.textContent = '…';
  try {
    await scanPolicyUrl(url, null);
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
