# Self-hosted Supabase deploy

The app uses self-hosted Supabase:

```text
VITE_SUPABASE_URL=https://supabase.hse-company.kz
```

Frontend deployment and Supabase deployment are separate:

- `.github/workflows/deploy-frontend.yml` builds the frontend and uploads `dist/` to the VPS.
- SQL migrations in `supabase/migrations/` are not applied by that workflow.
- Edge Functions in `supabase/functions/` are not deployed by that workflow.

## Local env

The local `.env` file is ignored by git and contains runtime values for local development.

Do not commit:

- Supabase anon keys
- Bitrix webhooks
- VPS SSH credentials
- Supabase dashboard password

## Current production Supabase values

These values are configured locally in `.env`:

```text
VITE_SUPABASE_URL=https://supabase.hse-company.kz
VITE_PUBLIC_APP_URL=https://app.hse-company.kz
```

The Bitrix outgoing webhook points to:

```text
https://supabase.hse-company.kz/functions/v1/reference-sync
```

## Current trash feature files

- Migration: `supabase/migrations/20260709000200_add_questionnaire_trash.sql`
- Edge Function: `supabase/functions/questionnaire-trash/index.ts`

## What must be applied on the self-hosted Supabase

For the questionnaire trash feature:

1. Apply SQL migration `20260709000200_add_questionnaire_trash.sql`.
2. Deploy/update Edge Function `questionnaire-trash`.
3. Make sure the function environment has `BITRIX_WEBHOOK_URL`.
4. Restart/reload the relevant Supabase services if the self-hosted deployment requires it.

The exact commands depend on how Supabase is installed on the VPS: Docker Compose, Supabase CLI, or a custom service layout.

## Document generation timeouts

Document generation calls Google Apps Script and therefore crosses four timeout layers. Keep the outer layers longer than the inner one so the Edge Function can return a JSON error with CORS headers instead of a generic gateway response:

```text
Google Apps Script fetch timeout: 285 seconds
Edge Runtime document worker:     300 seconds
Kong functions-v1 read_timeout:   330000 milliseconds
nginx proxy_read_timeout:         330 seconds
```

For the self-hosted stack, the Kong value is configured on the `functions-v1` service in:

```text
/opt/supabase-selfhosted/volumes/api/kong.yml
```

After changing it, validate the declarative config and restart only Kong. Keep a backup of the previous file for rollback.
