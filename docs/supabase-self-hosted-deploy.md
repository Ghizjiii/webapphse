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
VITE_PUBLIC_APP_URL=https://hse.absystems.kz
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
