# Google Apps Script setup for protocol generation

Этот сценарий нужен отдельно от текущего `generate-document` для удостоверений и сертификатов.

Он работает так:
- фронтенд собирает строки протокола из записей `1056`
- Supabase Edge Function `generate-protocol-document` отправляет в GAS:
  - `templateKey`
  - `templateName`
  - `fileName`
  - общие `placeholders`
  - `items[]` со строками таблицы
- GAS делает копию нужного шаблона из папки `TEMPLATES/Протоколы`
- GAS заменяет общие плейсхолдеры
- GAS находит строку таблицы с `{{AUTO_N}}` и размножает ее под всех сотрудников

## 1. Что нужно подготовить

1. Папка Google Drive для готовых протоколов.
2. Папка `TEMPLATES/Протоколы` с 14 шаблонами Google Docs.
3. Новый проект Google Apps Script.
4. Новый деплой Web App именно для протоколов.

## 2. Supabase secrets

Добавьте в Supabase Edge Function secrets:

```text
GOOGLE_APPS_SCRIPT_PROTOCOL_URL=https://script.google.com/macros/s/.../exec
GOOGLE_APPS_SCRIPT_PROTOCOL_TOKEN=CHANGE_ME
ALLOWED_ORIGIN=http://localhost:5173,https://your-domain
```

Если хотите держать отдельный токен для протоколов, используйте именно `GOOGLE_APPS_SCRIPT_PROTOCOL_TOKEN`.

## 3. Deploy edge function

```bash
supabase functions deploy generate-protocol-document
```

## 4. Template keys

```javascript
const TEMPLATES = {
  tpl_protocol_01_bot_itr: '1ERkKsotwhNZ3c9AlBOkTXILeTFqeRX4N3ge76Wwk_ko',
  tpl_protocol_02_bot_worker: '1m82zjyg0b6I9Mo1BJ4lyvWdolObiR72TZ9Lyegwh2b4',
  tpl_protocol_03_fire_itr: '1AO5PQ3pQfar91y4J10pzrgfbgBYFrILNVQUmd7WnWSU',
  tpl_protocol_04_fire_worker: '1zrgYajd6K_iqnPQJ7QuExnvysIsOmLXCbQAAqcJ-OPs',
  tpl_protocol_05_industrial_itr: '1BnsOlWYLp_wGfQtDvdFnPlXAYqGfVMX-_t_A_iyvgjo',
  tpl_protocol_06_industrial_worker: '10PmBKQ2gfO7nvvupsQOEIuZoaqweY-33BFgImRIR--M',
  tpl_protocol_07_qualification_itr: '1jqKZyGaW3lWPh0D1UgpK3ZeZUFrXLBtreztjYwSNo7w',
  tpl_protocol_08_qualification_worker: '1zAgVlT8P8MDo1ynhw39TjquNHylxlFht9SgEJw_l-lI',
  tpl_protocol_09_pressure_itr: '1bkicFLPapUIadBxIUv62cFrJ1To9sOJWsJ0O-y0N11I',
  tpl_protocol_10_pressure_worker: '1L6i_N6Fn_j4soNl3lNV1dhV2aKUvmjHRzRbWMdqEN54',
  tpl_protocol_11_height_itr: '1HkY3AUMaRvu98YbuT3E4E1tsfubdQgG2WCmZRX0p9cM',
  tpl_protocol_12_height_worker: '1o5T-nOakkxuJhFtHQNTck7YSMb3-N5lvQ1oOOJOP0aU',
  tpl_protocol_13_responsible_lifting_itr: '1rtOBSojX7lo_FqDS-e4xgIIzl-RzhiufZTVSdMhCVDA',
  tpl_protocol_14_lifting_mechanisms: '1ABquVQqxkbGKfcCZgdKYlE6ohIIloRRRXxgiYKLpsiE',
};
```

## 5. Требование к шаблонам

В каждом шаблоне должна быть хотя бы одна строка таблицы, в которой есть `{{AUTO_N}}`.

