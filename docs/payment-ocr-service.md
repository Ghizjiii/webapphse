# Payment OCR Service

Pipeline:
1. Upload file to endpoint `/extract-payment-order`
2. Detect file type
3. If PDF -> PyMuPDF
4. If Image -> PaddleOCR
5. If Excel -> pandas
6. Return JSON with extracted fields

## Run locally

```bash
cd services/payment_ocr_service
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

Notes:
- For scanned PDFs, service does fallback OCR: renders PDF pages to images and runs PaddleOCR.
- OCR model is configured with `lang=\"ru\"` for better RU/KZ docs.
- Optional env for protected deployment:
  - `ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.vercel.app`
  - `PAYMENT_OCR_UPSTREAM_TOKEN=shared-secret`

## API

`POST /extract-payment-order`
- form-data: `file`
- header: `x-ocr-token` when `PAYMENT_OCR_UPSTREAM_TOKEN` is configured

Response:
```json
{
  "ok": true,
  "file_type": "pdf|image|excel",
  "extracted": {
    "payment_order_bin_iin": "...",
    "payment_order_number": "...",
    "payment_order_date": "YYYY-MM-DD",
    "payment_order_amount": "12345.67"
  },
  "text_preview": "..."
}
```

## Frontend env

Set OCR endpoint:

```env
VITE_PAYMENT_OCR_API_URL=http://localhost:8001
```

For Vercel proxy deployment:

```env
ALLOWED_ORIGIN=http://localhost:5173,https://your-domain.vercel.app
PAYMENT_OCR_UPSTREAM_URL=http://localhost:8001
PAYMENT_OCR_UPSTREAM_TOKEN=shared-secret
```
