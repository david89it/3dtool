import type { PackModel } from './model';
import { formatLength } from '../../model/units';
import { STRUCTURAL_BADGE_TEXT } from '../../geometry/openings';
import { engineerLine } from '../compare';
import { KIND_LABEL } from '../pack';
import { pier } from './shared';

export function StructuralPage({ m }: { m: PackModel }) {
  const { units, rows, comparison, removed, versionLabel, checklist, hasStructural } = m;
  return (
    <section className="print-page flow" data-testid="print-structural">
      <h2>Structural</h2>
      <p className="print-callout">⚠ {STRUCTURAL_BADGE_TEXT}</p>
      {comparison && (
        <div data-testid="print-removed-table">
          <h3>Walls removed</h3>
          {removed.length === 0 ? (
            <p>No walls are removed compared with {versionLabel}.</p>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Floor</th>
                  <th>Where</th>
                  <th>Wall</th>
                  <th>Length</th>
                  <th>Thickness</th>
                  <th>Structural note</th>
                </tr>
              </thead>
              <tbody>
                {removed.map((w) => (
                  <tr key={w.levelId + w.wallId} data-testid="removed-wall-row">
                    <td>{w.floor}</td>
                    <td>{w.location}</td>
                    <td>{KIND_LABEL[w.kind]}</td>
                    <td>{formatLength(w.length, units)}</td>
                    <td>{formatLength(w.thickness, units)}</td>
                    <td>
                      {w.note}
                      <br />
                      <strong>{engineerLine(w)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>New openings</h3>
        </div>
      )}
      {hasStructural ? (
        <table className="print-table">
          <thead>
            <tr>
              <th>Floor</th>
              <th>Where</th>
              <th>Wall</th>
              <th>Thickness</th>
              <th>Opening</th>
              <th>Pier, first side</th>
              <th>Pier, second side</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.openingId}>
                <td>{r.floor}</td>
                <td>{r.location}</td>
                <td>
                  {r.wallType}
                  <br />
                  <span className="print-small">{r.structuralLabel}</span>
                </td>
                <td>{formatLength(r.thickness, units)}</td>
                <td>
                  {r.openingType}: {formatLength(r.openingWidth, units)} wide, {formatLength(r.openingHeight, units)} high
                </td>
                <td>{pier(r, 'before', units)}</td>
                <td>{pier(r, 'after', units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No structural openings are marked on the plan yet. Open up a wall in Openings mode and it will be listed here.</p>
      )}
      {hasStructural && <p className="print-small">A pier is the wall left standing beside an opening.</p>}
      <h3>Things the engineer should confirm</h3>
      <ul>
        {checklist.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
