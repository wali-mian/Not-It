import { describe, expect, it } from 'vitest';
import { CHORES, computeStats, localDate, rotationFor, weekIndex, weekOf, type ScoreRow } from '../shared/domain';

describe('week math', () => {
  it('treats Monday as the start and Sunday as the end', () => {
    expect(weekOf('2026-11-02')).toBe('2026-11-02');
    expect(weekOf('2026-11-06')).toBe('2026-11-02');
    expect(weekOf('2026-11-08')).toBe('2026-11-02');
    expect(weekOf('2026-11-09')).toBe('2026-11-09');
  });

  it('flips the week at midnight Toronto time, not UTC', () => {
    // 11:30pm Sunday in Toronto is already Monday 04:30 in UTC.
    const sundayNight = new Date('2026-11-09T04:30:00Z');
    expect(localDate(sundayNight)).toBe('2026-11-08');
    expect(weekOf(localDate(sundayNight))).toBe('2026-11-02');
  });

  it('counts whole weeks across both daylight saving changes', () => {
    expect(weekIndex('2026-02-23', '2026-03-16')).toBe(3);
    expect(weekIndex('2026-10-26', '2026-11-09')).toBe(2);
  });

  it('crosses year boundaries', () => {
    expect(weekOf('2027-01-01')).toBe('2026-12-28');
  });
});

describe('rotation', () => {
  const roster = ['A', 'B', 'C', 'D'];

  it('gives three people a chore and one person the week off', () => {
    const { assignments, off } = rotationFor(roster, 0);
    expect(assignments).toEqual({ milk: 'A', trash: 'B', broom: 'C' });
    expect(off).toEqual(['D']);
  });

  it('never gives anyone two chores in a week', () => {
    for (let week = 0; week < 52; week++) {
      const { assignments, off } = rotationFor(roster, week);
      expect(new Set([...Object.values(assignments), ...off]).size).toBe(4);
    }
  });

  it('gives everyone every chore and one week off, every 4 weeks', () => {
    for (const person of roster) {
      const roles = new Set<string>();
      for (let week = 0; week < 4; week++) {
        const { assignments, off } = rotationFor(roster, week);
        if (off.includes(person)) roles.add('off');
        for (const chore of CHORES) if (assignments[chore.id] === person) roles.add(chore.id);
      }
      expect(roles).toEqual(new Set(['milk', 'trash', 'broom', 'off']));
    }
  });

  it('repeats after the cycle', () => {
    expect(rotationFor(roster, 7)).toEqual(rotationFor(roster, 3));
  });
});

describe('scores', () => {
  const row = (weekStart: string, overrides: Partial<ScoreRow> = {}): ScoreRow => ({
    weekStart,
    assigneeId: 1,
    scheduledId: 1,
    completedAt: '2026-01-01T00:00:00Z',
    late: false,
    ...overrides,
  });
  const current = '2026-11-02';
  const statsFor = (rows: ScoreRow[]) => computeStats([1], rows, current)[0];

  it('does not count an open chore this week as missed', () => {
    const stats = statsFor([row(current, { completedAt: null })]);
    expect(stats).toMatchObject({ missed: 0, done: 0, reliability: null, streak: 0 });
  });

  it('counts an unfinished past chore as missed', () => {
    expect(statsFor([row('2026-10-26', { completedAt: null })])).toMatchObject({ missed: 1, reliability: 0 });
  });

  it('breaks the streak at the most recent miss', () => {
    const stats = statsFor([
      row('2026-10-26'),
      row('2026-10-19'),
      row('2026-10-12', { completedAt: null }),
      row('2026-10-05'),
    ]);
    expect(stats).toMatchObject({ streak: 2, done: 3, missed: 1, reliability: 75 });
  });

  it('credits a cover to the person who took it', () => {
    const stats = computeStats([1, 2], [row('2026-10-26', { assigneeId: 2, scheduledId: 1 })], current);
    expect(stats.find((s) => s.memberId === 2)).toMatchObject({ done: 1, covers: 1 });
    expect(stats.find((s) => s.memberId === 1)).toMatchObject({ done: 0, covers: 0, reliability: null });
  });

  it('ranks the most reliable first, with nothing-due-yet last', () => {
    const rows = [
      row('2026-10-26', { assigneeId: 1, completedAt: null }),
      row('2026-10-26', { assigneeId: 2 }),
    ];
    expect(computeStats([3, 1, 2], rows, current).map((s) => s.memberId)).toEqual([2, 1, 3]);
  });
});
