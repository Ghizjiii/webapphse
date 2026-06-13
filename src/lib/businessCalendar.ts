const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const SLA_HOURS = 24;

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function atWorkStart(date: Date): Date {
  const next = new Date(date);
  next.setHours(WORK_START_HOUR, 0, 0, 0);
  return next;
}

function atWorkEnd(date: Date): Date {
  const next = new Date(date);
  next.setHours(WORK_END_HOUR, 0, 0, 0);
  return next;
}

function moveToNextDayStart(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return atWorkStart(next);
}

export function nextBusinessTime(input: Date): Date {
  let current = new Date(input);

  for (let guard = 0; guard < 370; guard += 1) {
    if (isWeekend(current)) {
      current = moveToNextDayStart(current);
      continue;
    }

    const workStart = atWorkStart(current);
    if (current < workStart) return workStart;

    const workEnd = atWorkEnd(current);
    if (current >= workEnd) {
      current = moveToNextDayStart(current);
      continue;
    }

    return current;
  }

  return current;
}

export function addBusinessHours(input: Date, hours = SLA_HOURS): Date {
  let current = nextBusinessTime(input);
  let remainingMs = Math.max(0, hours) * 60 * 60 * 1000;

  for (let guard = 0; guard < 370 && remainingMs > 0; guard += 1) {
    const workEnd = atWorkEnd(current);
    const availableMs = Math.max(0, workEnd.getTime() - current.getTime());

    if (remainingMs <= availableMs) {
      return new Date(current.getTime() + remainingMs);
    }

    remainingMs -= availableMs;
    current = nextBusinessTime(moveToNextDayStart(current));
  }

  return current;
}
