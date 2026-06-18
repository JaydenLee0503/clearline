// Supabase Edge Function: analyze
//
// The privacy/security boundary. This is the ONLY place the Anthropic API key
// exists — it lives in the server environment (ANTHROPIC_API_KEY), never in the
// browser bundle.
//
// Contract:
//   POST { "tokenizedText": string, "pipelineType"?: string }  <- text already scrubbed by the Guardian
//   200  { "text": string }           <- raw assistant text (JSON as a string)
//   4xx/5xx { "error": string, ... }
//
// The client (src/agents/simplifier.js) is responsible for parsing/validating the
// returned text. This function stays deliberately dumb: it classifies, selects the
// right pipeline prompt, forwards tokenized text to the model, and returns the
// model's text. No real PII ever reaches this function because the Guardian runs
// first, on the device.

// ─── Keyword classifier ────────────────────────────────────────────────────
// Mirrors src/agents/pipelines/classifier.js — keep in sync when that file changes.
const KEYWORD_MAP: Record<string, string[]> = {
  immigration: ["visa","uscis","daca","i-797","i-485","i-130","i-765","i-912","refugee","asylum","ircc","immigration","biometric","biometrics","deportation","removal","green card","work permit","citizenship","naturalization","a-number","notice to appear","f-1","h-1b","dhs","lawful permanent","advance parole","irpa","prra","sponsorship"],
  medical:     ["discharge","medication","prescription","diagnosis","treatment","icu","surgery","hospital","physician","dme","durable medical","insurance waiver","prior authorization","titration","feeding pump","wound care","home health","physical therapy","hipaa","eob"],
  school:      ["scholarship","fafsa","financial aid","enrollment","tuition","suspension","expulsion","disciplinary","iep","accommodations","504 plan","mckinney-vento","student","university","college","school district","osap","student loan","bursary","registrar"],
  legal:       ["eviction","summons","subpoena","court","judge","hearing","lawsuit","complaint","defendant","plaintiff","garnishment","judgment","appeal","restraining order","warrant","attorney","diversion","probation","restitution","community service"],
  financial_aid: ["grant","benefit","welfare","snap","ebt","medicaid","chip","ssi","ssdi","disability","unemployment","odsp","ontario works","social assistance","food stamps","housing assistance","income support","tax credit","eitc","gst credit","child benefit"],
  housing:     ["lease","landlord","tenant","rent","eviction notice","notice to vacate","notice to quit","unlawful detainer","housing court","section 8","housing voucher","deposit","arrears","rent arrears","utility shutoff","habitability","rental agreement","housing authority"],
  employment:  ["termination","severance","layoff","wrongful dismissal","hr","human resources","employment contract","non-compete","nda","roe","record of employment","employment insurance","workers compensation","labour board","nlrb","eeoc","harassment","discrimination","union","grievance"],
};

function classifyDocument(text: string): string {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [type, kws] of Object.entries(KEYWORD_MAP)) {
    scores[type] = kws.filter(kw => lower.includes(kw)).length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : "legal";
}

// ─── Pipeline system prompts ───────────────────────────────────────────────
// CANONICAL SCHEMA — matches CLAUDE.md §10 exactly.
// Keep every pipeline prompt in sync with src/agents/pipelines/*.js.

