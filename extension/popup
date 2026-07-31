// popup.js — runs the "Scan this page" button.
//
// SAFEGUARDS (read this before changing anything):
// 1. Nothing runs until the person clicks the button. There is no
//    background listener, no content script injected on every page load.
// 2. Uses `activeTab`, not a broad host permission. Chrome only grants
//    access to the current tab, only for this user gesture, it expires
//    the moment the popup closes.
// 3. EXCLUDE_HOSTS below is a starting list of sensitive destinations
//    (banking, government login, major identity providers) that are
//    never scanned automatically, even on click. This list is illustrative,
//    not exhaustive — extend it before relying on it for anything beyond a
//    demo. When a page matches, the button explains why and stops.
// 4. Only URL, page title, and a short slice of visible text are read.
//    No form field values, no cookies, no storage, no page HTML beyond
//    plain innerText.

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
      scanNote.textContent = 'This looks like a banking, government, or account-login page. Cyber Sidekick does not automatically read pages like this. Paste specific text into the chat below instead if you want it checked.';
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
    scanNote.textContent = 'Sent the current page to Cyber Sidekick below.';
  } catch (err) {
    scanNote.textContent = "Couldn't read this page (some pages, like the Chrome Web Store or internal browser pages, can't be scanned). Paste text into the chat below instead.";
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = originalLabel;
  }
});
