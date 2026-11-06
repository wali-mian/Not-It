import { CHORES, type ChoreId } from '../shared/domain';

const pretty = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...options }).format(new Date(`${date}T00:00:00Z`));

export const shortDate = (date: string) => pretty(date, { month: 'short', day: 'numeric' });

export function weekRange(start: string, end: string): string {
  return `${shortDate(start)} to ${shortDate(end)}`;
}

export function completedTime(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft === 1) return 'Last day';
  return `${daysLeft} days left`;
}

export const choreLabel = (id: ChoreId) => CHORES.find((chore) => chore.id === id)!.label;

/** Opens the phone's share sheet, or copies when there isn't one. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
