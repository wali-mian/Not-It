import type { BoardState } from '../../shared/domain';
import { ChoreIcon } from '../components/ChoreIcon';
import { choreLabel, shortDate } from '../format';

export function Scores({ board }: { board: BoardState }) {
  const nameOf = (id: number) => board.members.find((member) => member.id === id)?.name ?? '';
  const started = board.stats.some((stat) => stat.reliability !== null);

  return (
    <>
      <h1 className="page-title">The receipts</h1>
      <p className="page-sub">Ranked by share of chores actually done. Unfinished chores count as missed once the week ends.</p>
      {!started && <p className="empty">Nothing on the record yet. Check off the first chore to start the table.</p>}
      <ol className="scores">
        {board.stats.map((stat, index) => (
          <li key={stat.memberId} className={stat.memberId === board.meId ? 'me' : undefined}>
            <span className="rank">{index + 1}</span>
            <div className="score-main">
              <strong>{nameOf(stat.memberId)}</strong>
              <span className="score-line">
                {stat.done} done · {stat.missed} missed
                {stat.late > 0 && ` · ${stat.late} late`}
                {stat.covers > 0 && ` · ${stat.covers} covered`}
                {stat.streak > 1 && ` · ${stat.streak} in a row`}
              </span>
            </div>
            <span className="score-pct">{stat.reliability === null ? '–' : `${stat.reliability}%`}</span>
          </li>
        ))}
      </ol>

      {board.history.length > 0 && <h2 className="section-title">Past weeks</h2>}
      <ul className="history">
        {board.history.map((week) => (
          <li key={week.weekStart}>
            <h3>Week of {shortDate(week.weekStart)}</h3>
            <ul>
              {week.chores.map((chore) => (
                <li key={chore.chore} className={chore.completedAt ? 'hit' : 'miss'}>
                  <ChoreIcon chore={chore.chore} />
                  <span className="sr-only">{choreLabel(chore.chore)}: </span>
                  <span className="history-name">
                    {nameOf(chore.scheduledId)}
                    {chore.assigneeId !== chore.scheduledId && <small> covered by {nameOf(chore.assigneeId)}</small>}
                  </span>
                  <span className="history-status">{chore.completedAt ? (chore.late ? 'Late' : 'Done') : 'Missed'}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
