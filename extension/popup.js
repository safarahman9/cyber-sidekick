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
//    not exhaustive, extend it before relying on it for anything beyond a
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
// Same shape of trust as "Scan this page": activeTab + scripting, only on
// click, only the current tab's visible text, nothing read automatically.
// Sends that text to privacy-scan.js (same backend/API key as chat.js).
const PRIVACY_ENDPOINT = 'https://unique-khapse-3e711e.netlify.app/.netlify/functions/privacy-scan';

const privBtn = document.getElementById('privBtn');
const privNote = document.getElementById('privNote');
const privResult = document.getElementById('privResult');

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function renderPrivacyResult(data, pageUrl) {
  const risk = (data.risk_level || 'Medium').toLowerCase();
  const list = (items) => (items && items.length)
    ? `<ul>${items.map((i) => `<li>${escapeHTML(i)}</li>`).join('')}</ul>`
    : `<ul><li>Not clearly addressed in this text</li></ul>`;

  privResult.innerHTML = `
    <span class="priv-risk ${risk}">${escapeHTML(data.risk_level || 'Medium')} permissiveness</span>
    <div class="priv-summary">${escapeHTML(data.summary || '')}</div>
    <div class="priv-section"><h3>Data collected</h3>${list(data.data_collected)}</div>
    <div class="priv-section"><h3>Shared with</h3>${list(data.shared_with)}</div>
    <div class="priv-section"><h3>Your rights</h3>${list(data.your_rights)}</div>
    ${data.red_flags && data.red_flags.length ? `<div class="priv-section flags"><h3>Red flags</h3>${list(data.red_flags)}</div>` : ''}
    <a class="priv-link" href="${pageUrl}" target="_blank" rel="noopener noreferrer">View the full policy →</a>
  `;
  privResult.classList.add('show');
}

privBtn.addEventListener('click', async () => {
  privBtn.disabled = true;
  const originalLabel = privBtn.textContent;
  privBtn.textContent = 'Scanning…';
  privResult.classList.remove('show');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) throw new Error('no active tab');
    if (!/^https?:$/.test(new URL(tab.url).protocol)) {
      privNote.textContent = "This isn't a regular web page, so there's nothing to scan here.";
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ text: document.body ? document.body.innerText.slice(0, 15000) : '', title: document.title })
    });

    if (!result || !result.text || result.text.trim().length < 200) {
      privNote.textContent = "Couldn't find enough text on this page to summarize. Open the company's privacy policy or terms page directly, then try again.";
      return;
    }

    const res = await fetch(PRIVACY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: result.text, url: tab.url })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      privNote.textContent = data.error || 'Could not scan this page right now.';
      return;
    }

    privNote.textContent = '';
    renderPrivacyResult(data, tab.url);
  } catch (err) {
    privNote.textContent = "Couldn't read this page (some pages, like the Chrome Web Store or internal browser pages, can't be scanned).";
  } finally {
    privBtn.disabled = false;
    privBtn.textContent = originalLabel;
  }
});

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
