// Supabase Edge Function: analyze
//
// The privacy/security boundary. This is the ONLY place the Anthropic API key
// exists — it lives in the server environment (ANTHROPIC_API_KEY), never in the
// browser bundle.
//
// Contract:
//   POST { "tokenizedText": string }   <- text already scrubbed by the Guardian
//   200  { "text": string }            <- raw assistant text (JSON as a string)
//   4xx/5xx { "error": string, ... }
//
// The client (src/agents/simplifier.js) is responsible for parsing/validating the
// returned text. This function stays deliberately dumb: it forwards tokenized text
// to the model and returns the model's text. No real PII ever reaches this function
// because the Guardian runs first, on the device.

// Moved here from the client so the prompt is server-authoritative and cannot be
// tampered with from the browser.
const SYSTEM_PROMPT = `You are the Simplifier agent in ResilienceHub, a privacy-first document intelligence system.

CRITICAL PRIVACY CONTRACT:
The text you receive has been pre-processed by a Guardian. All personal identifiers have been replaced with deterministic tokens: [SIN_1], [SSN_1], [DATE_1], [AMOUNT_1], [PHONE_1], [POSTAL_1], [HEALTH_1], etc.
- NEVER attempt to infer or reconstruct real values behind tokens.
- Use tokens EXACTLY as they appear, unchanged, in your output.
- Do not add, remove, or alter any brackets or underscores in tokens.

YOUR JOB:
Analyze the tokenized document and return a single JSON object. No preamble, no markdown fences, no commentary — only valid JSON.

RETURN THIS EXACT STRUCTURE:
{
  "docType": "one of: immigration | medical | housing | education | juvenile | legal | unknown",
  "jurisdiction": "city and province/state, or 'unknown' if not determinable",
  "summary": "3–5 sentences at grade 6 reading level. Second person ('you'). Use token placeholders where real values appear. Be specific about what this document means for the person reading it.",
  "urgencyNote": "One sentence: what is the single most important thing to act on, and why.",
  "actions": [
    {
      "id": "action_1",
      "text": "Plain verb phrase — exactly what to do (e.g. 'Call this number to confirm your appointment')",
      "deadline": "Token if a specific date applies (e.g. [DATE_1]), or 'no hard deadline — sooner is better', or 'immediate'",
      "consequence": "Specific consequence if this action is skipped — not vague. Name the real harm.",
      "urgencyScore": 8
    }
  ]
}

RULES FOR ACTIONS:
- urgencyScore is 1–10; 10 = catastrophic if ignored, 1 = optional
- Sort actions by urgencyScore descending
- Every required action explicitly stated in the document must appear
- consequence must be specific: not 'may affect your status' but 'your DACA expires and you lose FAFSA eligibility'
- Maximum 8 actions for Phase 0; prioritise the highest-stakes ones

READING LEVEL:
- Grade 6: short sentences, active voice, common words
- Avoid: 'pursuant to', 'in accordance with', 'herein', 'aforementioned'
- Replace with: 'because of', 'following', 'here', 'mentioned above'
- For teen-directed documents: even simpler — 'This does NOT mean you get kicked out'`;

// Allow the browser app to call this function. Lock this down to your deployed
// origin in production by setting ALLOWED_ORIGIN.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(
      { error: "Server is not configured (missing ANTHROPIC_API_KEY)." },
      500,
    );
  }

  let payload: { tokenizedText?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const tokenizedText = payload?.tokenizedText;
  if (typeof tokenizedText !== "string" || tokenizedText.trim().length === 0) {
    return json({ error: "Field 'tokenizedText' (non-empty string) is required." }, 400);
  }

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Analyze this document and return the JSON structure described:\n\n${tokenizedText}`,
          },
        ],
      }),
    });
  } catch (err) {
    return json({ error: "Failed to reach the model provider.", detail: String(err) }, 502);
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text().catch(() => "");
    return json(
      { error: `Model provider error ${anthropicRes.status}.`, detail: detail.slice(0, 300) },
      502,
    );
  }

  const data = await anthropicRes.json();
  const text =
    Array.isArray(data?.content)
      ? data.content.find((b: { type?: string }) => b?.type === "text")?.text ?? ""
      : "";

  return json({ text }, 200);
});
