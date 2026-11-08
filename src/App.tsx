import { useCallback, useEffect, useRef, useState } from 'react';
import { CHORES, type BoardState, type ChoreState, type Member } from '../shared/domain';
import { api, ApiError, type ChoreAction } from './api';
import { choreLabel, shareText, shortDate } from './format';
import { Ahead } from './screens/Ahead';
import { Board } from './screens/Board';
import { House } from './screens/House';
import { PickMember, Setup, Unlock } from './screens/Onboarding';
import { Scores } from './screens/Scores';

type Gate =
  | { screen: 'loading' }
  | { screen: 'error'; message: string }
  | { screen: 'setup' }
  | { screen: 'unlock'; houseName: string | null; code?: string }
  | { screen: 'pick'; code: string; members: Member[]; showInvite: boolean }
  | { screen: 'app' };

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'ahead', label: 'Ahead' },
  { id: 'scores', label: 'Scores' },
  { id: 'house', label: 'House' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const POLL_MS = 20_000;

/** Reads an invite code from the URL fragment, then removes it from the address bar. */
function takeInviteCode(): string | undefined {
  const match = location.hash.match(/^#join=(.+)$/);
  if (!match) return undefined;
  history.replaceState(null, '', location.pathname);
  return decodeURIComponent(match[1]);
}

export function App() {
  const [gate, setGate] = useState<Gate>({ screen: 'loading' });
  const [board, setBoard] = useState<BoardState | null>(null);
  const [tab, setTab] = useState<Tab>('board');
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  // Stops a slow background refresh from overwriting a newer tap.
  const mutationCount = useRef(0);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const boot = useCallback(async () => {
    const invite = takeInviteCode();
    try {
      setBoard(await api.state());
      setGate({ screen: 'app' });
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 401) {
        setGate({ screen: 'error', message: caught instanceof ApiError ? caught.message : 'Could not load the board.' });
        return;
      }
      try {
        const status = await api.status();
        setGate(status.isSetUp ? { screen: 'unlock', houseName: status.houseName, code: invite } : { screen: 'setup' });
      } catch {
        setGate({ screen: 'error', message: 'Could not reach the board.' });
      }
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Keeps everyone's phone in sync: a slow poll, plus a refresh on reopening the app.
  const inApp = gate.screen === 'app';
  useEffect(() => {
    if (!inApp) return;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      const startedAt = mutationCount.current;
      try {
        const next = await api.state();
        if (startedAt === mutationCount.current) setBoard(next);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) void boot();
      }
    };
    const interval = window.setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [inApp, boot]);

  async function act(chore: ChoreState, action: ChoreAction) {
    const key = `${chore.weekStart}/${chore.chore}`;
    setPending(key);
    mutationCount.current += 1;
    try {
      setBoard(await api.choreAction(chore.weekStart, chore.chore, action));
      if (action === 'complete') navigator.vibrate?.(30);
    } catch (caught) {
      flash(caught instanceof ApiError ? caught.message : 'That did not save.');
    } finally {
      setPending(null);
    }
  }

  async function share(text: string) {
    const result = await shareText(text);
    if (result === 'copied') flash('Copied. Paste it in the chat.');
    if (result === 'failed') flash('Could not share from this browser.');
  }

  function nudge(chore: ChoreState) {
    if (!board) return;
    const name = board.members.find((member) => member.id === chore.assigneeId)?.name;
    const line = CHORES.find((item) => item.id === chore.chore)!.nudge;
    void share(`${name}, ${line}. You're on ${choreLabel(chore.chore).toLowerCase()} this week. ${location.origin}`);
  }

  function shareWeek() {
    if (!board) return;
    const nameOf = (id: number) => board.members.find((member) => member.id === id)?.name;
    const lines = board.chores.map((chore) => {
      const cover = chore.assigneeId !== chore.scheduledId ? `, covered by ${nameOf(chore.assigneeId)}` : '';
      return `${choreLabel(chore.chore)}: ${nameOf(chore.scheduledId)}${cover}${chore.completedAt ? ' (done)' : ''}`;
    });
    const off = board.members.filter((member) => !board.chores.some((chore) => chore.scheduledId === member.id));
    if (off.length > 0) lines.push(`Not it: ${off.map((member) => member.name).join(', ')}`);
    void share(`Week of ${shortDate(board.week.start)}\n${lines.join('\n')}\n${location.origin}`);
  }

  async function switchPerson() {
    await api.signOut().catch(() => undefined);
    setBoard(null);
    setTab('board');
    void boot();
  }

  switch (gate.screen) {
    case 'loading':
      return <div className="center" role="status">Loading the board</div>;
    case 'error':
      return (
        <div className="center">
          <p>{gate.message}</p>
          <button className="button" onClick={() => void boot()}>Try again</button>
        </div>
      );
    case 'setup':
      return <Setup onDone={(code, members) => setGate({ screen: 'pick', code, members, showInvite: true })} />;
    case 'unlock':
      return (
        <Unlock
          houseName={gate.houseName}
          initialCode={gate.code}
          onUnlocked={(code, members) => setGate({ screen: 'pick', code, members, showInvite: false })}
        />
      );
    case 'pick':
      return <PickMember code={gate.code} members={gate.members} showInvite={gate.showInvite} onPicked={() => void boot()} />;
  }

  if (!board) return null;

  return (
    <div className="app">
      <main className="page">
        {tab === 'board' && <Board board={board} onAction={act} onNudge={nudge} onShareWeek={shareWeek} pending={pending} />}
        {tab === 'ahead' && <Ahead board={board} />}
        {tab === 'scores' && <Scores board={board} />}
        {tab === 'house' && <House board={board} onSaved={setBoard} onSwitch={() => void switchPerson()} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="tabs" aria-label="Sections">
        {TABS.map((item) => (
          <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
