import { useSiteMeasure } from './state';
import './sitemeasure.css';

/** How to scan the flat with a LiDAR phone or tablet and bring it in. */
export function ScanGuide() {
  const open = useSiteMeasure((s) => s.guideOpen);
  const setOpen = useSiteMeasure((s) => s.setGuideOpen);
  const setImportOpen = useSiteMeasure((s) => s.setImportOpen);
  if (!open) return null;
  return (
    <div className="modal-backdrop fixed sm-front" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal sm-guide" role="dialog" aria-label="Scan with LiDAR">
        <h2>Scan the flat with an iPhone or iPad Pro</h2>
        <p>
          Recent iPhone Pro and iPad Pro models have a LiDAR sensor. Apps built on Apple’s RoomPlan use it to measure walls,
          doors and windows as you walk round a room. A scan is quick, and usually accurate to a few centimetres.
        </p>
        <h3>Apps to try</h3>
        <ul>
          <li>
            <strong>Polycam</strong>: use its Room mode.
          </li>
          <li>
            <strong>3D Scanner App</strong>: use its Room scan.
          </li>
          <li>
            <strong>Canvas</strong>: made for home renovation scans.
          </li>
        </ul>
        <p className="note">Free versions and export options change; check the app’s export options before you scan the whole flat.</p>
        <h3>Three steps</h3>
        <ol>
          <li>Scan one room at a time, slowly, with doors open. Point at every corner, door and window.</li>
          <li>
            Export as <strong>USDZ</strong> (the RoomPlan model) if the app offers it. Otherwise export a <strong>DXF</strong>, or a
            floor plan as an image or PDF.
          </li>
          <li>Send the file to the computer or iPad you plan on, then choose “Import a scan…” here, on the right floor.</li>
        </ol>
        <p className="note">
          A USDZ scan becomes walls, doors and windows. A DXF is drawn under your plan for tracing. An image or PDF becomes the plan
          picture, ready to set its scale.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setOpen(false);
              setImportOpen(true);
            }}
          >
            Import a scan…
          </button>
        </div>
      </div>
    </div>
  );
}
