import { formatLength } from '../../model/units';
import type { StructuralRow } from '../pack';

export function Blank({ label }: { label: string }) {
  return (
    <p className="print-blank">
      <span>{label}:</span>
      <span className="print-line" aria-hidden />
    </p>
  );
}

export function pier(r: StructuralRow, side: 'before' | 'after', units: 'metric' | 'imperial'): string {
  const mm = side === 'before' ? r.pierBefore : r.pierAfter;
  const where = side === 'before' ? r.sideBefore : r.sideAfter;
  return `${formatLength(mm, units)} on the ${where}`;
}
