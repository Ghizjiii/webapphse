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
- Document generation via Google Apps Script requires:
  - `GOOGLE_APPS_SCRIPT_URL` (deployed GAS Web App endpoint)
  - `GOOGLE_APPS_SCRIPT_TOKEN` (shared secret between Edge Function and GAS, optional but recommended)

## Google Docs generation flow

1. Frontend calls Supabase Edge Function `generate-document`.
2. Edge Function sends request to Google Apps Script Web App with:
   - `templateKey`
   - `templateName`
   - `fileName`
   - `placeholders` (key/value map for `{{...}}`)
   - `photoUrl` (optional)
3. GAS creates Google Doc from template and returns `fileUrl`.
4. Frontend stores generated file metadata in `generated_documents` and updates related `certificates.document_url`.
5. Coordinator marks rows as `Напечатан` in tab `Распечатанные документы`, then syncs this flag to Bitrix24.
