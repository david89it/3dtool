import type { PackModel } from './model';
import { describeOpeningChange, removedWallLine } from '../compare';
import { Blank } from './shared';

export function CoverPage({ m }: { m: PackModel }) {
  const { project, units, floors, date, comparison, comparing, removed, versionLabel, anyChange } = m;
  return (
    <section className="print-page cover" data-testid="print-cover">
      <p className="print-kicker">Plans for the structural engineer and the landlord</p>
      <h1>{project.name}</h1>
      <p className="print-date">{date}</p>
      <h2>What we propose to change</h2>
      {!anyChange ? (
        <p>
          {comparing
            ? `Nothing has changed since ${versionLabel}. This pack shows the plans as they are.`
            : 'No new openings have been drawn yet. This pack shows the plans as they are.'}
        </p>
      ) : (
        floors
          .filter((f) => f.changes.length > 0)
          .map((f) => (
            <div key={f.levelId}>
              <h3>{f.name}</h3>
              <ul>
                {f.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))
      )}
      {comparison && (
        <div data-testid="print-comparison">
          <p className="print-small">Compared with {versionLabel}.</p>
          <h3>Walls removed</h3>
          {removed.length === 0 ? (
            <p>No walls are removed.</p>
          ) : (
            <ul data-testid="print-walls-removed">
              {removed.map((w) => (
                <li key={w.levelId + w.wallId}>{removedWallLine(w, units)}</li>
              ))}
            </ul>
          )}
          <h3>New or widened openings</h3>
          {comparison.openedUp.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {comparison.openedUp.map((c, i) => (
                <li key={i}>
                  {c.floor}: {describeOpeningChange(c, units)}
                </li>
              ))}
            </ul>
          )}
          <h3>Openings removed</h3>
          {comparison.removedOpenings.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {comparison.removedOpenings.map((c, i) => (
                <li key={i}>
                  {c.floor}: {describeOpeningChange(c, units)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Blank label="Prepared for" />
    </section>
  );
}
