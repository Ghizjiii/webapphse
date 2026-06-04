# Bitrix24 -> Supabase: дни отпуска и должность в родительном падеже

Эта Edge Function для HR smart process `entityTypeId=1050` выполняет два независимых сценария в одном webhook:

- считает календарные дни включительно по полям `Дата начала` и `Дата завершения`;
- записывает результат в `Кол-во дней` и `Кол-во дней прописью`;
- берёт поле `Должность` (`UF_CRM_10_1772992837`);
- переводит его в родительный падеж;
- записывает результат в `Должность род. падеже. (тех поле.)` (`UF_CRM_10_1771778817`).

Если в карточке заполнены только даты, обновятся только поля по дням.
Если заполнена только должность, обновится только поле родительного падежа.

## 1. Деплой Edge Function

```bash
supabase functions deploy bitrix-hr-days-spell
```

URL будет вида:
`https://<project-ref>.supabase.co/functions/v1/bitrix-hr-days-spell`

## 2. Secrets в Supabase

Обязательные:

- `ALLOWED_ORIGIN`
- `BITRIX_WEBHOOK_URL`
- `BITRIX_OUTGOING_TOKEN`

Опциональные overrides:

- `BITRIX_HR_ENTITY_TYPE_ID=1050`
- `BITRIX_HR_START_DATE_FIELD=ufCrm10_1771778909`
- `BITRIX_HR_END_DATE_FIELD=ufCrm10_1771778942`
- `BITRIX_HR_DAYS_NUMBER_FIELD=ufCrm10_1772124949853`
- `BITRIX_HR_DAYS_WORDS_FIELD=ufCrm10_1772131937986`
- `BITRIX_HR_POSITION_FIELD=ufCrm10_1772992837`
- `BITRIX_HR_POSITION_GENITIVE_FIELD=ufCrm10_1771778817`
- `BITRIX_HR_EXTERNAL_EMPLOYEE_DATIVE_FIELD=ufCrm10_1776360538300`
- `MORPHER_API_TOKEN` — опционально, если нужен авторизованный доступ к Morpher

## 3. Настройка исходящего webhook в Bitrix24

Достаточно передавать `document_id` или `itemId`. Функция сама дочитает поля через `crm.item.get`.

Рекомендуемый payload:

```json
{
  "token": "YOUR_SECRET_TOKEN",
  "document_id": "{{DOCUMENT_ID}}",
  "itemId": "{{ID}}",
  "entityTypeId": "1050"
}
```

Endpoint:

`https://<project-ref>.supabase.co/functions/v1/bitrix-hr-days-spell?token=YOUR_SECRET_TOKEN`

## 4. Что делает функция

1. Проверяет токен исходящего webhook.
2. Проверяет, что элемент относится к `entityTypeId=1050`.
3. Забирает карточку из Bitrix через `crm.item.get`.
4. Если есть обе даты, пересчитывает количество дней и текст прописью.
5. Если заполнена должность, запрашивает родительный падеж у Morpher.
6. Обновляет только те поля, значения которых реально изменились.

## 5. Быстрая проверка

1. В HR-элементе измените даты отпуска и убедитесь, что обновились поля дней.
2. Заполните поле `Должность` и убедитесь, что заполнилось поле родительного падежа.
3. Если используете Morpher с токеном, проверьте, что `MORPHER_API_TOKEN` добавлен в secrets.
