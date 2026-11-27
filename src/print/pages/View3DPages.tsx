import type { PackModel } from './model';

export function View3DPages({ m }: { m: PackModel }) {
  const { printableFloors, comparison, shots, chosenId, chosenMeta } = m;
  return (
    <>
      {printableFloors.map((f) => {
        const afterKey = `after:${f.levelId}`;
        const beforeKey = `before:${chosenId}:${f.levelId}`;
        const pair = !!comparison && comparison.changedLevelIds.includes(f.levelId);
        const pic = (key: string, label: string) => (
          <figure className="print-shot">
            <div className="print-plan print-3d">
              {shots[key] ? (
                <img src={shots[key]!} alt={label} />
              ) : (
                <p className="print-wait">{key in shots ? 'The 3D picture could not be drawn.' : 'Preparing 3D views…'}</p>
              )}
            </div>
            <figcaption className="print-legend">{label}</figcaption>
          </figure>
        );
        return (
          <section key={f.levelId} className="print-page floor" data-testid="print-3d">
            <h2>3D view: {f.name}</h2>
            {pair ? (
              <div className="print-pair">
                {pic(beforeKey, `Before (${chosenMeta?.name ?? 'saved version'})`)}
                {pic(afterKey, 'After (the plan now)')}
              </div>
            ) : (
              pic(afterKey, `The ${f.name}, seen from above with the walls cut away.`)
            )}
          </section>
        );
      })}
    </>
  );
}
