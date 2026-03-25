from __future__ import annotations

import io
import os
import re
from datetime import datetime
from typing import Any

import cv2
import fitz  # PyMuPDF
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR

ALLOWED_ORIGINS = [v.strip() for v in os.getenv("ALLOWED_ORIGINS", "*").split(",") if v.strip()]
UPSTREAM_TOKEN = os.getenv("PAYMENT_OCR_UPSTREAM_TOKEN", "").strip()

app = FastAPI(title="Payment OCR Service", version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ocr: PaddleOCR | None = None

RU_MONTHS = {
    "января": 1,
    "февраля": 2,
    "марта": 3,
    "апреля": 4,
    "мая": 5,
    "июня": 6,
    "июля": 7,
    "августа": 8,
    "сентября": 9,
    "октября": 10,
    "ноября": 11,
    "декабря": 12,
}


def get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        # ru model also recognizes latin digits/symbols and works better for KZ/RU payment docs.
        _ocr = PaddleOCR(use_angle_cls=True, lang="ru", show_log=False)
    return _ocr


def detect_file_type(filename: str, content_type: str) -> str:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()

    if name.endswith(".pdf") or ctype == "application/pdf":
        return "pdf"
    if name.endswith((".xls", ".xlsx")) or "excel" in ctype or "spreadsheet" in ctype:
        return "excel"
    if name.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff")) or ctype.startswith("image/"):
        return "image"
    return "unknown"


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\xa0", " ")).strip()


def normalize_amount(raw: str) -> str:
    cleaned = re.sub(r"[^\d,\.]", "", raw or "").replace(",", ".")
    if not cleaned:
        return ""
    try:
        value = float(cleaned)
    except ValueError:
        return ""
    if value <= 0:
        return ""
    return f"{value:.2f}"


def normalize_date(raw: str) -> str:
    raw = normalize_spaces(raw).lower()

    for fmt in ("%d.%m.%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Russian textual date: "19 ноября 2024"
    m = re.search(r"\b([0-3]?\d)\s+([а-яё]+)\s+(\d{4})\b", raw)
    if m:
        day = int(m.group(1))
        month = RU_MONTHS.get(m.group(2), 0)
        year = int(m.group(3))
        if month:
            try:
                dt = datetime(year, month, day)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                return ""

    return ""


def _prepare_image_variants(img: np.ndarray) -> list[np.ndarray]:
    variants: list[np.ndarray] = []

    h, w = img.shape[:2]
    scale = 1.0
    if max(h, w) < 1700:
        scale = 1.8
    elif max(h, w) < 2300:
        scale = 1.35

    if scale > 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)
    blur = cv2.GaussianBlur(gray_clahe, (3, 3), 0)

    adaptive = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        13,
    )
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    variants.append(img)
    variants.append(cv2.cvtColor(gray_clahe, cv2.COLOR_GRAY2BGR))
    variants.append(cv2.cvtColor(adaptive, cv2.COLOR_GRAY2BGR))
    variants.append(cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR))
    return variants


def _ocr_lines_from_image(image: np.ndarray) -> list[str]:
    ocr = get_ocr()
    result = ocr.ocr(image)

    lines: list[str] = []
    for page in result or []:
        for block in page or []:
            txt = normalize_spaces(str((block[1] or [""])[0]))
            conf = float((block[1] or ["", 0.0])[1] or 0.0)
            if txt and conf >= 0.20:
                lines.append(txt)
    return lines


def ocr_lines_from_bytes(image_bytes: bytes) -> list[str]:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    lines: list[str] = []
    seen: set[str] = set()
    for variant in _prepare_image_variants(img):
        for line in _ocr_lines_from_image(variant):
            key = line.lower()
            if key in seen:
                continue
            seen.add(key)
            lines.append(line)
    return lines


def text_from_image(data: bytes) -> str:
    return "\n".join(ocr_lines_from_bytes(data))


def text_from_pdf(data: bytes) -> str:
    doc = fitz.open(stream=data, filetype="pdf")

    extracted: list[str] = []
    for page in doc:
        txt = page.get_text("text")
        if txt and txt.strip():
            extracted.append(txt)

    merged = "\n".join(extracted).strip()

    # Fallback for scanned PDFs: OCR rendered pages when native text is too small.
    if len(merged) < 200:
        ocr_text_parts: list[str] = []
        for i, page in enumerate(doc):
            if i >= 3:
                break
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            img_bytes = pix.tobytes("png")
            lines = ocr_lines_from_bytes(img_bytes)
            if lines:
                ocr_text_parts.append("\n".join(lines))
        if ocr_text_parts:
            merged = f"{merged}\n" + "\n".join(ocr_text_parts)

    return merged.strip()


