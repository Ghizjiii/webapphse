export interface QuestionnaireLink {
  id: string;
  secret_token: string;
  title: string;
  is_active: boolean;
  payment_order_optional: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  status: 'active' | 'submitted' | 'archived' | 'synced' | 'expired';
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
  last_name: string;
  first_name: string;
  patronymic: string;
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
}

export interface Certificate {
  id: string;
  questionnaire_id: string | null;
  deal_id: string | null;
  company_id: string | null;
  participant_id: string | null;
  course_id: string | null;
  bitrix_item_id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  position: string;
  category: string;
  course_name: string;
  start_date: string | null;
  expiry_date: string | null;
  commission_chair: string;
  protocol_number: string;
  document_number: string;
  commission_member_1: string;
  commission_member_2: string;
  commission_member_3: string;
  commission_member_4: string;
  commission_members: string;
  qualification: string;
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
