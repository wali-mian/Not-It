import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../worker/app';
import type { BoardState } from '../shared/domain';
import { createFakeD1 } from './fake-d1';

const NAMES = ['Wali', 'Ali', 'Sam', 'Omar'];
const CODE = 'haven-204';
const week1 = '2026-11-02';

let now: Date;
let env: { DB: D1Database };
let app: ReturnType<typeof createApp>;
let cookie: string;

function call(path: string, options: { method?: string; body?: unknown; cookie?: string; ip?: string } = {}) {
  return app.request(
    path,
    {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.ip ? { 'cf-connecting-ip': options.ip } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    env,
  );
}

const setup = () => call('/api/setup', { body: { houseName: 'Haven', code: CODE, members: NAMES } });

async function signIn(memberId: number) {
  const response = await call('/api/login', { body: { code: CODE, memberId } });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}

async function state(as = cookie) {
  return (await (await call('/api/state', { cookie: as })).json()) as BoardState;
}

const act = (week: string, chore: string, action: string, as = cookie) =>
  call(`/api/chores/${week}/${chore}/${action}`, { method: 'POST', cookie: as });

const assigneeOf = (board: BoardState, chore: string) => board.chores.find((c) => c.chore === chore)!.assigneeId;

beforeEach(async () => {
  now = new Date('2026-11-06T17:00:00Z');
  env = { DB: createFakeD1() };
  app = createApp(() => now);
  expect((await setup()).status).toBe(200);
  cookie = await signIn(1);
});

describe('setup', () => {
  it('can only happen once', async () => {
    expect((await setup()).status).toBe(409);
    expect((await state()).houseName).toBe('Haven');
  });

  it('leaves nothing behind when setup is rejected', async () => {
    env = { DB: createFakeD1() };
    const bad = await call('/api/setup', { body: { houseName: 'Haven', code: CODE, members: ['A', 'A', 'B', 'C'] } });
    expect(bad.status).toBe(400);
    expect(await (await call('/api/status')).json()).toEqual({ isSetUp: false, houseName: null });
  });

  it.each([
    [{ houseName: '', code: CODE, members: NAMES }],
    [{ houseName: 'Haven', code: '123', members: NAMES }],
    [{ houseName: 'Haven', code: CODE, members: ['A', 'B', 'C'] }],
    [{ houseName: 'Haven', code: CODE, members: ['A', 'B', 'C', 'ElevenChars'] }],
  ])('rejects %j', async (body) => {
    env = { DB: createFakeD1() };
    expect((await call('/api/setup', { body })).status).toBe(400);
  });
});

describe('auth', () => {
  it('keeps the board private without a session', async () => {
    expect((await call('/api/state')).status).toBe(401);
    expect((await act(week1, 'milk', 'complete', '')).status).toBe(401);
  });

  it('rejects a tampered session', async () => {
    const forged = cookie.replace(/notit_session=1\./, 'notit_session=2.');
    expect((await call('/api/state', { cookie: forged })).status).toBe(401);
  });

  it('expires sessions', async () => {
    now = new Date(now.getTime() + 366 * 86_400_000);
    expect((await call('/api/state', { cookie })).status).toBe(401);
  });

  it('marks the cookie HttpOnly and SameSite=Strict', async () => {
    const response = await call('/api/login', { body: { code: CODE, memberId: 2 } });
    const header = response.headers.get('set-cookie')!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
  });

  it('returns the roster for a right code, and nothing for a wrong one', async () => {
    const right = await call('/api/login', { body: { code: CODE } });
    expect(((await right.json()) as { members: unknown[] }).members).toHaveLength(4);
    expect(right.headers.get('set-cookie')).toBeNull();
    const wrong = await call('/api/login', { body: { code: 'nope-nope' } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).not.toHaveProperty('members');
  });

  it('rejects someone who is not on the roster', async () => {
    expect((await call('/api/login', { body: { code: CODE, memberId: 99 } })).status).toBe(400);
  });

  it('locks out after 5 wrong codes, per IP, then recovers', async () => {
    const attempt = (code: string, ip: string) => call('/api/login', { body: { code }, ip });
    for (let i = 0; i < 5; i++) expect((await attempt('wrong-code', '1.1.1.1')).status).toBe(401);
    expect((await attempt(CODE, '1.1.1.1')).status).toBe(429);
    expect((await attempt(CODE, '2.2.2.2')).status).toBe(200);
    now = new Date(now.getTime() + 16 * 60_000);
    expect((await attempt(CODE, '1.1.1.1')).status).toBe(200);
  });
});

describe('the schedule', () => {
  it('assigns this week from the roster order', async () => {
    const board = await state();
    expect(board.week).toEqual({ start: week1, end: '2026-11-08', daysLeft: 3 });
    expect([assigneeOf(board, 'milk'), assigneeOf(board, 'trash'), assigneeOf(board, 'broom')]).toEqual([1, 2, 3]);
    expect(board.upcoming[0].weekStart).toBe('2026-11-09');
  });

  it('rotates by itself when the week turns over', async () => {
    now = new Date('2026-11-09T12:00:00Z');
    const board = await state();
    expect([assigneeOf(board, 'milk'), assigneeOf(board, 'trash'), assigneeOf(board, 'broom')]).toEqual([2, 3, 4]);
  });

  it('turns over at Toronto midnight on Sunday night', async () => {
    now = new Date('2026-11-09T04:30:00Z');
    expect((await state()).week.start).toBe(week1);
    expect((await state()).week.daysLeft).toBe(1);
    now = new Date('2026-11-09T05:30:00Z');
    expect((await state()).week.start).toBe('2026-11-09');
  });

  it('matches what the upcoming view promised', async () => {
    const promised = (await state()).upcoming[2];
    now = new Date('2026-11-24T12:00:00Z');
    const board = await state();
    expect(board.week.start).toBe(promised.weekStart);
    expect(assigneeOf(board, 'trash')).toBe(promised.assignments.trash);
  });

  it('fills in weeks nobody opened and scores them as missed', async () => {
    now = new Date('2026-11-24T12:00:00Z');
    const board = await state();
    expect(board.history.map((week) => week.weekStart)).toEqual(['2026-11-16', '2026-11-09', week1]);
    const totalMissed = board.stats.reduce((sum, member) => sum + member.missed, 0);
    expect(totalMissed).toBe(9);
  });

  it('survives concurrent reads writing the same week', async () => {
    now = new Date('2026-11-09T12:00:00Z');
    await Promise.all([state(), state(), state()]);
    expect((await state()).chores).toHaveLength(3);
  });
});

describe('checking off', () => {
  it('records who did it and when, and scores it', async () => {
    await act(week1, 'milk', 'complete');
    const board = await state();
    const milk = board.chores.find((c) => c.chore === 'milk')!;
    expect(milk).toMatchObject({ completedById: 1, late: false, completedAt: now.toISOString() });
    expect(board.stats.find((s) => s.memberId === 1)).toMatchObject({ done: 1, reliability: 100 });
  });

  it('keeps the first timestamp when two people tap at once', async () => {
    await act(week1, 'milk', 'complete');
    const first = (await state()).chores.find((c) => c.chore === 'milk')!.completedAt;
    now = new Date(now.getTime() + 60_000);
    await act(week1, 'milk', 'complete', await signIn(2));
    const milk = (await state()).chores.find((c) => c.chore === 'milk')!;
    expect(milk.completedAt).toBe(first);
    expect(milk.completedById).toBe(1);
  });

  it('can be undone', async () => {
    await act(week1, 'milk', 'complete');
    await act(week1, 'milk', 'undo');
    expect((await state()).chores.find((c) => c.chore === 'milk')!.completedAt).toBeNull();
  });

  it('lets last week be finished late, once the week has rolled', async () => {
    now = new Date('2026-11-10T12:00:00Z');
    let board = await state();
    expect(board.looseEnds).toHaveLength(3);
    await act(week1, 'trash', 'complete');
    board = await state();
    expect(board.looseEnds.map((c) => c.chore)).toEqual(['milk', 'broom']);
    expect(board.stats.find((s) => s.memberId === 2)).toMatchObject({ done: 1, late: 1, missed: 0 });
  });

  it('closes weeks older than last week', async () => {
    now = new Date('2026-11-17T12:00:00Z');
    await state();
    expect((await act(week1, 'milk', 'complete')).status).toBe(409);
  });

  it('rejects unknown chores and actions, and future weeks', async () => {
    expect((await act(week1, 'dishes', 'complete')).status).toBe(404);
    expect((await act(week1, 'milk', 'explode')).status).toBe(404);
    expect((await act('2026-11-09', 'milk', 'complete')).status).toBe(409);
  });
});

describe('covering', () => {
  it('moves the chore and credits the cover, leaving the schedule on record', async () => {
    const samCookie = await signIn(4);
    await act(week1, 'trash', 'cover', samCookie);
    await act(week1, 'trash', 'complete', samCookie);
    const board = await state();
    expect(board.chores.find((c) => c.chore === 'trash')).toMatchObject({ scheduledId: 2, assigneeId: 4 });
    expect(board.stats.find((s) => s.memberId === 4)).toMatchObject({ done: 1, covers: 1 });
    expect(board.stats.find((s) => s.memberId === 2)).toMatchObject({ done: 0, missed: 0 });
  });

  it('refuses to cover something already done', async () => {
    await act(week1, 'trash', 'complete');
    expect((await act(week1, 'trash', 'cover')).status).toBe(409);
  });

  it('does not change next week', async () => {
    await act(week1, 'trash', 'cover');
    now = new Date('2026-11-09T12:00:00Z');
    expect(assigneeOf(await state(), 'trash')).toBe(3);
  });
});

describe('renaming', () => {
  it('renames someone without touching their history', async () => {
    await act(week1, 'milk', 'complete');
    const response = await call('/api/members/1', { method: 'PATCH', body: { name: 'W' }, cookie });
    const board = (await response.json()) as BoardState;
    expect(board.members[0].name).toBe('W');
    expect(board.stats.find((s) => s.memberId === 1)!.done).toBe(1);
  });

  it('rejects duplicates and bad names', async () => {
    const rename = (name: string) => call('/api/members/1', { method: 'PATCH', body: { name }, cookie });
    expect((await rename('ali')).status).toBe(409);
    expect((await rename('   ')).status).toBe(400);
    expect((await rename('WayTooLongName')).status).toBe(400);
  });
});
