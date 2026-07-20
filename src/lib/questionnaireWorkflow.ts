import { supabase } from './supabase';
import type { QuestionnaireEvent, QuestionnaireLink, QuestionnaireWorkflowStatus } from '../types';

export type WorkflowTransition = 'accepted' | 'in_progress' | 'completed' | 'archived';

export const WORKFLOW_STATUS_LABELS: Record<QuestionnaireWorkflowStatus, string> = {
  awaiting_submission: 'Ожидает заполнения',
  submitted: 'Новая заявка в обработке',
  accepted: 'Ожидает работы координатора',
  in_progress: 'В работе',
  completed: 'Завершена',
  overdue: 'Просрочена',
  archived: 'Архив',
};

export const WORKFLOW_EVENT_LABELS: Record<string, string> = {
  submitted: 'Заявка поступила',
  accepted: 'Принята',
  processing_started: 'Взята в работу',
  processing_owner_changed: 'Изменен ответственный за работу',
  completed: 'Завершена',
  overdue: 'Просрочена',
  archived: 'Перенесена в архив',
};

export function resolveWorkflowStatus(questionnaire: QuestionnaireLink): QuestionnaireWorkflowStatus {
  if (questionnaire.workflow_status) return questionnaire.workflow_status;
  if (questionnaire.status === 'archived') return 'archived';
  if (questionnaire.status === 'synced') return 'completed';
  if (questionnaire.submitted_at) return 'submitted';
  return 'awaiting_submission';
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';

  const totalMinutes = Math.round(seconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts = [
    days > 0 ? `${days} д` : '',
    hours > 0 ? `${hours} ч` : '',
    minutes > 0 || (days === 0 && hours === 0) ? `${minutes} мин` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

export function durationBetween(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '—';
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '—';
  return formatDuration(Math.round((endMs - startMs) / 1000));
}

export function getSlaSecondsLeft(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const deadlineMs = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return null;
  return Math.round((deadlineMs - Date.now()) / 1000);
}

export async function transitionQuestionnaireWorkflow(
  questionnaireId: string,
  nextStatus: WorkflowTransition,
): Promise<QuestionnaireLink> {
  const { data, error } = await supabase.rpc('transition_questionnaire_workflow', {
    p_questionnaire_id: questionnaireId,
    p_next_status: nextStatus,
  });

  if (error) throw error;
  return data as QuestionnaireLink;
}

export async function reassignQuestionnaireProcessingOwner(
  questionnaireId: string,
  processingStartedBy: string,
): Promise<QuestionnaireLink> {
  const { data, error } = await supabase.rpc('reassign_questionnaire_processing_owner', {
    p_questionnaire_id: questionnaireId,
    p_processing_started_by: processingStartedBy,
  });

  if (error) throw error;
  return data as QuestionnaireLink;
}

export async function loadQuestionnaireEvents(questionnaireId: string): Promise<QuestionnaireEvent[]> {
  const { data, error } = await supabase
    .from('questionnaire_events')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .order('occurred_at', { ascending: true });

  if (error) throw error;
  return (data || []) as QuestionnaireEvent[];
}
