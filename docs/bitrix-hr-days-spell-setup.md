# Bitrix24 -> Supabase: "Дни отпуска прописью"

Эта интеграция обновляет поле:
- `Кол-во дней отпуска прописью` (`UfCrm101772131937986`)

по числовому полю:
- `Кол-во дней отпуска` (`UfCrm101772124949853`)

для смарт-процесса HR `entityTypeId=1050`.

## 1) Деплой Edge Function

```bash
supabase functions deploy bitrix-hr-days-spell
```

URL будет вида:
`https://<project-ref>.supabase.co/functions/v1/bitrix-hr-days-spell`

## 2) Secrets в Supabase

Добавьте secrets:

- `BITRIX_WEBHOOK_URL`
  - входящий webhook Bitrix (базовый), например:
  - `https://<your-domain>.bitrix24.kz/rest/<user_id>/<webhook_code>`
- `BITRIX_OUTGOING_TOKEN`
  - любой длинный секрет, тот же укажете в исходящем webhook Bitrix
- `BITRIX_HR_ENTITY_TYPE_ID=1050` (опционально)
- `BITRIX_HR_DAYS_NUMBER_FIELD=ufCrm10_1772124949853` (опционально)
- `BITRIX_HR_DAYS_WORDS_FIELD=ufCrm10_1772131937986` (опционально)

## 3) Настройка исходящего webhook в Bitrix24

Рекомендуемый payload (JSON):

```json
{
  "token": "YOUR_SECRET_TOKEN",
  "document_id": "{{DOCUMENT_ID}}",
  "itemId": "{{ID}}",
  "entityTypeId": "1050",
  "days": "{{UfCrm101772124949853}}"
}
```

Endpoint:

`https://<project-ref>.supabase.co/functions/v1/bitrix-hr-days-spell?token=YOUR_SECRET_TOKEN`

Достаточно передавать `document_id` или `itemId`.  
Если `days` не передан, функция сама прочитает число из Bitrix по `crm.item.get`.

Важно по Supabase Function:

- В `Function configuration` выключите `Verify JWT with legacy secret` (OFF), иначе Bitrix webhook получит `401`.

Важно по токену:

- Либо передайте `?token=...` в URL webhook.
- Либо задайте `BITRIX_OUTGOING_TOKEN` равным `Токен приложения` из Bitrix исходящего webhook (функция поддерживает `auth[application_token]`).

## 4) Что делает функция

1. Проверяет токен.
2. Проверяет, что элемент из `entityTypeId=1050`.
3. Читает число дней отпуска.
4. Преобразует число в русскую пропись (например `21 -> "двадцать один"`).
5. Обновляет поле `UfCrm101772131937986` через `crm.item.update`.

## 5) Быстрая проверка

1. В HR элементе поменяйте `Кол-во дней отпуска`.
2. Сработает исходящий webhook.
3. Проверьте, что `Кол-во дней отпуска прописью` заполнилось автоматически.

## Что нужно предоставить (если потребуется помощь с подключением)

- `project-ref` Supabase
- значение `BITRIX_WEBHOOK_URL` (можно частично скрыть код)
- скрин настройки исходящего webhook (URL + payload)
- пример элемента HR (ID) где тестировали
