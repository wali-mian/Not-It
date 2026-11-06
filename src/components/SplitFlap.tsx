import { useEffect, useRef, useState } from 'react';

const SPIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const STEP_MS = 75;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function FlapTile({ target, delay }: { target: string; delay: number }) {
  const [{ current, previous, tick }, setFace] = useState({ current: ' ', previous: ' ', tick: 0 });
  const shown = useRef(' ');

  useEffect(() => {
    if (shown.current === target) return;
    if (reducedMotion()) {
      shown.current = target;
      setFace((face) => ({ current: target, previous: target, tick: face.tick }));
      return;
    }
    const spins = 2 + Math.floor(Math.random() * 4);
    const sequence = Array.from(
      { length: spins },
      () => SPIN[Math.floor(Math.random() * SPIN.length)],
    );
    sequence.push(target);
    const timers = sequence.map((char, index) =>
      window.setTimeout(() => {
        const before = shown.current;
        shown.current = char;
        setFace((face) => ({ current: char, previous: before, tick: face.tick + 1 }));
      }, delay + index * STEP_MS),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [target, delay]);

  return (
    <span className="tile" aria-hidden="true">
      <span className="half top"><span>{current}</span></span>
      <span className="half bottom"><span>{previous}</span></span>
      {tick > 0 && current !== previous && (
        <span key={tick}>
          <span className="half top fold-out"><span>{previous}</span></span>
          <span className="half bottom fold-in"><span>{current}</span></span>
        </span>
      )}
    </span>
  );
}

export function SplitFlap({
  text,
  columns = 10,
  tone = 'default',
  className = '',
}: {
  text: string;
  columns?: number;
  tone?: 'default' | 'mine' | 'done' | 'off';
  className?: string;
}) {
  const chars = Array.from(text.toUpperCase()).slice(0, columns);
  while (chars.length < columns) chars.push(' ');
  return (
    <div
      className={`flap-row tone-${tone} ${className}`}
      role="text"
      aria-label={text}
      style={{ '--cols': columns } as React.CSSProperties}
    >
      <div className="flap-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {chars.map((char, index) => (
          <FlapTile key={index} target={char} delay={index * 40} />
        ))}
      </div>
    </div>
  );
}
