import { CHORES, type BoardState, type ChoreId, type ChoreState, type Member } from '../../shared/domain';
import type { ChoreAction } from '../api';
import { ChoreIcon } from '../components/ChoreIcon';
import { SplitFlap } from '../components/SplitFlap';
import { choreLabel, completedTime, daysLeftLabel, shortDate, weekRange } from '../format';

interface Props {
  board: BoardState;
  onAction: (chore: ChoreState, action: ChoreAction) => void;
  onNudge: (chore: ChoreState) => void;
  onShareWeek: () => void;
  pending: string | null;
}

const nameOf = (board: BoardState, id: number | null) =>
  board.members.find((member: Member) => member.id === id)?.name ?? 'Someone';

const keyOf = (chore: ChoreState) => `${chore.weekStart}/${chore.chore}`;

function nextTurn(board: BoardState): { chore: ChoreId; weekStart: string } | null {
  for (const week of board.upcoming) {
    for (const { id } of CHORES) {
      if (week.assignments[id] === board.meId) return { chore: id, weekStart: week.weekStart };
    }
  }
  return null;
}

function Hero({ board }: { board: BoardState }) {
  const mine = board.chores.filter((chore) => chore.assigneeId === board.meId);
  const open = mine.filter((chore) => !chore.completedAt);
  const allDone = board.chores.every((chore) => chore.completedAt);
  const coveredForMe = board.chores.filter(
    (chore) => chore.scheduledId === board.meId && chore.assigneeId !== board.meId,
  );

  let lead: string;
  let flaps: string;
  let tone: 'mine' | 'done' | 'off';
  let detail: string;

  if (open.length > 0) {
    lead = "You've got";
    flaps = open.map((chore) => choreLabel(chore.chore)).join(' + ');
    tone = 'mine';
    detail = `${daysLeftLabel(board.week.daysLeft)}. It's on you.`;
  } else if (mine.length > 0) {
    lead = "You're";
    flaps = 'Done';
    tone = 'done';
    detail = allDone ? 'Whole house is done. Rare scenes.' : 'Your part is handled. Feel free to judge the others.';
  } else if (coveredForMe.length > 0) {
    lead = "You're";
    flaps = 'Covered';
    tone = 'done';
    detail = coveredForMe
      .map((chore) => `${nameOf(board, chore.assigneeId)} ${chore.completedAt ? 'handled' : 'has'} ${choreLabel(chore.chore).toLowerCase()} for you.`)
      .join(' ');
  } else {
    const next = nextTurn(board);
    lead = "You're";
    flaps = 'Not it';
    tone = 'off';
    detail = next ? `Free week. Next up: ${choreLabel(next.chore).toLowerCase()}, week of ${shortDate(next.weekStart)}.` : 'Free week.';
  }

  return (
    <section className="hero">
      <p className="hero-lead">{lead}</p>
      <SplitFlap text={flaps} columns={Math.max(10, Array.from(flaps).length)} tone={tone} className="hero-flaps" />
      <p className="hero-detail">{detail}</p>
    </section>
  );
}

function ChoreRow({ board, chore, onAction, onNudge, pending }: { board: BoardState; chore: ChoreState } & Omit<Props, 'board' | 'onShareWeek'>) {
  const isMine = chore.assigneeId === board.meId;
  const done = Boolean(chore.completedAt);
  const busy = pending === keyOf(chore);
  const covered = chore.assigneeId !== chore.scheduledId;
  const coverer = isMine ? 'you' : nameOf(board, chore.assigneeId);
  const label = choreLabel(chore.chore);
  const meta = CHORES.find((item) => item.id === chore.chore)!;

  return (
    <li className={`row ${done ? 'is-done' : ''} ${isMine && !done ? 'is-mine' : ''}`}>
      <div className="row-head">
        <span className="row-chore"><ChoreIcon chore={chore.chore} /> {label}</span>
        <span className={`lamp ${done ? 'on' : ''}`}>{done ? 'Done' : 'Open'}</span>
      </div>
      {/* The board always shows whose turn it was. A cover is noted underneath, and the coverer gets the credit. */}
      <SplitFlap text={nameOf(board, chore.scheduledId)} tone={done ? 'done' : isMine && !covered ? 'mine' : 'default'} />
      {covered && (
        <div className="row-cover">
          <p className="row-note">Covered by <strong>{coverer}</strong></p>
          {!done && (
            <button className="link" disabled={busy} onClick={() => onAction(chore, 'uncover')} aria-label={`Undo cover on ${label}`}>
              Undo cover
            </button>
          )}
        </div>
      )}
      {done ? (
        <div className="row-foot">
          <p className="row-note">
            {completedTime(chore.completedAt!)}
            {chore.completedById !== chore.assigneeId && ` · ticked by ${nameOf(board, chore.completedById)}`}
          </p>
          <button className="link" disabled={busy} onClick={() => onAction(chore, 'undo')} aria-label={`Undo ${label}`}>Undo</button>
        </div>
      ) : isMine ? (
        <div className="row-actions">
          <button className="button primary grow" disabled={busy} onClick={() => onAction(chore, 'complete')}>{meta.doneLabel}</button>
        </div>
      ) : (
        <div className="row-actions">
          <button className="button grow" disabled={busy} onClick={() => onAction(chore, 'complete')} aria-label={`Mark ${label} done`}>Mark done</button>
          {!covered && (
            <button className="button" disabled={busy} onClick={() => onAction(chore, 'cover')} aria-label={`Cover ${label}`}>I'll cover</button>
          )}
          <button className="button" onClick={() => onNudge(chore)} aria-label={`Nudge about ${label}`}>Nudge</button>
        </div>
      )}
    </li>
  );
}

export function Board({ board, onAction, onNudge, onShareWeek, pending }: Props) {
  const off = board.members.filter((member) => !board.chores.some((chore) => chore.scheduledId === member.id));
  return (
    <>
      <div className="week-line">
        <span>{weekRange(board.week.start, board.week.end)}</span>
        <span>{daysLeftLabel(board.week.daysLeft)}</span>
      </div>
      <Hero board={board} />

      {board.looseEnds.length > 0 && (
        <section className="loose" aria-label="Unfinished from last week">
          <h2>Left over from last week</h2>
          <p>Counts as missed unless someone actually did it.</p>
          <ul>
            {board.looseEnds.map((chore) => (
              <li key={keyOf(chore)}>
                <span>
                  <strong>{choreLabel(chore.chore)}</strong> · {nameOf(board, chore.scheduledId)}
                  {chore.assigneeId !== chore.scheduledId && <span className="muted"> (covered by {nameOf(board, chore.assigneeId)})</span>}
                </span>
                <button className="button small" disabled={pending === keyOf(chore)} onClick={() => onAction(chore, 'complete')} aria-label={`Mark last week's ${choreLabel(chore.chore)} done`}>It got done</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="rows">
        {board.chores.map((chore) => (
          <ChoreRow key={keyOf(chore)} board={board} chore={chore} onAction={onAction} onNudge={onNudge} pending={pending} />
        ))}
        {off.map((member) => (
          <li key={member.id} className="row is-off">
            <div className="row-head"><span className="row-chore">Not it</span></div>
            <SplitFlap text={member.name} tone="off" />
          </li>
        ))}
      </ul>
      <button className="button wide" onClick={onShareWeek}>Send this week to the group chat</button>
    </>
  );
}
