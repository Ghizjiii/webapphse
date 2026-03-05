# Google Apps Script setup for certificate generation

## 1) Create script project

1. Open `script.google.com` in your target Google account.
2. Create a new Apps Script project.
3. Paste script below into `Code.gs`.
4. Set template IDs in `TEMPLATES` and output folder in `OUTPUT_FOLDER_ID`.

## 2) Deploy as Web App

1. `Deploy` -> `New deployment` -> type `Web app`.
2. Execute as: `Me`.
3. Access: `Anyone` (or your domain users).
4. Save the deployment URL.

## 3) Add secrets in Supabase

Set Edge Function secrets:

- `GOOGLE_APPS_SCRIPT_URL=<your_web_app_url>`
- `GOOGLE_APPS_SCRIPT_TOKEN=<shared_secret>`
- `ALLOWED_ORIGIN=<your frontend origin>`

## 4) Deploy function

```bash
supabase functions deploy generate-document
```

## 5) SQL migration

Apply migration `supabase/migrations/20260305000100_add_generated_documents_table.sql`.

## 6) Minimal GAS script

```javascript
const SHARED_TOKEN = 'CHANGE_ME';
const OUTPUT_FOLDER_ID = 'PUT_OUTPUT_FOLDER_ID';
const TEMPLATES = {
  tpl_01_bot_itr_certificate: 'PUT_TEMPLATE_DOC_ID_01',
  tpl_02_bot_worker_id: 'PUT_TEMPLATE_DOC_ID_02',
  tpl_03_fire_tech_minimum: 'PUT_TEMPLATE_DOC_ID_03',
  tpl_04_industrial_safety: 'PUT_TEMPLATE_DOC_ID_04',
  tpl_05_qualification_id: 'PUT_TEMPLATE_DOC_ID_05',
  tpl_06_pressure_vessels: 'PUT_TEMPLATE_DOC_ID_06',
  tpl_07_work_at_height: 'PUT_TEMPLATE_DOC_ID_07',
  tpl_08_responsible_lifting: 'PUT_TEMPLATE_DOC_ID_08',
  tpl_09_lifting_mechanisms: 'PUT_TEMPLATE_DOC_ID_09',
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (SHARED_TOKEN && body.token !== SHARED_TOKEN) return json({ error: 'Unauthorized' }, 401);

    const templateId = TEMPLATES[body.templateKey];
    if (!templateId) return json({ error: 'Unknown templateKey' }, 400);

    const templateFile = DriveApp.getFileById(templateId);
    const outputFolder = DriveApp.getFolderById(OUTPUT_FOLDER_ID);
    const copy = templateFile.makeCopy(body.fileName || 'HSE Document', outputFolder);
    const doc = DocumentApp.openById(copy.getId());
    const text = doc.getBody().editAsText();

    const placeholders = body.placeholders || {};
    Object.keys(placeholders).forEach((key) => {
      text.replaceText(escapeRegex(key), String(placeholders[key] || ''));
    });

    doc.saveAndClose();
    return json({
      ok: true,
      fileId: copy.getId(),
      fileName: copy.getName(),
      fileUrl: `https://docs.google.com/document/d/${copy.getId()}/edit`,
    });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function json(obj, status) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
```
