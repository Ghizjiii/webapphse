export interface ParticipantNameParts {
  last_name: string;
  first_name: string;
  patronymic: string;
}

export function buildParticipantFullName(parts: Partial<ParticipantNameParts>): string {
  return [
    String(parts.last_name || '').trim(),
    String(parts.first_name || '').trim(),
    String(parts.patronymic || '').trim(),
  ].filter(Boolean).join(' ');
}

export function getParticipantDisplayName(parts: Partial<ParticipantNameParts> & { full_name?: string | null }): string {
  return String(parts.full_name || '').trim() || buildParticipantFullName(parts);
}

function normalizeNameToken(token: string): string {
  return token
    .split('-')
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      return trimmed.charAt(0).toLocaleUpperCase('ru-RU') + trimmed.slice(1).toLocaleLowerCase('ru-RU');
    })
    .join('-');
}

export function normalizeParticipantFullName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(normalizeNameToken)
    .join(' ');
}

export function splitParticipantFullName(value: string): ParticipantNameParts {
  const tokens = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);

  return {
    last_name: tokens[0] || '',
    first_name: tokens[1] || '',
    patronymic: tokens.slice(2).join(' '),
  };
}
