import { useState, type FormEvent } from 'react';
import { NAME_MAX, type BoardState, type Member } from '../../shared/domain';
import { api, ApiError } from '../api';
import { shareText } from '../format';

function RenameRow({ member, isMe, onSaved }: { member: Member; isMe: boolean; onSaved: (board: BoardState) => void }) {
  const [name, setName] = useState(member.name);
  const [error, setError] = useState('');
  const changed = name.trim() !== member.name;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      onSaved(await api.rename(member.id, name));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save.');
    }
  }

  return (
    <form className="rename" onSubmit={save}>
      <input aria-label={`Name for ${member.name}`} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
      {isMe && !changed && <span className="you">You</span>}
      {changed && <button className="button small primary">Save</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

export function House({ board, onSaved, onSwitch }: { board: BoardState; onSaved: (board: BoardState) => void; onSwitch: () => void }) {
  const [note, setNote] = useState('');

  async function shareLink() {
    const result = await shareText(`Chore board for the house: ${location.origin}`);
    if (result === 'copied') setNote('Link copied. They still need the house code.');
  }

  const isIos = /iPhone|iPad/.test(navigator.userAgent);

  return (
    <>
      <h1 className="page-title">{board.houseName}</h1>
      <h2 className="section-title">Roommates</h2>
      <div className="stack">
        {board.members.map((member) => (
          <RenameRow key={member.id} member={member} isMe={member.id === board.meId} onSaved={onSaved} />
        ))}
      </div>
      <h2 className="section-title">Put it on your home screen</h2>
      <p className="page-sub">
        {isIos
          ? 'In Safari, tap Share, then Add to Home Screen. It opens like a normal app.'
          : 'In your browser menu, choose Add to Home Screen or Install. It opens like a normal app.'}
      </p>
      <h2 className="section-title">Sharing</h2>
      <div className="stack">
        <button className="button wide" onClick={shareLink}>Share the board link</button>
        {note && <p className="hint" role="status">{note}</p>}
        <button className="button wide" onClick={onSwitch}>Not you? Switch person</button>
      </div>
    </>
  );
}
