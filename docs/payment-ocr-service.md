# Payment OCR Service

## Current production flow

1. User uploads PDF/JPG/PNG in the public form.
2. Frontend calls Supabase Edge Function `parse-payment-order`.
3. Edge Function forwards the file to the protected OCR server `POST /parse-payment`.
4. OCR server extracts:
   - `payment_number`
   - `payment_date`
   - `amount`
   - `payer_bin`
   - `payer_name`
5. Edge Function maps the response into frontend fields:
   - `payment_order_number`
   - `payment_order_date`
   - `payment_order_amount`
   - `payment_order_bin_iin`

The browser must not call `ocr.absystems.kz` directly because the OCR service is protected by a shared secret.

## OCR server

Production OCR server is the separate project in `C:\dev\AB\HSE\webapp\app_ocr`.

Current protected endpoints:
- `POST /ocr`
- `POST /parse-payment`
- `GET /version`

Public endpoint:
- `GET /health`

Authentication:
- `Authorization: Bearer <OCR_SHARED_SECRET>`

## Supabase secrets

Set these in Supabase Edge Function secrets:

```env
ALLOWED_ORIGIN=http://localhost:5173,https://your-frontend-domain.vercel.app
PAYMENT_OCR_API_URL=https://ocr.absystems.kz
PAYMENT_OCR_API_TOKEN=your-shared-secret
```

`PAYMENT_OCR_API_TOKEN` must match `OCR_SHARED_SECRET` on the OCR server.

## Frontend env

No dedicated Vite OCR URL is required anymore. Frontend only needs:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Legacy local service

This repository still contains the older local OCR prototype in `services/payment_ocr_service` and the optional Vercel proxy `api/extract-payment-order.js`.

They are no longer the primary production path and should be treated as legacy/local tooling unless you explicitly decide to keep that route.
