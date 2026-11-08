import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  CHORES,
  NAME_MAX,
  ROSTER_SIZE,
  addDays,
  computeStats,
  daysBetween,
  isChoreId,
  localDate,
  rotationFor,
  weekIndex,
  weekOf,
  type BoardState,
  type ChoreId,
  type ChoreState,
  type Member,
  type UpcomingWeek,
} from '../shared/domain';
import { createSession, hashCode, randomHex, readSession, verifyCode } from './auth';

export interface Env {
  DB: D1Database;
}

interface HouseRow {
  name: string;
  code_hash: string;
  code_salt: string;
  session_secret: string;
  start_week: string;
}

interface AssignmentRow {
  week_start: string;
  chore: ChoreId;
  scheduled_id: number;
  assignee_id: number;
  completed_at: string | null;
  completed_by: number | null;
  late: number;
}

const COOKIE = 'notit_session';
const SESSION_MS = 365 * 86_400_000;
const CODE_MIN = 6;
const CODE_MAX = 64;
const HOUSE_NAME_MAX = 24;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;
const UPCOMING_WEEKS = 6;
const HISTORY_WEEKS = 12;

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  const length = Array.from(name).length;
  return length >= 1 && length <= NAME_MAX ? name : null;
}

function toChoreState(row: AssignmentRow): ChoreState {
  return {
    weekStart: row.week_start,
    chore: row.chore,
    scheduledId: row.scheduled_id,
    assigneeId: row.assignee_id,
    completedAt: row.completed_at,
    completedById: row.completed_by,
    late: row.late === 1,
  };
}

async function loadHouse(db: D1Database): Promise<HouseRow | null> {
  return db
    .prepare('SELECT name, code_hash, code_salt, session_secret, start_week FROM house WHERE id = 1')
    .first<HouseRow>();
}

async function loadMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db.prepare('SELECT id, name FROM members ORDER BY position').all<Member>();
  return results;
}

/**
 * This is what makes the schedule automatic: no cron, no admin. Any read writes
 * out every week since the last one on record, including weeks nobody opened.
 */
async function ensureWeeks(db: D1Database, house: HouseRow, members: Member[], currentWeek: string) {
  const latest = await db.prepare('SELECT MAX(week_start) AS week FROM assignments').first<{ week: string | null }>();
  let week = latest?.week ? addDays(latest.week, 7) : house.start_week;
  const inserts: D1PreparedStatement[] = [];
  const statement = db.prepare(
    'INSERT OR IGNORE INTO assignments (week_start, chore, scheduled_id, assignee_id) VALUES (?, ?, ?, ?)',
  );
  while (week <= currentWeek) {
    const { assignments } = rotationFor(members, weekIndex(house.start_week, week));
    for (const chore of CHORES) {
      const member = assignments[chore.id];
      inserts.push(statement.bind(week, chore.id, member.id, member.id));
    }
    week = addDays(week, 7);
  }
  if (inserts.length > 0) await db.batch(inserts);
}

async function buildState(db: D1Database, house: HouseRow, meId: number, now: Date): Promise<BoardState> {
  const members = await loadMembers(db);
  const today = localDate(now);
  const currentWeek = weekOf(today);
  await ensureWeeks(db, house, members, currentWeek);

  const { results } = await db
    .prepare('SELECT * FROM assignments ORDER BY week_start DESC')
    .all<AssignmentRow>();
  const order = CHORES.map((chore) => chore.id);
  const rows = results
    .map(toChoreState)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || order.indexOf(a.chore) - order.indexOf(b.chore));

  const lastWeek = addDays(currentWeek, -7);
  const past = new Map<string, ChoreState[]>();
  for (const row of rows) {
    if (row.weekStart < currentWeek) past.set(row.weekStart, [...(past.get(row.weekStart) ?? []), row]);
  }

  const upcoming: UpcomingWeek[] = [];
  for (let i = 1; i <= UPCOMING_WEEKS; i++) {
    const weekStart = addDays(currentWeek, i * 7);
    const { assignments, off } = rotationFor(members, weekIndex(house.start_week, weekStart));
    upcoming.push({
      weekStart,
      assignments: {
        milk: assignments.milk.id,
        trash: assignments.trash.id,
        broom: assignments.broom.id,
      },
      offIds: off.map((member) => member.id),
    });
  }

  const end = addDays(currentWeek, 6);
  return {
    houseName: house.name,
    meId,
    members,
    week: { start: currentWeek, end, daysLeft: daysBetween(today, end) + 1 },
    chores: rows.filter((row) => row.weekStart === currentWeek),
    looseEnds: rows.filter((row) => row.weekStart === lastWeek && row.completedAt === null),
    upcoming,
    stats: computeStats(
      members.map((member) => member.id),
      rows,
      currentWeek,
    ),
    history: Array.from(past, ([weekStart, chores]) => ({ weekStart, chores })).slice(0, HISTORY_WEEKS),
  };
}

