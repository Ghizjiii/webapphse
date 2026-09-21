CREATE OR REPLACE FUNCTION public.audit_questionnaire_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  questionnaire_uuid uuid;
  actor_uuid uuid := auth.uid();
  actor_name text;
  old_data jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  changes jsonb := '{}'::jsonb;
  field_name text;
  event_name text;
  entity_label text;
  ignored_fields text[] := ARRAY[
    'created_at', 'updated_at', 'secret_token',
    'payment_ocr_original', 'payment_final_data', 'comment_attachments',
    'photo_url', 'payment_order_url', 'document_url', 'file_url', 'deal_url',
    'workflow_status', 'accepted_at', 'accepted_by',
    'processing_started_at', 'processing_started_by',
    'completed_at', 'completed_by', 'current_stage_started_at',
    'sla_due_at', 'is_overdue', 'overdue_at', 'completed_in_time',
    'total_processing_seconds', 'submitted_at'
  ];
BEGIN
  questionnaire_uuid := CASE
    WHEN TG_TABLE_NAME = 'questionnaires' AND TG_OP = 'DELETE' THEN OLD.id
    WHEN TG_TABLE_NAME = 'questionnaires' THEN NEW.id
    WHEN TG_OP = 'DELETE' THEN OLD.questionnaire_id
    ELSE NEW.questionnaire_id
  END;

  IF questionnaire_uuid IS NULL AND TG_TABLE_NAME = 'participant_courses' THEN
    SELECT participant.questionnaire_id
      INTO questionnaire_uuid
      FROM public.participants participant
     WHERE participant.id = NULLIF(COALESCE(new_data ->> 'participant_id', old_data ->> 'participant_id'), '')::uuid;
  END IF;

  IF questionnaire_uuid IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF actor_uuid IS NOT NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(profile.full_name), ''), NULLIF(BTRIM(profile.email), ''))
      INTO actor_name
      FROM public.app_profiles profile
     WHERE profile.user_id = actor_uuid;
  END IF;
  actor_name := COALESCE(actor_name, CASE WHEN auth.role() = 'anon' THEN 'Клиент' ELSE 'Система' END);

  IF TG_OP = 'UPDATE' THEN
    FOR field_name IN SELECT jsonb_object_keys(new_data)
    LOOP
      IF NOT field_name = ANY(ignored_fields)
        AND old_data -> field_name IS DISTINCT FROM new_data -> field_name
      THEN
        changes := changes || jsonb_build_object(
          field_name,
          jsonb_build_object('from', old_data -> field_name, 'to', new_data -> field_name)
        );
      END IF;
    END LOOP;

    IF changes = '{}'::jsonb THEN RETURN NEW; END IF;
  END IF;

  entity_label := CASE TG_TABLE_NAME
    WHEN 'questionnaires' THEN 'Заявка'
    WHEN 'companies' THEN 'Компания и оплата'
    WHEN 'participants' THEN 'Участник'
    WHEN 'participant_courses' THEN 'Курс участника'
    WHEN 'certificates' THEN 'Удостоверение / сертификат'
    WHEN 'protocols' THEN 'Протокол'
    WHEN 'generated_documents' THEN 'Сформированный документ'
    WHEN 'deals' THEN 'Синхронизация Bitrix24'
    WHEN 'payment_order_registry' THEN 'Платежное поручение'
    ELSE TG_TABLE_NAME
  END;

  event_name := CASE
    WHEN TG_TABLE_NAME = 'deals' THEN 'bitrix_sync_changed'
    WHEN TG_TABLE_NAME IN ('companies', 'payment_order_registry') THEN 'payment_or_company_changed'
    WHEN TG_OP = 'INSERT' THEN 'entity_created'
    WHEN TG_OP = 'DELETE' THEN 'entity_deleted'
    ELSE 'data_updated'
  END;

  INSERT INTO public.questionnaire_events (
    questionnaire_id,
    event_type,
    actor_user_id,
    metadata
  ) VALUES (
    questionnaire_uuid,
    event_name,
    actor_uuid,
    jsonb_build_object(
      'entity', TG_TABLE_NAME,
      'entity_label', entity_label,
      'entity_id', COALESCE(new_data ->> 'id', old_data ->> 'id', ''),
      'operation', LOWER(TG_OP),
      'actor_name', actor_name,
      'changes', changes
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  audited_table text;
BEGIN
  FOREACH audited_table IN ARRAY ARRAY[
    'questionnaires',
    'companies',
    'participants',
    'participant_courses',
    'certificates',
    'protocols',
    'generated_documents',
    'deals',
    'payment_order_registry'
  ]
  LOOP
    IF to_regclass('public.' || audited_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_questionnaire_change ON public.%I', audited_table);
      EXECUTE format(
        'CREATE TRIGGER audit_questionnaire_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_questionnaire_change()',
        audited_table
      );
    END IF;
  END LOOP;
END;
$$;
