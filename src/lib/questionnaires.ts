type QuestionnaireIdentity = {
  request_number?: number | null;
  title?: string | null;
  region_name?: string | null;
  request_type?: string | null;
};

export type QuestionnaireRequestType = 'external' | 'internal';

export const QUESTIONNAIRE_REQUEST_TYPE_LABELS: Record<QuestionnaireRequestType, string> = {
  external: 'Внешняя',
  internal: 'Внутренняя',
};

export function getQuestionnaireRequestLabel(questionnaire: QuestionnaireIdentity): string {
  const requestNumber = questionnaire.request_number;
  if (typeof requestNumber === 'number' && Number.isFinite(requestNumber) && requestNumber > 0) {
    return `Заявка №${requestNumber}`;
  }

  const fallbackTitle = String(questionnaire.title || '').trim();
  return fallbackTitle || 'Заявка без номера';
}

export function getQuestionnaireRegionLabel(questionnaire: QuestionnaireIdentity): string {
  return String(questionnaire.region_name || '').trim();
}

export function getQuestionnaireRequestType(questionnaire: QuestionnaireIdentity): QuestionnaireRequestType {
  return questionnaire.request_type === 'internal' ? 'internal' : 'external';
}

export function getQuestionnaireRequestTypeLabel(questionnaire: QuestionnaireIdentity): string {
  return QUESTIONNAIRE_REQUEST_TYPE_LABELS[getQuestionnaireRequestType(questionnaire)];
}
