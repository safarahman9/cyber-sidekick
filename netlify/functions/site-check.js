// netlify/functions/site-check.js
//
// Deliberately minimal: this exists ONLY so the browser extension's optional
// "automatically check sites I visit" toggle has something safe to call.
//
// It does ONE thing: asks Google Safe Browsing whether a URL is on a known
// bad list. It does not fetch the page, does not read its content, does not
// log or store the URL anywhere (no database, nothing written to disk,
// nothing kept in memory after the response is sent). That's the point,
// automatic checking across every site someone visits should be the
// lightest-touch check available, not the full content-reading link
// inspection used for on-demand scans in chat.js.
//
// Same GOOGLE_SAFE_BROWSING_API_KEY environment variable as chat.js.

async function safeBrowsingCheck(url) {
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key || !url) return { checked: false, flagged: false, threats: [] };
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "cyber-sidekick-extension", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }]
        }
      })
    });
    const data = await res.json();
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const threats = [...new Set(matches.map((m) => m.threatType).filter(Boolean))];
    return { checked: true, flagged: matches.length > 0, threats };
  } catch (e) {
    return { checked: false, flagged: false, threats: [] };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const url = typeof body.url === "string" ? body.url.slice(0, 2000) : "";
    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "No url provided" }) };
    }
    const result = await safeBrowsingCheck(url);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
