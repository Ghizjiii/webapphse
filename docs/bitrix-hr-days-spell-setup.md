# Bitrix24 -> Supabase: "Кол-во дней и прописью"

Эта интеграция для HR smart process `entityTypeId=1050`:

- читает `Дата начала` (`UF_CRM_10_1771778909`)
- читает `Дата завершения` (`UF_CRM_10_1771778942`)
- считает количество календарных дней включительно
- записывает результат в `Кол-во дней` (`UF_CRM_10_1772124949853`)
- записывает текст в `Кол-во дней прописью` (`UF_CRM_10_1772131937986`)

Пример:

- `02.03.2026` -> `09.04.2026` = `39` дней
- прописью: `тридцать девять`

## 1) Деплой Edge Function

```bash
supabase functions deploy bitrix-hr-days-spell
```

URL будет вида:
`https://<project-ref>.supabase.co/functions/v1/bitrix-hr-days-spell`

## 2) Secrets в Supabase

Добавьте secrets:

- `BITRIX_WEBHOOK_URL`
  - входящий webhook Bitrix, например:
  - `https://<your-domain>.bitrix24.kz/rest/<user_id>/<webhook_code>`
- `BITRIX_OUTGOING_TOKEN`
  - секрет, который Bitrix будет передавать в исходящем webhook
- `BITRIX_HR_ENTITY_TYPE_ID=1050` (опционально)
- `BITRIX_HR_START_DATE_FIELD=ufCrm10_1771778909` (опционально)
- `BITRIX_HR_END_DATE_FIELD=ufCrm10_1771778942` (опционально)
- `BITRIX_HR_DAYS_NUMBER_FIELD=ufCrm10_1772124949853` (опционально)
- `BITRIX_HR_DAYS_WORDS_FIELD=ufCrm10_1772131937986` (опционально)

## 3) Настройка исходящего webhook в Bitrix24

Рекомендуемый payload:

```json
{
  "token": "YOUR_SECRET_TOKEN",
  "document_id": "{{DOCUMENT_ID}}",
  "itemId": "{{ID}}",
  "entityTypeId": "1050"
}
```

При желании можно передавать даты явно:

```json
{
  "token": "YOUR_SECRET_TOKEN",
  "itemId": "{{ID}}",
  "entityTypeId": "1050",
  "startDate": "{{UfCrm101771778909}}",
  "endDate": "{{UfCrm101771778942}}"
}
```

Endpoint:

`https://<project-ref>.supabase.co/functions/v1/bitrix-hr-days-spell?token=YOUR_SECRET_TOKEN`

Достаточно передавать `document_id` или `itemId`.
Если даты не переданы в payload, функция сама прочитает их из Bitrix через `crm.item.get`.

Важно по Supabase Function:

- В `Function configuration` отключите `Verify JWT with legacy secret` (OFF), иначе Bitrix webhook получит `401`.

Важно по токену:

- Либо передавайте `?token=...` в URL webhook.
- Либо задайте `BITRIX_OUTGOING_TOKEN` равным `Токен приложения` из Bitrix исходящего webhook. Функция поддерживает `auth[application_token]`.

## 4) Что делает функция

1. Проверяет токен.
2. Проверяет, что элемент относится к `entityTypeId=1050`.
3. Читает `Дата начала` и `Дата завершения`.
4. Считает календарные дни включительно.
5. Записывает число в поле `Кол-во дней`.
6. Преобразует число в русскую пропись.
7. Записывает текст в поле `Кол-во дней прописью`.

## 5) Быстрая проверка

1. В HR элементе измените `Дата начала` или `Дата завершения`.
2. Дождитесь срабатывания исходящего webhook.
3. Проверьте, что:
   - `Кол-во дней` пересчиталось автоматически
   - `Кол-во дней прописью` тоже обновилось

## Если нужна помощь с подключением

- `project-ref` Supabase
- значение `BITRIX_WEBHOOK_URL` (можно частично скрыть)
- скрин настройки исходящего webhook (URL + payload)
- ID HR элемента для теста
