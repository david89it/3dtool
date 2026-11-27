import type { PackModel } from './model';
import { IMG_W, IMG_H } from '../usePackState';

export function FloorPlanPages({ m }: { m: PackModel }) {
  const { printableFloors, comparing, images } = m;
  return (
    <>
      {printableFloors.map((f) => (
        <section key={f.levelId} className="print-page floor" data-testid="print-floor-page">
          <h2>{f.name}</h2>
          <div className="print-plan" style={{ aspectRatio: `${IMG_W} / ${IMG_H}` }}>
            {images[f.levelId] ? (
              <img src={images[f.levelId]!} alt={`Plan of the ${f.name}`} />
            ) : (
              <p className="print-wait">{f.levelId in images ? 'This floor could not be drawn.' : 'Drawing the plan…'}</p>
            )}
          </div>
          <p className="print-legend">
            Lengths are inside faces of the walls. A ⚠ pin marks an opening that may be structural.
            {comparing && ' Dashed red outlines show walls that are taken out.'} The scale bar is correct at any print size.
          </p>
        </section>
      ))}
    </>
  );
}
