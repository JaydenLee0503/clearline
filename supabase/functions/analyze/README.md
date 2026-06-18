# `analyze` Edge Function

Server-side proxy for the Simplifier. Holds `ANTHROPIC_API_KEY` so it never ships
to the browser. Receives Guardian-tokenized text, calls the model, returns the
raw assistant text for the client to parse.

## Request / response

```
POST /functions/v1/analyze
Body: { "tokenizedText": "<text with PII already replaced by tokens>" }

200 { "text": "<model output, JSON as a string>" }
4xx/5xx { "error": "...", "detail"?: "..." }
```

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed.
- An Anthropic API key.

> Note: Supabase project + Auth are **not** configured yet. For now run this
> function locally with JWT verification off.

## Local development

```bash
# 1. From the repo root, start the local stack (first time only):
supabase init          # creates supabase/config.toml if missing
supabase start         # optional: full local stack (db, etc.)

# 2. Put your key in supabase/functions/.env (gitignored):
cp supabase/functions/.env.example supabase/functions/.env
#   then edit it: ANTHROPIC_API_KEY=sk-ant-...

# 3. Serve the function (auth off until Supabase Auth is wired up):
supabase functions serve analyze --no-verify-jwt --env-file supabase/functions/.env
```

It will be available at `http://localhost:54321/functions/v1/analyze`, which is the
default the frontend uses (`VITE_ANALYZE_FUNCTION_URL`).

Smoke test:

```bash
curl -s http://localhost:54321/functions/v1/analyze \
  -H 'content-type: application/json' \
  -d '{"tokenizedText":"Your appointment is on [DATE_1]. Bring [AMOUNT_1]."}'
```

## Deploy (later, once a Supabase project exists)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy analyze
# then set VITE_ANALYZE_FUNCTION_URL to https://<project-ref>.functions.supabase.co/analyze
```

Re-enable JWT verification (drop `--no-verify-jwt`) once Supabase Auth is in place,
and set `ALLOWED_ORIGIN` to your deployed frontend origin.
