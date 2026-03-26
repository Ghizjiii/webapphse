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
  - Supports comma-separated values.
  - Supports wildcard host rules: `https://*.vercel.app` and `*.vercel.app`.
  - Example:
    - `ALLOWED_ORIGIN=http://localhost:5173,https://your-prod-domain.vercel.app,https://*.vercel.app`
- Document generation via Google Apps Script requires:
  - `GOOGLE_APPS_SCRIPT_URL` (deployed GAS Web App endpoint)
  - `GOOGLE_APPS_SCRIPT_TOKEN` (shared secret between Edge Function and GAS, optional but recommended)
- Protocol generation via Google Apps Script requires:
  - `GOOGLE_APPS_SCRIPT_PROTOCOL_URL` (separate GAS Web App endpoint for protocol templates; falls back to `GOOGLE_APPS_SCRIPT_URL` if omitted)
  - `GOOGLE_APPS_SCRIPT_PROTOCOL_TOKEN` (shared secret for protocol GAS; falls back to `GOOGLE_APPS_SCRIPT_TOKEN` if omitted)
- Vercel OCR proxy `api/extract-payment-order` requires server-side env vars:
  - `ALLOWED_ORIGIN` (same allowlist format as Supabase edge functions)
  - `PAYMENT_OCR_UPSTREAM_URL` (URL of PaddlePDF OCR service)
  - `PAYMENT_OCR_UPSTREAM_TOKEN` (optional but recommended; must match OCR service env)
- Optional Bitrix deal mapping for payment order (used in questionnaire sync):
  - `VITE_BITRIX_DEAL_PAYMENT_FIELD` (for example `UF_CRM_...`)
  - `VITE_BITRIX_DEAL_PAYMENT_FILE_FIELD` (UF field in deal with type `Файл`, for payment-order file)
  - `VITE_BITRIX_DEAL_PAYMENT_STATUS_FIELD` (UF field in deal with type `Да/Нет`, value maps from coordinator checkbox)
- Protocol smart-process UI uses:
  - `VITE_BITRIX_PROTOCOL_ENTITY_TYPE_ID` (default `1070`)
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

## Protocol generation flow

1. Questionnaire page automatically derives protocol rows from employee certificate rows (`1056`) by course/template/category.
2. Coordinator opens tab `Протоколы`, fills `Номер протокола` and `Дата протокола`.
3. Frontend calls Supabase Edge Function `generate-protocol-document`.
4. Edge Function sends grouped row data to a dedicated Google Apps Script Web App for protocol templates.
5. GAS creates one Google Doc per protocol/course/category group and returns `fileUrl`.
6. Frontend stores generated file metadata in `protocols` and can sync protocol metadata to Bitrix24 smart process `1070`.

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
