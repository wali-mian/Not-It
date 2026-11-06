import { useState, type FormEvent } from 'react';
import { ROSTER_SIZE, NAME_MAX, type Member } from '../../shared/domain';
import { api, ApiError } from '../api';
import { SplitFlap } from '../components/SplitFlap';
import { shareText } from '../format';

function Masthead({ subtitle }: { subtitle: string }) {
  return (
    <header className="masthead">
      <SplitFlap text="Not it" columns={6} className="masthead-flaps" tone="mine" />
      <p>{subtitle}</p>
    </header>
  );
}

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong.');

export function Setup({ onDone }: { onDone: (code: string, members: Member[]) => void }) {
  const [houseName, setHouseName] = useState('Haven');
  const [names, setNames] = useState<string[]>(Array(ROSTER_SIZE).fill(''));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { members } = await api.setup({ houseName, code, members: names });
      onDone(code, members);
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <Masthead subtitle="Milk, trash, broom. One person each, every week, no arguments." />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>House name</span>
          <input value={houseName} onChange={(e) => setHouseName(e.target.value)} maxLength={24} required />
        </label>
        <fieldset className="field">
          <legend>The roommates</legend>
          <p className="hint">This order sets the rotation. First person gets milk this week, second gets trash, third gets broom, fourth is not it.</p>
          {names.map((name, index) => (
            <input
              key={index}
              aria-label={`Roommate ${index + 1}`}
              placeholder={`Roommate ${index + 1}`}
              value={name}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              autoComplete="off"
              required
              onChange={(e) => setNames(names.map((old, i) => (i === index ? e.target.value : old)))}
            />
          ))}
        </fieldset>
        <label className="field">
          <span>House code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            minLength={6}
            maxLength={64}
            autoCapitalize="off"
            autoComplete="off"
            placeholder="At least 6 characters"
            required
          />
          <p className="hint">Everyone uses this once to get in. It can't be recovered, so pick one you'll remember.</p>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary large" disabled={busy}>{busy ? 'Setting up' : 'Start the board'}</button>
      </form>
    </main>
  );
}

export function Unlock({
  houseName,
  initialCode = '',
  onUnlocked,
}: {
  houseName: string | null;
  initialCode?: string;
  onUnlocked: (code: string, members: Member[]) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { members } = await api.checkCode(code);
      onUnlocked(code, members);
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <Masthead subtitle={houseName ? `${houseName}'s chore board` : 'Chore board'} />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>House code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="off"
            autoComplete="off"
            autoFocus
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary large" disabled={busy}>{busy ? 'Checking' : 'Open the board'}</button>
      </form>
    </main>
  );
}

export function PickMember({
  code,
  members,
  showInvite,
  onPicked,
}: {
  code: string;
  members: Member[];
  showInvite: boolean;
  onPicked: () => void;
}) {
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  async function pick(member: Member) {
    setError('');
    try {
      await api.signIn(code, member.id);
      onPicked();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function invite() {
    const link = `${location.origin}/#join=${encodeURIComponent(code)}`;
    const result = await shareText(`Chore board for the house. Tap to join, then pick your name: ${link}`);
    if (result === 'copied') setNote('Invite link copied.');
    if (result === 'failed') setNote(link);
  }

  return (
    <main className="onboarding">
      <Masthead subtitle="Which one are you?" />
      <div className="pick-list">
        {members.map((member) => (
          <button key={member.id} className="pick" onClick={() => pick(member)}>
            <SplitFlap text={member.name} />
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {showInvite && (
        <section className="invite">
          <h2>Bring the others in</h2>
          <p>This link has the house code in it, so send it to your roommates only.</p>
          <button className="button" onClick={invite}>Send invite link</button>
          {note && <p className="hint break" role="status">{note}</p>}
        </section>
      )}
    </main>
  );
}
