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
// 3. Nothing is stored. No list of visited sites is written to
//    chrome.storage, a database, or anywhere else. The only thing kept is
//    the current tab's badge (a small icon indicator), which is not a
//    persistent record, it just reflects the most recent check and is
//    cleared on the next navigation.
// 4. EXCLUDE_HOSTS mirrors the same list in popup.js, banking, government,
//    and major identity providers are never checked automatically, even
//    with the toggle on.

const STORAGE_KEY = 'autoCheckEnabled';
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

async function clearBadge(tabId) {
  try { await chrome.action.setBadgeText({ tabId, text: '' }); } catch (e) { /* tab may be closed */ }
}

async function setWarningBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#C5221F' });
  } catch (e) { /* tab may be closed */ }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  await clearBadge(tabId);

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
      await setWarningBadge(tabId);
    }
  } catch (e) {
    // Network hiccup or function unavailable, fail silently, never block
    // browsing or show an error for a background check the person can't
    // directly see happening.
  }
});
