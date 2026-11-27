import type { Level } from '../../model/types';
import { useStore } from '../../model/store';

export function MarkerPanel({ level, markerId }: { level: Level; markerId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const m = (level.markers ?? []).find((x) => x.id === markerId);
  if (!m) return null;
  return (
    <div className="panel-section">
      <h2>To measure</h2>
      <p className="marker-text">{m.text}</p>
      <div className="actions">
        <button
          className="btn primary"
          onClick={() => {
            editLevel('Remove pin', (L) => {
              L.markers = (L.markers ?? []).filter((x) => x.id !== markerId);
            });
            select(null);
          }}
        >
          Done, remove pin
        </button>
      </div>
    </div>
  );
}
