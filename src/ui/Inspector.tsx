import { countRender } from '../perf';
import { useLevel, useStore } from '../model/store';
import { AdvicePanel } from './AdvicePanel';
import { OpeningPanel } from './OpeningPanel';
import { ItemPanel } from './ItemPanel';
import { MultiPanel } from './MultiPanel';
import { STRUCTURAL_DELETE_WARNING } from '../editor2d/contextActions';
import { WallPanel } from './inspector/WallPanel';
import { RoomPanel } from './inspector/RoomPanel';
import { MarkerPanel } from './inspector/MarkerPanel';
import { NotePanel } from './inspector/NotePanel';
import { LevelPanel } from './inspector/LevelPanel';

export { STRUCTURAL_DELETE_WARNING };

export function Inspector() {
  countRender('Inspector');
  const level = useLevel();
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  if (!level) return null;
  if (mode === 'advice') return <AdvicePanel />;
  let body;
  if (selection?.kind === 'wall') {
    const w = level.walls.find((x) => x.id === selection.id);
    body = w ? <WallPanel level={level} wall={w} /> : null;
  } else if (selection?.kind === 'room') body = <RoomPanel level={level} roomId={selection.id} />;
  else if (selection?.kind === 'marker') body = <MarkerPanel level={level} markerId={selection.id} />;
  else if (selection?.kind === 'note') body = <NotePanel level={level} noteId={selection.id} />;
  else if (selection?.kind === 'opening') body = <OpeningPanel level={level} openingId={selection.id} />;
  else if (selection?.kind === 'item') body = <ItemPanel level={level} itemId={selection.id} />;
  else if (selection?.kind === 'items') body = <MultiPanel level={level} ids={selection.ids} />;
  return (
    <aside className="inspector" aria-label="Details">
      {body ?? <LevelPanel level={level} />}
    </aside>
  );
}
