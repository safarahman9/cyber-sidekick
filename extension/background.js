// background.js
//
// SAFEGUARDS (read before changing anything):
// 1. OFF by default. Nothing in this file runs against real pages unless
//    the person has explicitly turned on "Automatically check sites I
//    visit" in the popup. Check STORAGE_KEY below.
// 2. Only ever calls the domain-reputation endpoint (site-check.js), which
//    only ever sees a URL string. It never fetches or reads page content
//    for this automatic path, that's reserved for the on-demand "Scan this
//    page" button and the chat's own link inspection.
// 3. The badge and the small per-tab result used to explain it in the
//    popup live only in chrome.storage.session, which Chrome keeps in
//    memory only, never written to disk, and is wiped automatically when
//    the browser closes. There is still no persistent record of browsing
//    history anywhere, this is just enough to answer "why did you flag
//    this?" for the tab that's open right now.
// 4. EXCLUDE_HOSTS mirrors the same list in popup.js, banking, government,
//    and major identity providers are never checked automatically, even
//    with the toggle on.

const STORAGE_KEY = 'autoCheckEnabled';
const RESULT_PREFIX = 'tabResult_';
const CHECK_ENDPOINT = 'https://unique-khapse-3e711e.netlify.app/.netlify/functions/site-check';

const EXCLUDE_HOSTS = [
  'rbc.com', 'royalbank.com', 'scotiabank.com', 'td.com', 'bmo.com', 'cibc.com',
  'tangerine.ca', 'desjardins.com', 'nbc.ca',
  'canada.ca', 'cra-arc.gc.ca', 'gc.ca', 'irs.gov',
  'accounts.google.com', 'login.microsoftonline.com', 'login.live.com',
  'appleid.apple.com', 'paypal.com', 'login.yahoo.com'
];

function isExcluded(hostname) {
  return EXCLUDE_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
}

async function isEnabled() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return !!stored[STORAGE_KEY];
}

async function clearResult(tabId) {
  try { await chrome.action.setBadgeText({ tabId, text: '' }); } catch (e) { /* tab may be closed */ }
  try { await chrome.storage.session.remove(RESULT_PREFIX + tabId); } catch (e) { /* ignore */ }
}

async function setFlaggedResult(tabId, url, threats) {
  try {
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#C5221F' });
    await chrome.action.setTitle({ tabId, title: 'Cybersafety Superhero: this site is flagged, click for details' });
  } catch (e) { /* tab may be closed */ }
  try {
    await chrome.storage.session.set({ [RESULT_PREFIX + tabId]: { url, threats: threats || [], t: Date.now() } });
  } catch (e) { /* ignore */ }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  await clearResult(tabId);

  if (!(await isEnabled())) return;

  let hostname;
  try {
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return;
    hostname = u.hostname.replace(/^www\./, '');
  } catch (e) {
    return;
  }

  if (isExcluded(hostname)) return;

  try {
    const res = await fetch(CHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: tab.url })
    });
    const data = await res.json();
    if (data && data.flagged) {
      await setFlaggedResult(tabId, tab.url, data.threats);
    }
  } catch (e) {
    // Network hiccup or function unavailable, fail silently, never block
    // browsing or show an error for a background check the person can't
    // directly see happening.
  }
});

// Also clear the stored result once a tab closes, so nothing lingers even
// in session storage past the tab's own lifetime.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(RESULT_PREFIX + tabId).catch(() => {});
});

// ---------- privacy policy: open + highlight flagged quotes ----------
// Handled here rather than in popup.js because opening a new tab often
// steals focus and closes the extension popup before it could finish
// waiting for the page to load. The background service worker has no such
// lifecycle problem, it keeps running independent of the popup.
//
// Only ever touches the ONE tab it just opened for this purpose, using the
// short verbatim quotes privacy-scan.js already returned. No new page
// content is read or sent anywhere, this only searches text already
// visible in the tab it opens.
function highlightQuotesInPage(items) {
  if (!Array.isArray(items) || !items.length) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  const COLORS = {
    high: { bg: '#FBC7C4', fg: '#7A2A28' },
    medium: { bg: '#FDE7B8', fg: '#5C3D00' }
  };

  let firstMark = null;
  for (const item of items) {
    // Backward-compatible: accept either a plain string or {quote, severity}.
    const quote = typeof item === 'string' ? item : item.quote;
    const severity = (typeof item === 'object' && item.severity === 'high') ? 'high' : 'medium';
    if (!quote) continue;
    const needle = quote.trim();
    if (needle.length < 4) continue;
    for (const node of nodes) {
      if (!node.parentNode) continue;
      const idx = node.textContent.toLowerCase().indexOf(needle.toLowerCase());
      if (idx === -1) continue;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);
      const mark = document.createElement('mark');
      const colors = COLORS[severity];
      mark.style.background = colors.bg;
      mark.style.color = colors.fg;
      mark.title = severity === 'high' ? 'High concern - flagged by Cybersafety Superhero' : 'Worth reviewing - flagged by Cybersafety Superhero';
      try {
        range.surroundContents(mark);
        if (!firstMark) firstMark = mark;
      } catch (e) { /* range spans multiple elements, skip this one */ }
      break; // only the first match per quote, to avoid over-marking repeated boilerplate
    }
  }
  if (firstMark) firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'HIGHLIGHT_POLICY' || !message.url) return;

  chrome.tabs.create({ url: message.url }, (newTab) => {
    if (!newTab || !newTab.id) return;
    const targetTabId = newTab.id;

    function onUpdated(tabId, changeInfo) {
      if (tabId !== targetTabId || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (message.quotes && message.quotes.length) {
        chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: highlightQuotesInPage,
          args: [message.quotes]
        }).catch(() => { /* page may block scripting (e.g. Chrome Web Store), fail silently */ });
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
});
