import { useMemo } from 'react';
import type { Level, Opening, OpeningType, Wall } from '../model/types';
import { useStore } from '../model/store';
import { computeJoints } from '../geometry/joints';
import {
  endDistances,
  findOpening,
  isStructural,
  MIN_NIB,
  nibShortfall,
  OPENING_DEFAULTS,
  OPENING_LABEL,
  STRUCTURAL_BADGE_TEXT,
  usableRange,
} from '../geometry/openings';
import { deleteOpening, editOpening, type OpeningField } from '../geometry/openingEdits';
import { nodePos } from '../geometry/wallGraph';
import { formatLength } from '../model/units';
import { EditableLength } from './EditableLength';

/** Name the wall's two ends the way she sees them on screen. */
function endNames(level: Level, wall: Wall): [string, string] {
  const a = nodePos(level, wall.a);
  const b = nodePos(level, wall.b);
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) return a.x <= b.x ? ['left', 'right'] : ['right', 'left'];
  return a.y <= b.y ? ['top', 'bottom'] : ['bottom', 'top'];
}

const TYPES: OpeningType[] = ['door', 'window', 'opening', 'bayWindow'];

export function OpeningPanel({ level, openingId }: { level: Level; openingId: string }) {
  const editLevel = useStore((s) => s.editLevel);
  const select = useStore((s) => s.select);
  const units = useStore((s) => s.units);
  const found = findOpening(level, openingId);
  const range = useMemo(() => (found ? usableRange(computeJoints(level), found.wall.id) : null), [level, found]);
  if (!found || !range) return null;
  const { wall, opening } = found;
  const [nameA, nameB] = endNames(level, wall);
  const gaps = endDistances(range, opening);
  const fmt = (mm: number) => formatLength(mm, units);
  const shortPier = nibShortfall(wall, range, opening);

  /** Try the edit on a copy first so a refused value leaves no undo step. */
  const tryEdit = (field: OpeningField) => (mm: number) => editOpening(structuredClone(level) as Level, openingId, field, mm, fmt);
  const applyEdit = (field: OpeningField, label: string) => (mm: number) =>
    editLevel(label, (L) => void editOpening(L as Level, openingId, field, mm, fmt));
  const change = (label: string, fn: (o: Opening) => void) =>
    editLevel(label, (L) => {
      const f = findOpening(L as Level, openingId);
      if (f) fn(f.opening);
    });

  return (
    <div className="panel-section" data-testid="opening-panel">
      <h2>{OPENING_LABEL[opening.type]}</h2>
      <div className="segmented" role="radiogroup" aria-label="Type of opening">
        {TYPES.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={opening.type === t}
            className={opening.type === t ? 'on' : ''}
            onClick={() =>
              change('Change opening type', (o) => {
                o.type = t;
                if (t === 'door') o.swing ??= { hinge: 'start', side: 'left', angle: 90 };
                else delete o.swing;
                o.sill = OPENING_DEFAULTS[t].sill;
                if (o.height < OPENING_DEFAULTS[t].height && t !== 'window') o.height = OPENING_DEFAULTS[t].height;
              })
            }
          >
            {OPENING_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="field">
        <span className="field-label">Width</span>
        <EditableLength
          label="Opening width"
          value={opening.width}
          estimated={opening.estimated}
          min={200}
          validate={tryEdit('width')}
          onChange={applyEdit('width', 'Change opening width')}
        />
      </div>
      <div className="field">
        <span className="field-label">Wall to the {nameA}</span>
        <EditableLength
          label={`Wall to the ${nameA}`}
          value={gaps.before}
          estimated={opening.estimated}
          min={0}
          validate={tryEdit('before')}
          onChange={applyEdit('before', 'Move opening')}
        />
      </div>
      <div className="field">
        <span className="field-label">Wall to the {nameB}</span>
        <EditableLength
          label={`Wall to the ${nameB}`}
          value={gaps.after}
          estimated={opening.estimated}
          min={0}
          validate={tryEdit('after')}
          onChange={applyEdit('after', 'Move opening')}
        />
      </div>
      <div className="field">
        <span className="field-label">Height</span>
        <EditableLength
          label="Opening height"
          value={opening.height}
          estimated={opening.estimated}
          min={300}
          max={4000}
          validate={tryEdit('height')}
          onChange={applyEdit('height', 'Change opening height')}
        />
      </div>
      {(opening.type === 'window' || opening.type === 'bayWindow') && (
        <div className="field">
          <span className="field-label">Sill above the floor</span>
          <EditableLength
            label="Sill height"
            value={opening.sill}
            estimated={opening.estimated}
            min={0}
            max={3000}
            validate={tryEdit('sill')}
            onChange={applyEdit('sill', 'Change sill height')}
          />
        </div>
      )}

      {opening.type === 'door' && opening.swing && (
        <div className="field column">
          <span className="field-label">Door swing</span>
          <div className="actions">
            <button
              className="btn"
              onClick={() => change('Swap door hinge', (o) => o.swing && (o.swing.hinge = o.swing.hinge === 'start' ? 'end' : 'start'))}
            >
              Hinge on the other side
            </button>
            <button
              className="btn"
              onClick={() => change('Swing door the other way', (o) => o.swing && (o.swing.side = o.swing.side === 'left' ? 'right' : 'left'))}
            >
              Open into the other room
            </button>
          </div>
        </div>
      )}

      {isStructural(wall) && (
        <div className="warn-box">
          {!opening.existing && <p data-testid="structural-badge">⚠ {STRUCTURAL_BADGE_TEXT}</p>}
          {opening.existing && <p>This was already in the flat. Making it wider or moving it counts as a new structural opening.</p>}
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!opening.nibOverride}
              onChange={(e) => {
                const v = e.target.checked;
                change(v ? 'Allow narrow piers' : 'Keep 10 cm piers', (o) => {
                  if (v) o.nibOverride = true;
                  else delete o.nibOverride;
                });
              }}
            />
            Allow less than {fmt(MIN_NIB)} of wall either side
          </label>
          {shortPier && (
            <p>
              <strong>Narrow pier.</strong> Less than {fmt(MIN_NIB)} of wall is left beside this opening. A steel
              beam needs something to sit on: check this with the engineer.
            </p>
          )}
        </div>
      )}

      {opening.estimated && (
        <div className="estimate-box">
          <p>≈ Size and position estimated from the agent's plan.</p>
          <button className="btn small" onClick={() => change('Confirm measurements', (o) => void (o.estimated = false))}>
            I've measured this
          </button>
        </div>
      )}

      <div className="actions">
        <button className="btn" onClick={() => select({ kind: 'wall', id: wall.id })}>
          Select its wall
        </button>
        <button
          className="btn danger"
          onClick={() => {
            editLevel(`Remove ${OPENING_LABEL[opening.type].toLowerCase()}`, (L) => deleteOpening(L as Level, openingId));
            select(null);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