const IMMIGRATION_SYSTEM_PROMPT = `You are the Bureaucracy Navigator — a Specialized Crisis Pipeline inside Resilience Hub.
Your job: read an immigration document and return a calm, structured action plan.

PRIVACY CONTRACT:
The document you receive has been pre-processed by a Guardian. Every personal identifier
has been replaced with a deterministic token: [DATE_1], [AMOUNT_1], [CASE_NUM_1], etc.
NEVER attempt to infer real values behind tokens. Use tokens EXACTLY as they appear.

Return EXACTLY ONE JSON object. No markdown fences, no prose outside the object, no extra keys.
Empty arrays are allowed; do not omit any key.

{
  "pipeline_type": "immigration",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "3-5 sentences at grade-6 level. Second person. State what the document is and the single most important thing the person must know.",
  "what_matters": ["Key fact or obligation extracted from this document"],
  "what_happens_if_ignored": ["Specific harm — not 'may affect your status' but 'your DACA expires and you lose FAFSA eligibility on [DATE_1]'"],
  "what_to_do_next": ["Active-voice instruction starting with a verb. Include token for any date or form number."],
  "who_can_help": [{ "name": "Organisation name", "contact": "phone or URL", "note": "one sentence — what they help with" }],
  "checklist": [{ "id": "c1", "text": "Short completable task starting with a verb", "deadline": "[DATE_1] or null" }],
  "deadlines": [{ "date": "[DATE_1]", "task": "What must happen by this date", "consequence": "What happens if missed" }],
  "questions_to_ask": ["A question the person should bring to their lawyer or caseworker"],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal or immigration advice. Verify all deadlines and decisions with a qualified immigration attorney or accredited representative."
}

URGENCY RUBRIC (most to least severe):
1. CRITICAL — status expiration or removal order.
2. HIGH     — biometric appointment closing; asylum 1-year deadline approaching; fee waiver document gap.
3. MEDIUM   — upcoming filing; status lapse to FAFSA consequence chain.
4. LOW      — advisory or informational notice with no imminent deadline.

Extract ALL of the following if present:
- Deadlines: any date with a filing, appointment, renewal, or response requirement.
- Biometric appointment: location, date/time window, what to bring.
- Forms referenced: form number, purpose, where to file.
- Required evidence/documents: list every item stated or implied.
- Fee waivers (I-912 or equivalent): income tier requirements, required attachments.
- Asylum 1-year rule: if entry date appears, flag the 1-year filing window.
- DACA renewal: flag 150-day advance renewal window.
- Status lapse to financial aid chain: if status expires, flag FAFSA/aid impact explicitly.
- Appeal rights: if a denial appears, extract the appeal deadline and process.
- Consequences of no-show: deportation orders, case abandonment, status lapse.

Grade-6 reading level. Short sentences. Active voice. Second person ("you").`;

const FALLBACK_SYSTEM_PROMPT = `You are a document intelligence assistant inside Resilience Hub.
Analyze the tokenized document and return ONE JSON object matching this exact shape.
No markdown fences. No prose outside the object. Empty arrays are allowed; do not omit keys.

{
  "pipeline_type": "legal",
  "urgency": "low | medium | high | critical",
  "plain_language_summary": "",
  "what_matters": [],
  "what_happens_if_ignored": [],
  "what_to_do_next": [],
  "who_can_help": [{ "name": "", "contact": "", "note": "" }],
  "checklist": [{ "id": "c1", "text": "", "deadline": null }],
  "deadlines": [{ "date": "", "task": "", "consequence": "" }],
  "questions_to_ask": [],
  "disclaimer": "This is an AI-generated summary for informational purposes only. It is not legal, medical, or financial advice. Verify all decisions with a qualified professional."
}

Set pipeline_type to whichever best fits the document content.
Grade-6 reading level. Second person ("you"). Active voice.
Tokens like [DATE_1] must appear exactly as-is in your output.`;

const PIPELINE_PROMPTS: Record<string, string> = {
  immigration: IMMIGRATION_SYSTEM_PROMPT,
  // Add remaining pipelines here as they are built:
  // medical: MEDICAL_SYSTEM_PROMPT,
  // school: SCHOOL_SYSTEM_PROMPT,
  // legal: LEGAL_SYSTEM_PROMPT,
  // financial_aid: FINANCIAL_AID_SYSTEM_PROMPT,
  // housing: HOUSING_SYSTEM_PROMPT,
  // employment: EMPLOYMENT_SYSTEM_PROMPT,
};

// ─── CORS ──────────────────────────────────────────────────────────────────
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

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "Server is not configured (missing ANTHROPIC_API_KEY)." }, 500);
  }

  let payload: { tokenizedText?: unknown; pipelineType?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const tokenizedText = payload?.tokenizedText;
  if (typeof tokenizedText !== "string" || tokenizedText.trim().length === 0) {
    return json({ error: "Field 'tokenizedText' (non-empty string) is required." }, 400);
  }

  // Classify — use client hint if provided, otherwise detect server-side.
  const requestedType = typeof payload?.pipelineType === "string" ? payload.pipelineType : null;
  const pipeline_type = requestedType ?? classifyDocument(tokenizedText);
  const systemPrompt = PIPELINE_PROMPTS[pipeline_type] ?? FALLBACK_SYSTEM_PROMPT;

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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Analyze this document:\n\n${tokenizedText}`,
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

  // Return raw text — client is responsible for parsing and validation.
  return json({ text }, 200);
});