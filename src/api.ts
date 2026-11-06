import type { BoardState, ChoreId, Member } from '../shared/domain';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('No connection. Try again in a sec.', 0);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? 'Something went wrong.', response.status);
  return data as T;
}

export type ChoreAction = 'complete' | 'undo' | 'cover';

export const api = {
  status: () => request<{ isSetUp: boolean; houseName: string | null }>('/api/status'),
  state: () => request<BoardState>('/api/state'),
  setup: (body: { houseName: string; code: string; members: string[] }) =>
    request<{ members: Member[] }>('/api/setup', { body }),
  checkCode: (code: string) => request<{ members: Member[] }>('/api/login', { body: { code } }),
  signIn: (code: string, memberId: number) => request('/api/login', { body: { code, memberId } }),
  signOut: () => request('/api/logout', { method: 'POST' }),
  choreAction: (week: string, chore: ChoreId, action: ChoreAction) =>
    request<BoardState>(`/api/chores/${week}/${chore}/${action}`, { method: 'POST' }),
  rename: (id: number, name: string) =>
    request<BoardState>(`/api/members/${id}`, { method: 'PATCH', body: { name } }),
};
