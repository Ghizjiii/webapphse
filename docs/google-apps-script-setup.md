# Google Apps Script setup (course-based generation)

This setup matches your templates and field dictionary:
- ID templates: placeholders with `_1.._4` (4 employees per document copy)
- Certificate template (`tpl_01_bot_itr_certificate`): one employee per page

## 1) Create Apps Script project

1. Open `https://script.google.com`.
2. Create new project.
3. Put script below into `Code.gs`.
4. Configure:
  - `SHARED_TOKEN`
  - `OUTPUT_FOLDER_ID`
  - `TEMPLATES` (Google Docs template IDs)

## 2) Deploy as Web App

1. `Deploy` -> `New deployment` -> `Web app`
2. Execute as: `Me`
3. Access: `Anyone` (or domain users)
4. Save `/exec` URL

## 3) Supabase secrets

- `GOOGLE_APPS_SCRIPT_URL=<web-app-exec-url>`
- `GOOGLE_APPS_SCRIPT_TOKEN=<same-as-SHARED_TOKEN>`
- `ALLOWED_ORIGIN=<frontend-origin-list-separated-by-comma>`

## 4) Deploy edge function

```bash
supabase functions deploy generate-document
```

## 5) Code.gs

```javascript
const SHARED_TOKEN = 'CHANGE_ME';
const OUTPUT_FOLDER_ID = 'PUT_OUTPUT_FOLDER_ID';
const PHOTO_WIDTH_POINTS = 85;   // ~3 cm
const PHOTO_HEIGHT_POINTS = 113; // ~4 cm

const TEMPLATES = {
  tpl_01_bot_itr_certificate: 'DOC_ID_01',
  tpl_02_bot_worker_id: 'DOC_ID_02',
  tpl_03_fire_tech_minimum: 'DOC_ID_03',
  tpl_04_industrial_safety: 'DOC_ID_04',
  tpl_05_qualification_id: 'DOC_ID_05',
  tpl_06_pressure_vessels: 'DOC_ID_06',
  tpl_07_work_at_height: 'DOC_ID_07',
  tpl_08_responsible_lifting: 'DOC_ID_08',
  tpl_09_lifting_mechanisms: 'DOC_ID_09',
};

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SHARED_TOKEN && body.token !== SHARED_TOKEN) return json({ error: 'Unauthorized' });

    const templateId = TEMPLATES[body.templateKey];
    if (!templateId) return json({ error: 'Unknown templateKey' });

    const outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const copy = templateFile.makeCopy(body.fileName || 'HSE Document', outputFolder);
    const doc = DocumentApp.openById(copy.getId());
    const targetBody = doc.getBody();

    const templateBody = DocumentApp.openById(templateId).getBody();
    const docType = String(body.docType || '');
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length > 0) {
      if (docType === 'certificate') {
        fillCertificateDocument(targetBody, templateBody, items);
      } else {
        fillIdCardDocument(targetBody, templateBody, items);
      }
    } else {
      // fallback for old single payload
      const one = {
        placeholders: body.placeholders || {},
        photoUrl: body.photoUrl || '',
      };
      if (docType === 'certificate') fillCertificatePage(targetBody, one);
      else fillIdCardBatch(targetBody, [one]);
    }

    const unresolvedTokens = findUnresolvedTokens(targetBody);
    doc.saveAndClose();
    return json({
      ok: true,
      fileId: copy.getId(),
      fileName: copy.getName(),
      fileUrl: `https://docs.google.com/document/d/${copy.getId()}/edit`,
      unresolvedCount: unresolvedTokens.length,
      unresolvedTokens: unresolvedTokens.slice(0, 100),
    });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function fillIdCardDocument(targetBody, templateBody, items) {
  const batches = chunk(items, 4);

  // first template copy already exists in target document
  fillIdCardBatch(targetBody, batches[0] || []);

  for (let i = 1; i < batches.length; i++) {
    targetBody.appendPageBreak();
    appendTemplateBody(targetBody, templateBody);
    fillIdCardBatch(targetBody, batches[i]);
  }
}

function fillCertificateDocument(targetBody, templateBody, items) {
  // first template copy already exists in target document
  fillCertificatePage(targetBody, items[0] || {});

  for (let i = 1; i < items.length; i++) {
    targetBody.appendPageBreak();
    appendTemplateBody(targetBody, templateBody);
    fillCertificatePage(targetBody, items[i]);
  }
}

