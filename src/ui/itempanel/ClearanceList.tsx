import type { CatalogueItem } from '../../model/types';
import { useStore } from '../../model/store';
import { formatLength } from '../../model/units';

export function ClearanceList({ cat }: { cat: CatalogueItem }) {
  const units = useStore((s) => s.units);
  return (
    <>
      {cat.clearance.length > 0 && (
        <div className="field column">
          <span className="field-label">Space it needs</span>
          <ul className="clearance-list">
            {cat.clearance.map((c, i) => (
              <li key={i}>
                <strong>{c.side === 'all' ? 'All round' : c.side === 'front' ? 'In front' : c.side === 'back' ? 'Behind' : 'At the side'}:</strong>{' '}
                {c.reason}. At least {formatLength(c.min, units)}
                {c.ideal > c.min ? `, ideally ${formatLength(c.ideal, units)}` : ''}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