type Variables = { house: HouseRow; memberId: number };

export function createApp(clock: () => Date = () => new Date()) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Something broke on our end. Try again.' }, 500);
  });

  async function readJson(request: Request): Promise<Record<string, unknown>> {
    try {
      const body = await request.json();
      return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  app.get('/api/status', async (c) => {
    const house = await loadHouse(c.env.DB);
    return c.json({ isSetUp: house !== null, houseName: house?.name ?? null });
  });

  app.post('/api/setup', async (c) => {
    const body = await readJson(c.req.raw);
    const houseName = typeof body.houseName === 'string' ? body.houseName.trim() : '';
    if (!houseName || houseName.length > HOUSE_NAME_MAX) {
      return c.json({ error: `House name must be 1 to ${HOUSE_NAME_MAX} characters.` }, 400);
    }
    const code = typeof body.code === 'string' ? body.code : '';
    if (code.length < CODE_MIN || code.length > CODE_MAX) {
      return c.json({ error: `House code must be at least ${CODE_MIN} characters.` }, 400);
    }
    const rawMembers = Array.isArray(body.members) ? body.members : [];
    const names = rawMembers.map(cleanName);
    if (names.length !== ROSTER_SIZE || names.some((name) => name === null)) {
      return c.json({ error: `Enter ${ROSTER_SIZE} names, up to ${NAME_MAX} characters each.` }, 400);
    }
    if (new Set(names.map((name) => name!.toLowerCase())).size !== names.length) {
      return c.json({ error: 'Everyone needs a different name.' }, 400);
    }

    const salt = randomHex(16);
    const now = clock();
    const statements = [
      c.env.DB.prepare(
        'INSERT INTO house (id, name, code_hash, code_salt, session_secret, start_week, created_at) VALUES (1, ?, ?, ?, ?, ?, ?)',
      ).bind(houseName, await hashCode(code, salt), salt, randomHex(32), weekOf(localDate(now)), now.toISOString()),
      ...names.map((name, index) =>
        c.env.DB.prepare('INSERT INTO members (id, name, position) VALUES (?, ?, ?)').bind(index + 1, name, index),
      ),
    ];
    try {
      // Atomic: if a board already exists, the primary key rejects the whole batch.
      await c.env.DB.batch(statements);
    } catch {
      return c.json({ error: 'This board is already set up.' }, 409);
    }
    return c.json({ ok: true, members: await loadMembers(c.env.DB) });
  });

  // With just a code, returns the roster to pick from. With a memberId too, signs you in.
  app.post('/api/login', async (c) => {
    const db = c.env.DB;
    const house = await loadHouse(db);
    if (!house) return c.json({ error: 'This board has not been set up yet.' }, 409);

    const ip = c.req.header('cf-connecting-ip') ?? 'local';
    const nowMs = clock().getTime();
    const attempt = await db
      .prepare('SELECT failures, locked_until FROM login_attempts WHERE ip = ?')
      .bind(ip)
      .first<{ failures: number; locked_until: number }>();
    if (attempt && attempt.locked_until > nowMs) {
      return c.json({ error: 'Too many wrong tries. Wait 15 minutes.' }, 429);
    }

    const body = await readJson(c.req.raw);
    const code = typeof body.code === 'string' ? body.code : '';
    if (code.length > CODE_MAX || !(await verifyCode(code, house.code_salt, house.code_hash))) {
      const failures = (attempt?.failures ?? 0) + 1;
      const locked = failures >= MAX_FAILURES;
      await db
        .prepare(
          'INSERT INTO login_attempts (ip, failures, locked_until) VALUES (?1, ?2, ?3) ON CONFLICT (ip) DO UPDATE SET failures = ?2, locked_until = ?3',
        )
        .bind(ip, locked ? 0 : failures, locked ? nowMs + LOCKOUT_MS : 0)
        .run();
      return c.json({ error: 'That is not the house code.' }, 401);
    }
    if (attempt) await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();

    const members = await loadMembers(db);
    if (body.memberId === undefined) return c.json({ members });

    const member = members.find((candidate) => candidate.id === body.memberId);
    if (!member) return c.json({ error: 'Pick someone on the roster.' }, 400);

    const expiresAt = nowMs + SESSION_MS;
    setCookie(c, COOKIE, await createSession(member.id, expiresAt, house.session_secret), {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Strict',
      path: '/',
      expires: new Date(expiresAt),
    });
    return c.json({ ok: true });
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // Everything below here needs a session.
  app.use('/api/*', async (c, next) => {
    const house = await loadHouse(c.env.DB);
    const token = getCookie(c, COOKIE);
    const memberId =
      house && token ? await readSession(token, house.session_secret, clock().getTime()) : null;
    if (!house || memberId === null) return c.json({ error: 'Not signed in.' }, 401);
    c.set('house', house);
    c.set('memberId', memberId);
    await next();
  });

  app.get('/api/state', async (c) => {
    return c.json(await buildState(c.env.DB, c.get('house'), c.get('memberId'), clock()));
  });

  app.post('/api/chores/:week/:chore/:action', async (c) => {
    const { week, chore, action } = c.req.param();
    const db = c.env.DB;
    const house = c.get('house');
    const meId = c.get('memberId');
    if (!isChoreId(chore)) return c.json({ error: 'Unknown chore.' }, 404);

    const now = clock();
    const currentWeek = weekOf(localDate(now));
    // Only this week and last week stay editable. Older weeks are the permanent record.
    if (week !== currentWeek && week !== addDays(currentWeek, -7)) {
      return c.json({ error: 'That week is closed.' }, 409);
    }
    await ensureWeeks(db, house, await loadMembers(db), currentWeek);
    const where = 'WHERE week_start = ? AND chore = ?';

    if (action === 'complete') {
      const late = week < currentWeek ? 1 : 0;
      await db
        .prepare(`UPDATE assignments SET completed_at = ?, completed_by = ?, late = ? ${where} AND completed_at IS NULL`)
        .bind(now.toISOString(), meId, late, week, chore)
        .run();
    } else if (action === 'undo') {
      await db
        .prepare(`UPDATE assignments SET completed_at = NULL, completed_by = NULL, late = 0 ${where}`)
        .bind(week, chore)
        .run();
    } else if (action === 'cover') {
      const { meta } = await db
        .prepare(`UPDATE assignments SET assignee_id = ? ${where} AND completed_at IS NULL`)
        .bind(meId, week, chore)
        .run();
      if (meta.changes === 0) return c.json({ error: 'That one is already done.' }, 409);
    } else if (action === 'uncover') {
      const { meta } = await db
        .prepare(`UPDATE assignments SET assignee_id = scheduled_id ${where} AND completed_at IS NULL`)
        .bind(week, chore)
        .run();
      if (meta.changes === 0) return c.json({ error: 'That one is already done. Undo it first.' }, 409);
    } else {
      return c.json({ error: 'Unknown action.' }, 404);
    }
    return c.json(await buildState(db, house, meId, now));
  });

  app.patch('/api/members/:id', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const body = await readJson(c.req.raw);
    const name = cleanName(body.name);
    if (!name) return c.json({ error: `Names are 1 to ${NAME_MAX} characters.` }, 400);
    const members = await loadMembers(db);
    if (!members.some((member) => member.id === id)) return c.json({ error: 'No such person.' }, 404);
    if (members.some((member) => member.id !== id && member.name.toLowerCase() === name.toLowerCase())) {
      return c.json({ error: 'Someone already has that name.' }, 409);
    }
    await db.prepare('UPDATE members SET name = ? WHERE id = ?').bind(name, id).run();
    return c.json(await buildState(db, c.get('house'), c.get('memberId'), clock()));
  });

  return app;
}
