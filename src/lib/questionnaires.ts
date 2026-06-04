type QuestionnaireIdentity = {
  request_number?: number | null;
  title?: string | null;
  region_name?: string | null;
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
