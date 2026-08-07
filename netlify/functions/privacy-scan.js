// netlify/functions/privacy-scan.js
//
// Given a policy page URL, fetches that page directly (server-side, so the
// extension doesn't need to have navigated there first), strips it down to
// plain text, and asks Claude to summarize it into a fixed structure: what
// data is collected, who it's shared with, what rights the person has, and
// any red flags, each red flag paired with a short verbatim quote so the
// extension can find and highlight it on the real page. Same
// ANTHROPIC_API_KEY env var as chat.js, no separate billing setup needed.
//
// Also accepts { text, url } directly (no fetch) as a fallback for pages
// the server can't reach, e.g. behind a login wall the person is already
// past in their own browser session.

const MAX_FETCH_BYTES = 800_000; // stop reading a runaway page well before it matters
const FETCH_TIMEOUT_MS = 8000;

function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPolicyText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; CybersafetySuperheroPolicyScan/1.0)" }
    });
    if (!res.ok) return { ok: false, error: `Could not load that page (status ${res.status}).` };
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text")) {
      return { ok: false, error: "That link isn't a readable web page." };
    }
    const reader = res.body ? res.body.getReader() : null;
    let html = "";
    if (reader) {
      let received = 0;
      const decoder = new TextDecoder();
      while (received < MAX_FETCH_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        html += decoder.decode(value, { stream: true });
      }
    } else {
      html = await res.text();
    }
    const text = stripHtmlToText(html).slice(0, 18000);
    if (text.length < 200) return { ok: false, error: "That page didn't have enough readable text to summarize." };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "That page took too long to load." : "Could not reach that page." };
  } finally {
    clearTimeout(timeout);
  }
}

// Finds a company's REAL privacy policy URL via live web search, rather
// than guessing common paths (which is what this used to do - too brittle,
// real sites use all kinds of paths: /policies/privacy-policy/,
// /trust/privacy/, /legal/privacy-notice/, etc, and plenty of sites like
// Canva render their footer client-side, so a raw fetch of the homepage
// finds nothing to guess from either). Same web_search tool chat.js already
// uses, same API key, no new setup.
async function findPolicyUrlViaSearch(company) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: "You find the exact URL of a company's official, currently live privacy policy page. Use web search. Respond with ONLY the URL on a single line, nothing else, no explanation. If you genuinely cannot find one, respond with exactly: NOT_FOUND",
        messages: [{ role: "user", content: `Company or domain: ${company}` }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]
      })
    });
    const data = await res.json();
    const raw = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
    const match = raw.match(/https?:\/\/[^\s"'<>)\]]+/);
    if (!match || /NOT_FOUND/.test(raw)) return null;
    return match[0];
  } catch (e) {
    return null;
  }
}

function buildSystem() {
  return `You are a privacy policy analyst for Cybersafety Superhero. You will be given the visible text of a company's privacy policy or terms page. Summarize it plainly, for someone with no legal background, so they can decide whether to trust the site with their data.

Respond with ONLY a single valid JSON object, nothing before or after it, no markdown fences. Use this exact shape:

{
  "company": "best guess at the company or site name, or empty string if unclear",
  "summary": "2-3 plain-language sentences on what this policy covers overall",
  "data_collected": ["short phrase", "short phrase", ...],
  "shared_with": ["short phrase naming who data is shared with and why", ...],
  "your_rights": ["short phrase describing a right the policy grants, e.g. 'Request deletion of your data'", ...],
  "red_flags": [{"flag": "short plain-language label for the concern", "quote": "a short excerpt, under 12 words, copied exactly from the text, that this concern comes from", "severity": "High" | "Medium"}, ...],
  "risk_level": "Low" | "Medium" | "High"
}

Guidance:
- data_collected, shared_with, your_rights: 2-6 short plain-language items each. Empty array if genuinely not addressed.
- red_flags: 0-5 items, only things like broad third-party data sales, vague retention periods, no opt-out, arbitration clauses waiving rights, data shared with unnamed "partners". Leave the array empty if the policy is reasonably standard, don't invent flags to fill space.
- severity "High" (shown in red): the company can clearly sell/share data broadly with limited control, waives meaningful legal rights (e.g. mandatory arbitration, class-action waiver), offers no deletion or opt-out path, or is vague specifically about something consequential (payment data, biometric data, location).
- severity "Medium" (shown in yellow): worth a careful read but fairly standard for the industry - long retention windows, broad "affiliates" sharing, standard analytics/advertising cookies, opt-out requires an email rather than a toggle.
- Each red flag's "quote" MUST be copied verbatim (exact words, under 12 words) from the provided text, so it can be located and highlighted on the real page. If you can't find a short exact quote that supports a concern, don't include that flag.
- risk_level reflects how permissive the policy is toward the company, not whether the company is a "scam" - a normal, standard corporate privacy policy is typically Low or Medium.
- If the provided text is not actually a privacy policy or terms page, still return the JSON shape, with summary explaining that, and empty arrays.
- Never invent specifics (numbers, laws, company details) not present in the text.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    let url = typeof body.url === "string" ? body.url.trim().slice(0, 2000) : "";
    const company = typeof body.company === "string" ? body.company.trim().slice(0, 200) : "";
    let text = typeof body.text === "string" ? body.text.trim().slice(0, 18000) : "";

    if (!url && !company && !text) {
      return { statusCode: 400, body: JSON.stringify({ error: "No policy URL, company, or text provided" }) };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: "Privacy scan is not configured on this deployment (missing ANTHROPIC_API_KEY)." }) };
    }

    // Prefer fetching a given URL fresh server-side. If that's missing or
    // fails, and a company/domain was given instead, search for the real
    // policy URL rather than guessing at paths.
    let fetched = null;
    if (url) {
      try { new URL(url); } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "That doesn't look like a valid URL." }) };
      }
      fetched = await fetchPolicyText(url);
    }

    if ((!fetched || !fetched.ok) && company) {
      const found = await findPolicyUrlViaSearch(company);
      if (!found) {
        return { statusCode: 502, body: JSON.stringify({ error: `Couldn't find a privacy policy for ${company}, even with a live search. Try pasting the exact policy URL instead.` }) };
      }
      url = found;
      fetched = await fetchPolicyText(url);
    }

    if (fetched && fetched.ok) {
      text = fetched.text;
    } else if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: (fetched && fetched.error) || "Could not load that page." }) };
    }
    // else: fetch failed but client already sent text as a fallback, use that.

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: buildSystem(),
        messages: [{ role: "user", content: `Page URL: ${url || "(not provided)"}\n\nPage text:\n${text}` }]
      })
    });

    const data = await res.json();
    if (data && data.error) {
      return { statusCode: 502, body: JSON.stringify({ error: "Upstream error" }) };
    }

    const raw = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: "Could not parse policy summary" }) };
    }

    parsed.url = url;
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
