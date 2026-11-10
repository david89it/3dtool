import { useStore } from '../model/store';

const ROWS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Everywhere',
    keys: [
      ['Ctrl/⌘ Z', 'Undo'],
      ['Ctrl/⌘ Shift Z or Ctrl Y', 'Redo'],
      ['Tab', 'Switch between the plan and 3D'],
      ['?', 'Show or hide this list'],
      ['Esc', 'Cancel, deselect, or close a window'],
    ],
  },
  {
    title: 'Plan (all 2D modes)',
    keys: [
      ['Drag empty floor', 'Move around the plan'],
      ['Space + drag', 'Move around the plan'],
      ['Scroll / two fingers', 'Move around the plan'],
      ['Pinch or Ctrl/⌘ + scroll', 'Zoom'],
      ['F', 'Fit the whole floor on screen'],
      ['V', 'Select and edit'],
      ['Delete or Backspace', 'Delete the selected wall, door, item, note or pin'],
      ['Alt (hold)', 'Turn snapping off while you draw or drag'],
    ],
  },
  {
    title: 'Trace',
    keys: [
      ['W', 'Draw walls'],
      ['Enter or double-click', 'Finish the wall you are drawing'],
      ['Double-click a wall', 'Split it in two'],
      ['Esc (while placing a note)', 'Cancel the note, measurement or arrow'],
    ],
  },
  {
    title: 'Furnish',
    keys: [
      ['R / Shift R', 'Turn the selected item 90° right / left'],
      ['Ctrl/⌘ D', 'Duplicate the selected item'],
      ['Alt + rotate handle', 'Turn freely instead of in 90° steps'],
    ],
  },
  {
    title: '3D walk',
    keys: [
      ['W A S D or arrows', 'Walk'],
      ['Mouse (after a click)', 'Look around'],
      ['Esc', 'Free the mouse'],
    ],
  },
];

export function Shortcuts() {
  const open = useStore((s) => s.shortcutsOpen);
  if (!open) return null;
  const close = () => useStore.getState().setShortcutsOpen(false);
  return (
    <div className="modal-backdrop fixed" onPointerDown={close}>
      <div className="modal shortcuts" role="dialog" aria-label="Keyboard shortcuts" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>Keyboard shortcuts</h2>
          <button className="btn" onClick={close} aria-label="Close shortcuts">
            Close
          </button>
        </div>
        <div className="shortcut-grid">
          {ROWS.map((r) => (
            <section key={r.title}>
              <h3>{r.title}</h3>
              <dl>
                {r.keys.map(([k, v]) => (
                  <div key={k} className="shortcut-row">
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="note">On an iPad: drag with one finger to move the plan, pinch to zoom, tap to select. The Apple Pencil works like a mouse.</p>
      </div>
    </div>
  );
}
