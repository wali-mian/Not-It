// Pure scheduling rules, shared by the Worker and the browser.

export const TIME_ZONE = 'America/Toronto';
export const ROSTER_SIZE = 4;
export const NAME_MAX = 10;

export const CHORES = [
  { id: 'milk', label: 'Milk', doneLabel: 'Got the milk', nudge: 'we need milk' },
  { id: 'trash', label: 'Trash', doneLabel: 'Took out the trash', nudge: 'the trash is calling' },
  { id: 'broom', label: 'Broom', doneLabel: 'Swept the floors', nudge: 'the floors need a sweep' },
] as const;

export type ChoreId = (typeof CHORES)[number]['id'];

export function isChoreId(value: string): value is ChoreId {
  return CHORES.some((chore) => chore.id === value);
}

// ---- Dates: plain YYYY-MM-DD strings, so DST can never shift a week. ----

const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** The calendar date at the house, whatever time zone the server runs in. */
export function localDate(now: Date, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Weeks run Monday to Sunday. */
export function weekOf(date: string): string {
  const day = new Date(toUtcMs(date)).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

// ---- Rotation ----

/**
 * Each chore sits one seat further along the roster, and everyone moves one
 * seat per week. With 4 people and 3 chores, each person does every chore once
 * and gets one week off in every 4-week cycle.
 */
export function rotationFor<T>(roster: readonly T[], weekIndex: number) {
  const size = roster.length;
  const seat = (offset: number) => roster[(((weekIndex + offset) % size) + size) % size];
  const assignments = {} as Record<ChoreId, T>;
  CHORES.forEach((chore, index) => {
    assignments[chore.id] = seat(index);
  });
  const off: T[] = [];
  for (let offset = CHORES.length; offset < size; offset++) off.push(seat(offset));
  return { assignments, off };
}

export function weekIndex(startWeek: string, week: string): number {
  return Math.round(daysBetween(startWeek, week) / 7);
}

// ---- Scores ----

export interface ScoreRow {
  weekStart: string;
  assigneeId: number;
  scheduledId: number;
  completedAt: string | null;
  late: boolean;
}

export interface MemberStats {
  memberId: number;
  done: number;
  late: number;
  missed: number;
  covers: number;
  streak: number;
  /** Percent of due chores that got done. Null until something has come due. */
  reliability: number | null;
}

export function computeStats(
  memberIds: readonly number[],
  rows: readonly ScoreRow[],
  currentWeek: string,
): MemberStats[] {
  const stats = memberIds.map((memberId) => {
    const mine = rows
      .filter((row) => row.assigneeId === memberId)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    // An unfinished chore in the current week is still open: neither done nor missed.
    const settled = mine.filter((row) => row.completedAt !== null || row.weekStart < currentWeek);
    const done = settled.filter((row) => row.completedAt !== null);
    const firstMiss = settled.findIndex((row) => row.completedAt === null);
    return {
      memberId,
      done: done.length,
      late: done.filter((row) => row.late).length,
      missed: settled.length - done.length,
      covers: done.filter((row) => row.assigneeId !== row.scheduledId).length,
      streak: firstMiss === -1 ? settled.length : firstMiss,
      reliability: settled.length === 0 ? null : Math.round((done.length / settled.length) * 100),
    };
  });
  return stats.sort(
    (a, b) => (b.reliability ?? -1) - (a.reliability ?? -1) || b.done - a.done || a.missed - b.missed,
  );
}

// ---- API shapes ----

export interface Member {
  id: number;
  name: string;
}

export interface ChoreState {
  weekStart: string;
  chore: ChoreId;
  scheduledId: number;
  assigneeId: number;
  completedAt: string | null;
  completedById: number | null;
  late: boolean;
}

export interface UpcomingWeek {
  weekStart: string;
  assignments: Record<ChoreId, number>;
  offIds: number[];
}

export interface BoardState {
  houseName: string;
  meId: number;
  members: Member[];
  week: { start: string; end: string; daysLeft: number };
  chores: ChoreState[];
  /** Last week's unfinished chores, which can still be marked done late. */
  looseEnds: ChoreState[];
  upcoming: UpcomingWeek[];
  stats: MemberStats[];
  /** Past weeks, newest first. */
  history: { weekStart: string; chores: ChoreState[] }[];
}
