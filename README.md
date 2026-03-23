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
- `VITE_PAYMENT_OCR_API_URL`

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
  - Supports comma-separated values.
  - Supports wildcard host rules: `https://*.vercel.app` and `*.vercel.app`.
  - Example:
    - `ALLOWED_ORIGIN=http://localhost:5173,https://your-prod-domain.vercel.app,https://*.vercel.app`
- Document generation via Google Apps Script requires:
  - `GOOGLE_APPS_SCRIPT_URL` (deployed GAS Web App endpoint)
  - `GOOGLE_APPS_SCRIPT_TOKEN` (shared secret between Edge Function and GAS, optional but recommended)
- Bitrix integration secrets now live only in Supabase Edge Functions:
 - `BITRIX_DEAL_PAYMENT_FIELD` (for example `UF_CRM_...`)
 - `BITRIX_DEAL_PAYMENT_FILE_FIELD` (UF field in deal with type `Файл`, for payment-order file)
 - `BITRIX_DEAL_PAYMENT_STATUS_FIELD` (UF field in deal with type `Да/Нет`, value maps from coordinator checkbox)
 - `BITRIX_CONTRACT_ENTITY_TYPE_ID` (optional, default `1060`)
- HR days-to-words webhook function requires:
  - `BITRIX_WEBHOOK_URL`
  - `BITRIX_OUTGOING_TOKEN`
  - optional overrides:
    - `BITRIX_HR_ENTITY_TYPE_ID` (default `1050`)
    - `BITRIX_HR_DAYS_NUMBER_FIELD` (default `ufCrm10_1772124949853`)
    - `BITRIX_HR_DAYS_WORDS_FIELD` (default `ufCrm10_1772131937986`)

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
5. Coordinator marks rows as printed in tab `Printed documents`, then syncs this flag to Bitrix24.

## HR vacation days text sync

- Function: `bitrix-hr-days-spell`
- Setup guide: `docs/bitrix-hr-days-spell-setup.md`

## Company directory sync (Bitrix24)

- New reference tab: `Справочник компаний`
- Sync source:
  - Bitrix companies (`crm.company.list`)
  - Smart process contracts (`entityTypeId=1060` by default)
- Public form flow:
  - BIN/IIN lookup in local `ref_company_directory`
  - Auto-fill company info + contract snapshot
  - If no active contract, user can confirm `Нет договора` and fill manually
  - Optional payment-order file can be attached
