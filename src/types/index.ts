export interface QuestionnaireLink {
  id: string;
  secret_token: string;
  title: string;
  is_active: boolean;
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
  manager: string;
  is_printed: boolean;
  employee_status: string;
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
