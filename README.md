# HSE Web App

React + Vite + TypeScript application for HSE questionnaire collection, participant management, and Bitrix24 sync.

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase (auth, db, edge functions)
- Bitrix24 webhook integration

## Local setup

1. Install dependencies:

```bash
npm ci
```

2. Create `.env` from `.env.example` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BITRIX_WEBHOOK`

3. Run dev server:

```bash
npm run dev
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Security notes

- Cloudinary credentials must be set as Supabase Edge Function secrets:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- `update-user-password` edge function now requires:
  - `ADMIN_API_TOKEN` secret
  - `Authorization: Bearer <ADMIN_API_TOKEN>` header
- `ALLOWED_ORIGIN` is required in edge-function secrets (functions fail closed if missing).
