export interface QuestionnaireLink {
  id: string;
  secret_token: string;
  title: string;
  request_type?: QuestionnaireRequestType | null;
  request_number: number | null;
  region_bitrix_item_id: string;
  region_name: string;
  is_active: boolean;
  payment_order_optional: boolean;
  is_general_contractor?: boolean;
  object_name?: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_previous_is_active?: boolean | null;
  bitrix_deal_deleted_at?: string | null;
  bitrix_deal_delete_error?: string | null;
  status: 'active' | 'submitted' | 'archived' | 'synced' | 'expired';
  workflow_status?: QuestionnaireWorkflowStatus;
  accepted_at?: string | null;
  accepted_by?: string | null;
  processing_started_at?: string | null;
  processing_started_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  current_stage_started_at?: string | null;
  sla_due_at?: string | null;
  is_overdue?: boolean;
  overdue_at?: string | null;
  completed_in_time?: boolean | null;
  total_processing_seconds?: number | null;
}

export type QuestionnaireRequestType = 'external' | 'internal';

export type QuestionnaireWorkflowStatus =
  | 'awaiting_submission'
  | 'submitted'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'archived';

export type QuestionnaireWorkflowEventType =
  | 'submitted'
  | 'accepted'
  | 'processing_started'
  | 'processing_owner_changed'
  | 'completed'
  | 'overdue'
  | 'archived';

