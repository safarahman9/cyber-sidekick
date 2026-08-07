// netlify/functions/privacy-scan.js
//
// Reads a privacy policy (or terms/privacy-adjacent page) that the extension
// pulled from the current tab, and asks Claude to summarize it into a fixed
// structure: what data is collected, who it's shared with, what rights the
// person has, and any notable red flags. Same ANTHROPIC_API_KEY env var as
// chat.js, no separate billing setup needed.
//
// Deliberately narrow: this function does ONE thing (summarize policy text
// someone already has in front of them). It never fetches URLs itself and
// never stores anything, the extension sends page text it already read on
// the user's own click, same privacy model as the rest of the extension.

function buildSystem() {
  return `You are a privacy policy analyst for Cybersafety Superhero. You will be given the visible text of a company's privacy policy or terms page. Summarize it plainly, for someone with no legal background, so they can decide whether to trust the site with their data.

Respond with ONLY a single valid JSON object, nothing before or after it, no markdown fences. Use this exact shape:

{
  "company": "best guess at the company or site name, or empty string if unclear",
  "summary": "2-3 plain-language sentences on what this policy covers overall",
  "data_collected": ["short phrase", "short phrase", ...],
  "shared_with": ["short phrase naming who data is shared with and why", ...],
  "your_rights": ["short phrase describing a right the policy grants, e.g. 'Request deletion of your data'", ...],
  "red_flags": ["short phrase noting anything unusually permissive, vague, or concerning", ...],
  "risk_level": "Low" | "Medium" | "High"
}

Guidance:
- data_collected, shared_with, your_rights, red_flags: 2-6 short items each, plain words, no legalese. Empty array if genuinely not addressed.
- red_flags: things like broad third-party data sales, vague retention periods, no opt-out, arbitration clauses waiving rights, data shared with unnamed "partners". Leave empty if the policy is reasonably standard, don't invent flags to fill space.
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
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 15000) : "";
    const url = typeof body.url === "string" ? body.url.slice(0, 2000) : "";

    if (!text) {
      return { statusCode: 400, body: JSON.stringify({ error: "No policy text provided" }) };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: "Privacy scan is not configured on this deployment (missing ANTHROPIC_API_KEY)." }) };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
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
