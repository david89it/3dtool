import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { isBlankProject } from '../model/firstRun';
import { shouldRemind, snoozeReminder, useReminder } from '../model/copyReminder';
import { useTabRole } from '../model/tabLock';
import { saveCopyToFile } from './saveCopy';

/** A small, calm reminder to keep a copy in her files. Never on an empty plan, never while the tour or another tab's overlay is up. */
export function CopyReminder() {
  const state = useReminder((s) => s.state);
  const blank = useStore((s) => isBlankProject(s.project));
  const tour = useStore((s) => s.tourStep);
  const role = useTabRole((s) => s.role);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (tour !== null || role === 'viewer' || role === 'claiming' || !shouldRemind(state, Math.max(now, Date.now()), blank)) return null;
  return (
    <div className="copy-reminder" role="region" aria-label="Save a copy reminder" data-testid="copy-reminder">
      <p>Your plan lives only in this browser. Save a copy to your files now and then.</p>
      <div className="copy-reminder-actions">
        <button className="btn primary" title="Save the plan as a file on your computer" onClick={() => void saveCopyToFile()}>
          Save a copy
        </button>
        <button className="btn" title="Ask again in 3 days" onClick={() => snoozeReminder()}>
          Later
        </button>
      </div>
    </div>
  );
}