function fillIdCardBatch(body, batch) {
  for (let slot = 1; slot <= 4; slot++) {
    const item = batch[slot - 1];
    if (!item) {
      clearIdCardSlot(body, slot);
      continue;
    }

    const p = normalizePlaceholders(item.placeholders || {});
    const values = buildCommonValues(p);

    replaceToken(body, `LAST_NAME_${slot}`, values.LAST_NAME);
    replaceToken(body, `NAME_${slot}`, values.NAME);
    replaceToken(body, `SEC_NAME_${slot}`, values.SEC_NAME);
    replaceToken(body, `POS_${slot}`, values.POS);
    replaceToken(body, `WORK_PLACE_${slot}`, values.WORK_PLACE);
    replaceToken(body, `CATEGORY_${slot}`, values.CATEGORY);
    replaceToken(body, `COURSE_NAME_${slot}`, values.COURSE_NAME);
    replaceToken(body, `DOC_NUM_${slot}`, values.DOC_NUM);
    replaceToken(body, `CERT_NUM_${slot}`, values.DOC_NUM);
    replaceToken(body, `PROTOCOL_NUM_${slot}`, values.PROTOCOL_NUM);
    replaceToken(body, `PROTOCOL_${slot}`, values.PROTOCOL_NUM);
    replaceToken(body, `CHAIRMAN_${slot}`, values.CHAIRMAN);
    replaceToken(body, `COURSE_START_${slot}`, values.COURSE_START);
    replaceToken(body, `DOC_VALID_${slot}`, values.DOC_VALID);
    replaceToken(body, `DATE_${slot}`, values.COURSE_START);
    replaceToken(body, `DATE_END_${slot}`, values.DOC_VALID);
    replaceToken(body, `QUALIFICATION_${slot}`, values.QUALIFICATION);
    replaceToken(body, `HEAD_${slot}`, values.HEAD);
    replaceToken(body, `COMMISSION_ALL_${slot}`, values.COMMISSION_ALL);

    replaceToken(body, `COMMISSION_MEMB_${slot}_1`, values.COMMISSION_MEMB_1);
    replaceToken(body, `COMMISSION_MEMB_${slot}_2`, values.COMMISSION_MEMB_2);
    replaceToken(body, `COMMISSION_MEMB_${slot}_3`, values.COMMISSION_MEMB_3);
    replaceToken(body, `COMMISSION_MEMB_${slot}_4`, values.COMMISSION_MEMB_4);

    fillPhoto(body, `PHOTO_${slot}`, item.photoUrl || '');
  }
}

function fillCertificatePage(body, item) {
  const p = normalizePlaceholders((item && item.placeholders) || {});
  const values = buildCommonValues(p);

  replaceToken(body, 'LAST_NAME', values.LAST_NAME);
  replaceToken(body, 'NAME', values.NAME);
  replaceToken(body, 'SEC_NAME', values.SEC_NAME);
  replaceToken(body, 'FIO', values.FIO || [values.LAST_NAME, values.NAME, values.SEC_NAME].filter(Boolean).join(' '));
  replaceToken(body, 'DOC_NUM', values.DOC_NUM);
  replaceToken(body, 'CERT_NUM', values.DOC_NUM);
  replaceToken(body, 'PROTOCOL_NUM', values.PROTOCOL_NUM);
  replaceToken(body, 'PROTOCOL', values.PROTOCOL_NUM);
  replaceToken(body, 'CHAIRMAN', values.CHAIRMAN);
  replaceToken(body, 'COURSE_START', values.COURSE_START);
  replaceToken(body, 'DATE', values.COURSE_START);
  replaceToken(body, 'DATE_END', values.DOC_VALID);
}

function clearIdCardSlot(body, slot) {
  const keys = [
    `{{LAST_NAME_${slot}}}`,
    `{{NAME_${slot}}}`,
    `{{SEC_NAME_${slot}}}`,
    `{{POS_${slot}}}`,
    `{{WORK_PLACE_${slot}}}`,
    `{{CATEGORY_${slot}}}`,
    `{{COURSE_NAME_${slot}}}`,
    `{{DOC_NUM_${slot}}}`,
    `{{CERT_NUM_${slot}}}`,
    `{{PROTOCOL_NUM_${slot}}}`,
    `{{PROTOCOL_${slot}}}`,
    `{{CHAIRMAN_${slot}}}`,
    `{{COURSE_START_${slot}}}`,
    `{{DOC_VALID_${slot}}}`,
    `{{DATE_${slot}}}`,
    `{{DATE_END_${slot}}}`,
    `{{QUALIFICATION_${slot}}}`,
    `{{HEAD_${slot}}}`,
    `{{COMMISSION_ALL_${slot}}}`,
    `{{COMMISSION_MEMB_${slot}_1}}`,
    `{{COMMISSION_MEMB_${slot}_2}}`,
    `{{COMMISSION_MEMB_${slot}_3}}`,
    `{{COMMISSION_MEMB_${slot}_4}}`,
    `{{PHOTO_${slot}}}`,
  ];
  keys.forEach(k => clearToken(body, k));
}

function appendTemplateBody(targetBody, templateBody) {
  const children = templateBody.getNumChildren();
  for (let i = 0; i < children; i++) {
    const element = templateBody.getChild(i);
    const type = element.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      targetBody.appendParagraph(element.asParagraph().copy());
    } else if (type === DocumentApp.ElementType.TABLE) {
      targetBody.appendTable(element.asTable().copy());
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      targetBody.appendListItem(element.asListItem().copy());
    } else if (type === DocumentApp.ElementType.HORIZONTAL_RULE) {
      targetBody.appendHorizontalRule();
    } else if (type === DocumentApp.ElementType.PAGE_BREAK) {
      targetBody.appendPageBreak();
    }
  }
}

