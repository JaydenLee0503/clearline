/**
 * Simplifier — Phase 0 Agent (client side)
 *
 * Receives TOKENIZED text (all PII already replaced with [KEY_N] tokens) and
 * calls our OWN backend (a Supabase Edge Function), which holds the Anthropic
 * API key and talks to the model. The key never reaches the browser.
 *
 * The API receives NO real PII. Tokens travel to the model; real values never
 * leave the device. This is verifiable in DevTools: open the Network tab and
 * inspect the outgoing request body — you will see tokens like [DATE_1].
 *
 * Configure the endpoint with VITE_ANALYZE_FUNCTION_URL (see .env.example).
 * Defaults to the local Supabase functions dev server.
 */

const ANALYZE_URL =
  import.meta.env.VITE_ANALYZE_FUNCTION_URL ??
  'http://localhost:54321/functions/v1/analyze';

// Supabase requires the anon key to invoke functions when JWT verification is on.
// Optional for local `--no-verify-jwt`; set it for deployed environments.
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * @param {string} tokenizedText  — Guardian output (no real PII)
 * @returns {Promise<object>}     — structured analysis object
 */
export async function runSimplifier(tokenizedText) {
  const headers = { 'Content-Type': 'application/json' };
  if (ANON_KEY) {
    headers.Authorization = `Bearer ${ANON_KEY}`;
    headers.apikey = ANON_KEY;
  }

  let response;
  try {
    response = await fetch(ANALYZE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tokenizedText }),
    });
  } catch (err) {
    throw new Error(
      'Could not reach the analysis service. Is the backend running? ' +
        `(${err.message})`
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.error || body.detail || '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(`Analysis service error ${response.status}: ${String(detail).slice(0, 200)}`);
  }

  const { text: raw = '' } = await response.json();

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
