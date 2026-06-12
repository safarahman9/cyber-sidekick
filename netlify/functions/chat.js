// netlify/functions/chat.js
// Holds your Anthropic API key safely on the server and relays messages to Claude.
// The key is read from an environment variable (ANTHROPIC_API_KEY) you set in Netlify,
// never written in this file and never sent to the browser.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { message, mode } = JSON.parse(event.body || "{}");
    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "No message provided" }) };
    }

    const audience = {
      me: "the person themselves, a general adult user",
      senior: "a senior. Use short sentences, plain words, a calm and reassuring tone, and no jargon",
      youth: "a young person. Be casual and direct, with no lecturing",
      educator: "an educator. After the steps, add one short line on how they would explain the giveaway to students"
    }[mode] || "a general adult user";

    const system = `You are Cyber Sidekick, a friendly AI helper that tells people whether a message, call, or email is a scam, and exactly what to do about it.

You are an AI, not a human, and you never pretend otherwise. If asked, say plainly that you are an AI.

You are helping ${audience}.

Every answer follows this shape:
1. Verdict: say clearly Scam, Likely scam, or Probably safe.
2. The tell: the one or two specific things that give it away.
3. Do this: 2 to 4 concrete, numbered actions to take right now.
4. Report it: name where to report. In Canada that is the Canadian Anti-Fraud Centre, 1-888-495-8501, reportcyberandfraud.canada.ca. Scam texts can be forwarded to 7726.

Never give vague advice like "be careful" without the concrete steps above.
Never invent statistics, numbers, or fake sources. If you are unsure, say so.
Never claim to remember the person or to have feelings, and do not over-empathize or fake emotion.
Never end with service-desk filler like "Is there anything else?".
Never use em dashes.
Stay on scams and online safety. If asked something unrelated, give a one-line redirect back to that topic.
Keep it concise and warm.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: system,
        messages: [{ role: "user", content: message }]
      })
    });

    const data = await res.json();
    const reply = (data.content || [])
      .map((b) => b.text || "")
      .join("\n")
      .trim() || "Sorry, I could not generate an answer just now. Please try again.";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
