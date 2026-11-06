import type { ChoreId } from '../../shared/domain';

const paths: Record<ChoreId, React.ReactNode> = {
  milk: (
    <>
      <path d="M7 9.5 9 5h6l2 4.5V21H7z" />
      <path d="M9 5V3h6v2M7 9.5h10M7 14h10" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4h5v3" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  broom: (
    <>
      <path d="M20 3 12.5 11.5" />
      <path d="M12.5 11.5 15 14 10.5 21c-2.5-.5-6-3-7.5-6.5z" />
      <path d="M7 19l2.5-3.5M4.8 16.8l3-2.8" />
    </>
  ),
};

export function ChoreIcon({ chore }: { chore: ChoreId }) {
  return (
    <svg className="chore-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[chore]}
    </svg>
  );
}
