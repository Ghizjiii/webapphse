/*
  Store the issuer company on generated files so documents made from the same
  course and template remain distinguishable in the generated documents list.
*/

ALTER TABLE public.generated_documents
  ADD COLUMN IF NOT EXISTS issuer_company text NOT NULL DEFAULT '';

UPDATE public.generated_documents AS generated_document
SET issuer_company = COALESCE(certificate.issuer_company, '')
FROM public.certificates AS certificate
WHERE generated_document.certificate_id = certificate.id
  AND generated_document.issuer_company = '';