def text_from_excel(data: bytes) -> str:
    buf = io.BytesIO(data)
    sheets = pd.read_excel(buf, sheet_name=None, dtype=str)
    parts: list[str] = []
    for sheet_name, df in sheets.items():
        parts.append(f"[sheet:{sheet_name}]")
        filled = df.fillna("").astype(str)
        for row in filled.itertuples(index=False):
            line = " ".join(str(cell).strip() for cell in row if str(cell).strip())
            if line:
                parts.append(line)
    return "\n".join(parts)


def pick_sender_bin(source: str) -> str:
    sender_patterns = [
        r"(?:отправитель\s*денег|отправитель|плательщик)[\s\S]{0,200}?(\d{12})",
        r"(?:бин\s*отправителя|иин\s*\(бин\)|бин\s*\(иин\))[\s\S]{0,80}?(\d{12})",
    ]
    for p in sender_patterns:
        m = re.search(p, source, flags=re.IGNORECASE)
        if m:
            return m.group(1)

    first = re.search(r"(?<!\d)(\d{12})(?!\d)", source)
    return first.group(1) if first else ""


def pick_number_and_date(source: str) -> tuple[str, str]:
    number = ""
    date = ""

    # "Платежное поручение №628 19 ноября 2024 г."
    m = re.search(
        r"плат[её]жн\w*\s+поручен\w*\s*№\s*([a-zа-я0-9\-/]{1,40})[\s,;:]*([0-3]?\d\s+[а-яё]+\s+\d{4}|\d{2}[.\-/]\d{2}[.\-/]\d{4}|\d{4}[.\-/]\d{2}[.\-/]\d{2})",
        source,
        flags=re.IGNORECASE,
    )
    if m:
        number = m.group(1).strip().upper()
        date = normalize_date(m.group(2))
        return number, date

    # "№ 0256 от 10.03.2026"
    m2 = re.search(
        r"№\s*([a-zа-я0-9\-/]{1,40})\s*(?:от|from)?\s*(\d{2}[.\-/]\d{2}[.\-/]\d{4}|\d{4}[.\-/]\d{2}[.\-/]\d{2})",
        source,
        flags=re.IGNORECASE,
    )
    if m2:
        number = m2.group(1).strip().upper()
        date = normalize_date(m2.group(2))
        return number, date

    # Fallback separate number/date
    num = re.search(r"(?:№|#|no\.?|n\.?)[\s:]*([a-zа-я0-9\-/]{2,40})", source, flags=re.IGNORECASE)
    if num:
        number = num.group(1).strip().upper()

    date_candidates = re.findall(r"\b\d{2}[.\-/]\d{2}[.\-/]\d{4}\b|\b\d{4}[.\-/]\d{2}[.\-/]\d{2}\b|\b[0-3]?\d\s+[а-яё]+\s+\d{4}\b", source, flags=re.IGNORECASE)
    for candidate in date_candidates:
        d = normalize_date(candidate)
        if d:
            date = d
            break

    return number, date


def pick_amount(source: str) -> str:
    # Priority: amount near keywords.
    m = re.search(
        r"(?:сумма\s*прописью\s*:|сумма\s*:|сумма|итого|amount|total)[^\d]{0,30}(\d{1,3}(?:[ \u00A0]\d{3})*(?:[\.,]\d{2})|\d+[\.,]\d{2})",
        source,
        flags=re.IGNORECASE,
    )
    if m:
        amount = normalize_amount(m.group(1))
        if amount:
            return amount

    # Fallback: pick the largest plausible decimal amount.
    candidates = re.findall(r"\d{1,3}(?:[ \u00A0]\d{3})*(?:[\.,]\d{2})|\d+[\.,]\d{2}", source)
    values: list[tuple[float, str]] = []
    for c in candidates:
        norm = normalize_amount(c)
        if not norm:
            continue
        values.append((float(norm), norm))
    if not values:
        return ""
    values.sort(key=lambda x: x[0], reverse=True)
    return values[0][1]


def extract_fields(text: str) -> dict[str, str]:
    source = normalize_spaces(text)
    out: dict[str, str] = {}

    bin_iin = pick_sender_bin(source)
    if bin_iin:
        out["payment_order_bin_iin"] = bin_iin

    number, date = pick_number_and_date(source)
    if number:
        out["payment_order_number"] = number
    if date:
        out["payment_order_date"] = date

    amount = pick_amount(source)
    if amount:
        out["payment_order_amount"] = amount

    return out


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract-payment-order")
async def extract_payment_order(
    file: UploadFile = File(...),
    x_ocr_token: str | None = Header(default=None),
) -> dict[str, Any]:
    if UPSTREAM_TOKEN and x_ocr_token != UPSTREAM_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    file_type = detect_file_type(file.filename or "", file.content_type or "")

    try:
        if file_type == "pdf":
            text = text_from_pdf(data)
        elif file_type == "image":
            text = text_from_image(data)
        elif file_type == "excel":
            text = text_from_excel(data)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {exc}") from exc

    extracted = extract_fields(text)
    return {
        "ok": True,
        "file_type": file_type,
        "extracted": extracted,
        "text_preview": text[:5000],
    }
