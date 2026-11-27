import type { PackModel } from './model';
import { formatLength } from '../../model/units';
import { Blank } from './shared';

export function LandlordPage({ m }: { m: PackModel }) {
  const { project, units, removed, anyChange, allChanges, hasStructural } = m;
  return (
    <section className="print-page flow" data-testid="print-landlord">
      <h2>Landlord’s licence for alterations</h2>
      <p>
        We are asking for the landlord’s licence to carry out the work below at <strong>{project.name}</strong>.
      </p>
      <h3>Summary of the works</h3>
      {!anyChange ? (
        <p>No changes to walls have been drawn yet.</p>
      ) : (
        <ul>
          {removed.map((w) => (
            <li key={w.levelId + w.wallId}>
              <strong>{w.floor}:</strong> Remove the {w.location.charAt(0).toLowerCase() + w.location.slice(1)} ({formatLength(w.length, units)} long).
            </li>
          ))}
          {allChanges.map((c, i) => (
            <li key={i}>
              <strong>{c.floor}:</strong> {c.text}
            </li>
          ))}
        </ul>
      )}
      {(hasStructural || removed.some((w) => w.needsEngineer)) && (
        <p>
          Some of this work may involve load-bearing walls. A structural engineer will check them, and Building
          Control will be told before work starts. The engineer’s page is attached.
        </p>
      )}
      <div className="print-blanks">
        <Blank label="Freeholder / landlord" />
        <Blank label="Lease reference" />
        <Blank label="Contractor" />
      </div>
    </section>
  );
}