export interface QuestionnaireEvent {
  id: string;
  questionnaire_id: string;
  event_type: QuestionnaireWorkflowEventType | string;
  from_status: QuestionnaireWorkflowStatus | string | null;
  to_status: QuestionnaireWorkflowStatus | string | null;
  occurred_at: string;
  actor_user_id: string | null;
  is_overdue: boolean;
  deadline_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CommentAttachment {
  id?: string;
  name: string;
  url: string;
  storage_bucket?: string;
  storage_path?: string;
  size?: number;
  content_type?: string;
  uploaded_at?: string;
}

export interface Company {
  id: string;
  questionnaire_id: string;
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
  tax_id: string;
  address: string;
  city: string;
  comments?: string;
  comment_attachments?: CommentAttachment[];
  bitrix_company_id: string;
  source_ref_company_id?: string | null;
  has_contract?: boolean;
  contract_bitrix_id?: string;
  contract_title?: string;
  contract_number?: string;
  contract_date?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  contract_status?: string;
  contract_is_active?: boolean;
  no_contract_confirmed?: boolean;
  payment_order_url?: string;
  payment_order_name?: string;
  payment_order_uploaded_at?: string | null;
  payment_order_number?: string;
  payment_order_date?: string | null;
  payment_order_amount?: number | null;
  payment_order_storage_bucket?: string;
  payment_order_storage_path?: string;
  payment_is_paid?: boolean;
  created_at: string;
  updated_at: string;
}

export interface RefCompanyDirectory {
  id: string;
  bitrix_company_id: string;
  name: string;
  bin_iin: string;
  bin_iin_digits: string;
  phone: string;
  email: string;
  city: string;
  has_contract: boolean;
  contract_count: number;
  contract_bitrix_id: string;
  contract_title: string;
  contract_number: string;
  contract_date: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_status: string;
  contract_is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DocumentDurationUnit = 'day' | 'month' | 'year';

export interface RefDocumentValidityRule {
  id: string;
  course_name: string;
  category: string;
  document_type: string;
  duration_value: number;
  duration_unit: DocumentDurationUnit;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RefCoursePrice {
  id: string;
  bitrix_item_id: string;
  full_name: string;
  name: string;
  course_name: string;
  qualification: string;
  electrical_safety_group: string;
  category: string;
  price: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RefBitrixListItem {
  id: string;
  list_key: string;
  list_name: string;
  iblock_id: number;
  bitrix_item_id: string;
  name: string;
  bitrix_value: string;
  code: string;
  sort_order: number;
  details_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ReferenceSyncStatus {
  scope: string;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_source: string;
  last_event: string;
  last_status: 'idle' | 'running' | 'success' | 'error';
  last_error: string;
  stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type AppRole = 'admin' | 'coordinator' | 'department_head' | 'user';

export type QuestionnaireAccessScope = 'own' | 'all';

export interface AppProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  region_bitrix_item_id: string | null;
  region_name: string | null;
  questionnaire_access: QuestionnaireAccessScope;
  bitrix_user_id: string | null;
  bitrix_user_name: string | null;
  registered_at: string;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BitrixEmployee {
  bitrix_user_id: string;
  email: string;
  full_name: string;
  active: boolean;
  work_position: string | null;
  department_ids: unknown;
  raw_payload: unknown;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  questionnaire_id: string;
  company_id: string | null;
  deal_title: string;
  bitrix_deal_id: string;
  bitrix_company_id: string;
  deal_url: string;
  sync_status: 'pending' | 'in_progress' | 'success' | 'error';
  error_message: string;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  questionnaire_id: string | null;
  company_id: string | null;
  full_name: string;
  last_name: string;
  first_name: string;
  patronymic: string;
  email: string;
  position: string;
  category: string;
  photo_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  courses?: ParticipantCourse[];
}

export interface ParticipantCourse {
  id?: string;
  participant_id: string;
  questionnaire_id: string | null;
  course_name: string;
  course_id?: string;
  previous_electrical_safety_group?: string;
}

export interface Certificate {
  id: string;
  questionnaire_id: string | null;
  deal_id: string | null;
  company_id: string | null;
  participant_id: string | null;
  course_id: string | null;
  bitrix_item_id: string;
  full_name: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  position: string;
  category: string;
  course_name: string;
  start_date: string | null;
  expiry_date: string | null;
  issuer_company: string;
  commission_chair: string;
  protocol_number: string;
  document_number: string;
  commission_member_1: string;
  commission_member_2: string;
  commission_member_3: string;
  commission_member_4: string;
  commission_members: string;
  commission_members_protocol: string;
  electrical_safety_admission_protocol: string;
  qualification: string;
  electrical_safety_group: string;
  previous_electrical_safety_group: string;
  level: string;
  marker_pass: string;
  type_learn: string;
  commis_concl: string;
  grade: string;
  manager: string;
  is_printed: boolean;
  employee_status: string;
  price: number | null;
  document_url: string;
  sync_status: 'pending' | 'synced' | 'error';
  sync_error: string;
  created_at: string;
  updated_at: string;
}

export type ProtocolCategoryScope = 'itr' | 'worker' | 'all';

export interface Protocol {
  id: string;
  questionnaire_id: string;
  deal_id: string | null;
  company_id: string | null;
  bitrix_item_id: string;
  template_key: string;
  template_name: string;
  course_name: string;
  category_scope: ProtocolCategoryScope;
  category_label: string;
  protocol_number: string;
  protocol_date: string | null;
  employees_count: number;
  file_id: string;
  file_name: string;
  file_url: string;
  is_printed: boolean;
  generated_at: string | null;
  sync_status: 'pending' | 'synced' | 'error';
  sync_error: string;
  created_at: string;
  updated_at: string;
  group_key: string;
  is_draft?: boolean;
}

export interface RefProtocolNumeratorSetting {
  id: string;
  course_name: string;
  category_scope: ProtocolCategoryScope;
  start_number: number;
  created_at: string;
  updated_at: string;
}

export type GeneratedDocumentType = 'certificate' | 'id_card';

export interface GeneratedDocument {
  id: string;
  questionnaire_id: string;
  certificate_id: string | null;
  company_id: string | null;
  participant_id: string | null;
  deal_id: string | null;
  bitrix_item_id: string | null;
  doc_type: GeneratedDocumentType;
  template_name: string;
  file_name: string;
  file_url: string;
  course_name?: string | null;
  category?: string | null;
  employees_count?: number | null;
  generated_at: string;
  generated_by: string | null;
  created_at: string;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface BitrixSyncProgress {
  step: string;
  current: number;
  total: number;
  status: 'idle' | 'running' | 'done' | 'error';
  error?: string;
}
