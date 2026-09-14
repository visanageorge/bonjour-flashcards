# Gemini card generation

The browser calls an authenticated Supabase Edge Function. The Gemini API key stays in Supabase Secrets and is never bundled into the web app.

## One-time database migration

Run the complete contents of `supabase/templates.sql` in Supabase Dashboard > SQL Editor.

This creates:

- private per-user templates;
- RLS policies for template CRUD;
- the shared Usage aggregate including both users.

## Deploy the Edge Function

Authenticate the CLI once:

```bash
npx supabase login
```

Then deploy:

```bash
npm run deploy:supabase
```

The deployed function requires `GEMINI_API_KEY` in Supabase Edge Function Secrets. It optionally accepts `GEMINI_MODEL` and otherwise uses `gemini-2.5-flash`.

## Publish the web app

After the migration and function deploy succeed:

```bash
npm run deploy:firebase
```

## Security and limits

- Supabase verifies the signed-in user's JWT before the function runs.
- The Gemini key exists only inside the Edge Function.
- `claim_ai_generation()` enforces one shared limit of 100 requests per Bucharest calendar day.
- Gemini token metadata is added to the shared Usage dashboard after successful responses.
- Generated text always remains editable before the card is saved.