function normalizePlaceholders(raw) {
  const out = {};
  Object.keys(raw || {}).forEach(k => {
    const v = String(raw[k] == null ? '' : raw[k]);
    out[k] = v;
    const noBraces = String(k).replace(/^\{\{/, '').replace(/\}\}$/, '');
    out[noBraces] = v;
  });
  return out;
}

function pick(map, keys) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = String(map[key] || '').trim();
    if (val) return val;
  }
  return '';
}

function buildCommonValues(p) {
  return {
    LAST_NAME: pick(p, ['LAST_NAME']),
    NAME: pick(p, ['NAME']),
    SEC_NAME: pick(p, ['SEC_NAME']),
    FIO: pick(p, ['FIO']),
    POS: pick(p, ['POS', 'POSITION']),
    WORK_PLACE: pick(p, ['WORK_PLACE', 'WORKPLACE']),
    CATEGORY: pick(p, ['CATEGORY']),
    COURSE_NAME: pick(p, ['COURSE_NAME', 'COURSE']),
    DOC_NUM: pick(p, ['DOC_NUM', 'CERT_NUM']),
    PROTOCOL_NUM: pick(p, ['PROTOCOL_NUM', 'PROTOCOL']),
    CHAIRMAN: pick(p, ['CHAIRMAN', 'COMMISSION_CHAIR']),
    COURSE_START: pick(p, ['COURSE_START', 'DATE', 'DATE_ISSUE']),
    DOC_VALID: pick(p, ['DOC_VALID', 'DATE_END']),
    QUALIFICATION: pick(p, ['QUALIFICATION']),
    HEAD: pick(p, ['HEAD', 'MANAGER']),
    COMMISSION_ALL: pick(p, ['COMMISSION_ALL', 'COMMISSION']),
    COMMISSION_MEMB_1: pick(p, ['COMMISSION_MEMB_1', 'COMMISSION_MEMBER_1']),
    COMMISSION_MEMB_2: pick(p, ['COMMISSION_MEMB_2', 'COMMISSION_MEMBER_2']),
    COMMISSION_MEMB_3: pick(p, ['COMMISSION_MEMB_3', 'COMMISSION_MEMBER_3']),
    COMMISSION_MEMB_4: pick(p, ['COMMISSION_MEMB_4', 'COMMISSION_MEMBER_4']),
  };
}

function replaceToken(body, token, value) {
  const normalized = normalizeToken(token);
  const text = String(value || '');
  body.replaceText(`\\{\\{\\s*${escapeRegex(normalized)}\\s*\\}\\}`, text);
  body.replaceText(`\\{\\s*${escapeRegex(normalized)}\\s*\\}`, text);
}

function clearToken(body, token) {
  const normalized = normalizeToken(token);
  body.replaceText(`\\{\\{\\s*${escapeRegex(normalized)}\\s*\\}\\}`, '');
  body.replaceText(`\\{\\s*${escapeRegex(normalized)}\\s*\\}`, '');
}

function normalizeToken(token) {
  return String(token || '')
    .replace(/^\{+/, '')
    .replace(/\}+$/, '')
    .trim();
}

function fillPhoto(body, token, photoUrl) {
  try {
    if (!photoUrl) {
      clearToken(body, token);
      return;
    }
    const normalized = normalizeToken(token);
    const found = body.findText(`\\{\\{?\\s*${escapeRegex(normalized)}\\s*\\}\\}?`);
    if (!found) return;

    const blob = UrlFetchApp.fetch(photoUrl, { muteHttpExceptions: true }).getBlob();
    const textEl = found.getElement().asText();
    textEl.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());

    const parent = textEl.getParent();
    let image;
    if (parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
      image = parent.asParagraph().insertInlineImage(0, blob);
    } else if (parent.getType() === DocumentApp.ElementType.TABLE_CELL) {
      image = parent.asTableCell().insertImage(0, blob);
    } else {
      image = body.appendParagraph('').insertInlineImage(0, blob);
    }

    image.setWidth(PHOTO_WIDTH_POINTS);
    image.setHeight(PHOTO_HEIGHT_POINTS);
  } catch (_e) {
    clearToken(body, token);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function findUnresolvedTokens(body) {
  const text = String(body.getText() || '');
  const matches = text.match(/\{\{[^{}]{1,80}\}\}|\{[^{}]{1,80}\}/g) || [];
  return Array.from(new Set(matches.map(s => s.trim()))).sort();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 6) Redeploy after changes

1. `Deploy` -> `Manage deployments`
2. Edit current Web App deployment
3. Deploy new version
4. If URL changed: update `GOOGLE_APPS_SCRIPT_URL` secret
