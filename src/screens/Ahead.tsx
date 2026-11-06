import { CHORES, type BoardState } from '../../shared/domain';
import { shortDate } from '../format';

export function Ahead({ board }: { board: BoardState }) {
  const nameOf = (id: number) => board.members.find((member) => member.id === id)?.name ?? '';
  const mine = (id: number) => (id === board.meId ? 'me' : undefined);
  const firstOff = board.upcoming.find((week) => week.offIds.includes(board.meId));

  return (
    <>
      <h1 className="page-title">The road ahead</h1>
      <p className="page-sub">
        Fixed rotation, so everyone does each chore once every 4 weeks.
        {firstOff && ` Your next free week starts ${shortDate(firstOff.weekStart)}.`}
      </p>
      <table className="ahead">
        <thead>
          <tr>
            {CHORES.map((chore) => <th key={chore.id} scope="col">{chore.label}</th>)}
            <th scope="col">Not it</th>
          </tr>
        </thead>
        {board.upcoming.map((week) => (
          <tbody key={week.weekStart}>
            <tr className="ahead-week"><th colSpan={4} scope="rowgroup">Week of {shortDate(week.weekStart)}</th></tr>
            <tr>
              {CHORES.map((chore) => (
                <td key={chore.id} className={mine(week.assignments[chore.id])}>{nameOf(week.assignments[chore.id])}</td>
              ))}
              <td className={`off ${week.offIds.includes(board.meId) ? 'me' : ''}`}>{week.offIds.map(nameOf).join(', ')}</td>
            </tr>
          </tbody>
        ))}
      </table>
      <p className="hint">Covers only change the week they happen in. The rotation carries on as normal after.</p>
    </>
  );
}
