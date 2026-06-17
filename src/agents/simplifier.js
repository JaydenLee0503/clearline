/**
 * Simplifier — Phase 0 Agent
 *
 * Receives TOKENIZED text (all PII already replaced with [KEY_N] tokens).
 * Calls the Anthropic API and returns structured analysis.
 *
 * The API receives NO real PII. Tokens travel to the model; real values
 * never leave the device. This is verifiable in DevTools: open the
 * Network tab and inspect the outgoing request body.
 */

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

/**
 * @param {string} tokenizedText  — Guardian output (no real PII)
 * @returns {Promise<object>}     — structured analysis object
 */
export async function runSimplifier(tokenizedText) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyze this document and return the JSON structure described:\n\n${tokenizedText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Simplifier API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();

  // Extract the text block
  const raw = data.content?.find((block) => block.type === 'text')?.text ?? '';

  // Strip any accidental markdown fences
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  try {
    const parsed = JSON.parse(clean);

    // Minimal validation
    if (!parsed.docType || !Array.isArray(parsed.actions)) {
      throw new Error('Unexpected response shape from Simplifier.');
    }

    return parsed;
  } catch (err) {
    console.error('Simplifier parse error. Raw response:', raw);
    throw new Error(
      'Could not parse the analysis. The document may be too short or in an unsupported format.'
    );
  }
}