Эта строка будет считаться шаблонной строкой сотрудника.  
Все плейсхолдеры внутри нее должны быть без индексов:

```text
{{AUTO_N}}
{{LAST_NAME}}
{{NAME}}
{{SEC_NAME}}
{{POS}}
{{CATEGORY}}
{{DOC_NUM}}
{{PROTOCOL_NUM}}
{{PROTOCOL_DATE}}
{{COURSE_START}}
{{DOC_VALID}}
{{MARKER_PASS}}
{{TYPE_LEARN}}
{{COMMIS_CONCL}}
{{GRADE}}
{{QUALIFICATION}}
{{LEVEL}}
{{CHAIRMAN}}
{{COMMISSION_MEMB_1}}
{{COMMISSION_MEMB_2}}
{{COMMISSION_MEMB_3}}
{{COMMISSION_MEMB_4}}
{{COMMISSION_ALL}}
{{MANAGER}}
{{HEAD}}
{{WORK_PLACE}}
```

## 6. Code.gs

```javascript
const SHARED_TOKEN = 'CHANGE_ME';
const OUTPUT_FOLDER_ID = 'PUT_OUTPUT_FOLDER_ID';

const TEMPLATES = {
  tpl_protocol_01_bot_itr: '1ERkKsotwhNZ3c9AlBOkTXILeTFqeRX4N3ge76Wwk_ko',
  tpl_protocol_02_bot_worker: '1m82zjyg0b6I9Mo1BJ4lyvWdolObiR72TZ9Lyegwh2b4',
  tpl_protocol_03_fire_itr: '1AO5PQ3pQfar91y4J10pzrgfbgBYFrILNVQUmd7WnWSU',
  tpl_protocol_04_fire_worker: '1zrgYajd6K_iqnPQJ7QuExnvysIsOmLXCbQAAqcJ-OPs',
  tpl_protocol_05_industrial_itr: '1BnsOlWYLp_wGfQtDvdFnPlXAYqGfVMX-_t_A_iyvgjo',
  tpl_protocol_06_industrial_worker: '10PmBKQ2gfO7nvvupsQOEIuZoaqweY-33BFgImRIR--M',
  tpl_protocol_07_qualification_itr: '1jqKZyGaW3lWPh0D1UgpK3ZeZUFrXLBtreztjYwSNo7w',
  tpl_protocol_08_qualification_worker: '1zAgVlT8P8MDo1ynhw39TjquNHylxlFht9SgEJw_l-lI',
  tpl_protocol_09_pressure_itr: '1bkicFLPapUIadBxIUv62cFrJ1To9sOJWsJ0O-y0N11I',
  tpl_protocol_10_pressure_worker: '1L6i_N6Fn_j4soNl3lNV1dhV2aKUvmjHRzRbWMdqEN54',
  tpl_protocol_11_height_itr: '1HkY3AUMaRvu98YbuT3E4E1tsfubdQgG2WCmZRX0p9cM',
  tpl_protocol_12_height_worker: '1o5T-nOakkxuJhFtHQNTck7YSMb3-N5lvQ1oOOJOP0aU',
  tpl_protocol_13_responsible_lifting_itr: '1rtOBSojX7lo_FqDS-e4xgIIzl-RzhiufZTVSdMhCVDA',
  tpl_protocol_14_lifting_mechanisms: '1ABquVQqxkbGKfcCZgdKYlE6ohIIloRRRXxgiYKLpsiE',
};

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SHARED_TOKEN && body.token !== SHARED_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const templateId = TEMPLATES[String(body.templateKey || '')];
    if (!templateId) return json({ error: 'Unknown templateKey' }, 400);

    const outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const copy = templateFile.makeCopy(body.fileName || 'Protocol', outputFolder);

    const doc = DocumentApp.openById(copy.getId());
    const docBody = doc.getBody();

    const globalValues = normalizeMap(body.placeholders || {});
    replaceAllBodyTokens(docBody, globalValues);

    const items = Array.isArray(body.items) ? body.items : [];
    fillProtocolTables(docBody, items);

    const unresolvedTokens = findUnresolvedTokens(docBody);
    doc.saveAndClose();

    return json({
      ok: true,
      fileId: copy.getId(),
      fileName: copy.getName(),
      fileUrl: 'https://docs.google.com/document/d/' + copy.getId() + '/edit',
      unresolvedCount: unresolvedTokens.length,
      unresolvedTokens: unresolvedTokens.slice(0, 100),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

function fillProtocolTables(body, items) {
  const tables = getAllTables(body);
  if (!tables.length) return;

  for (let t = 0; t < tables.length; t++) {
    const table = tables[t];
    const templateRowIndex = findTemplateRowIndex(table);
    if (templateRowIndex < 0) continue;

    const templateRow = table.getRow(templateRowIndex).copy();

    while (table.getNumRows() > templateRowIndex && rowHasToken(table.getRow(templateRowIndex))) {
      table.removeRow(templateRowIndex);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const row = templateRow.copy();
      replaceTokensInElement(row, normalizeMap(item.placeholders || {}));
      table.insertTableRow(templateRowIndex + i, row);
    }
  }
}

function findTemplateRowIndex(table) {
  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex++) {
    const row = table.getRow(rowIndex);
    if (!rowHasToken(row)) continue;
    const text = row.getText();
    if (text.indexOf('{{AUTO_N}}') >= 0) return rowIndex;
  }

  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex++) {
    if (rowHasToken(table.getRow(rowIndex))) return rowIndex;
  }

  return -1;
}

function rowHasToken(row) {
  return /\{\{[^}]+\}\}/.test(row.getText());
}

function replaceAllBodyTokens(body, values) {
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    body.replaceText(escapeRegex(key), values[key]);
  }
}

function replaceTokensInElement(element, values) {
  const type = element.getType();

  if (type === DocumentApp.ElementType.TEXT) {
    const text = element.asText();
    const keys = Object.keys(values);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      text.replaceText(escapeRegex(key), values[key]);
    }
    return;
  }

  if (element.getNumChildren) {
    for (let i = 0; i < element.getNumChildren(); i++) {
      replaceTokensInElement(element.getChild(i), values);
    }
  }
}

function findUnresolvedTokens(body) {
  const out = [];
  const text = body.getText() || '';
  const matches = text.match(/\{\{[^}]+\}\}/g) || [];
  const map = {};
  for (let i = 0; i < matches.length; i++) {
    const token = matches[i];
    if (map[token]) continue;
    map[token] = true;
    out.push(token);
  }
  return out;
}

function getAllTables(body) {
  const tables = [];
  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.TABLE) {
      tables.push(child.asTable());
    }
  }
  return tables;
}

function normalizeMap(raw) {
  const out = {};
  const keys = Object.keys(raw || {});
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = String(raw[key] == null ? '' : raw[key]);
    out[key] = value;
    const bare = key.replace(/^\{\{/, '').replace(/\}\}$/, '');
    out['{{' + bare + '}}'] = value;
  }
  return out;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function json(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
```

## 7. appsscript.json scopes

Если Apps Script попросит права, оставьте как минимум:

```json
{
  "timeZone": "Asia/Almaty",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

## 8. Что проверить после deploy

1. Вкладка `Протоколы` появилась в анкете.
2. Строки протоколов собираются автоматически по курсам и категории.
3. У каждой строки заполнены:
   - `Номер протокола`
   - `Дата протокола`
4. Кнопка `Сгенерировать протоколы` создает Google Doc.
5. В таблице появляется ссылка на файл.
6. Кнопка `Обновить данные в Bitrix` создает или обновляет элемент `1070`.

## 9. Что этот сценарий не делает

Сейчас он:
- генерирует Google Doc
- возвращает ссылку в веб-приложение
- не загружает сам файл в поле `Файл протокола` Bitrix24

Если захотите, следующий шаг можно сделать отдельным:
- экспорт PDF из GAS
- загрузка PDF прямо в поле `UF_CRM_16_1773817317`
- автоматическая отметка `Документ напечатан`
