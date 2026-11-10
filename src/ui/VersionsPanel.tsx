import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../model/store';
import { flushSave, validateProject } from '../model/persistence';
import { diffProjects } from '../model/diffProjects';
import {
  deleteVersion,
  externalizeImages,
  getResolvedVersion,
  importHistory,
  loadAllStored,
  nextVersionName,
  relativeTime,
  renameVersion,
  runJob,
  saveVersion,
  type VersionMeta,
} from '../model/versions';
import type { Project } from '../model/types';
import { useVersionsUi } from './versionsUi';

interface Row {
  meta: VersionMeta;
  project: Project;
  /** What changed since the entry before it (older). */
  summary: string[];
  first: boolean;
}

async function loadRows(units: 'metric' | 'imperial'): Promise<Row[] | undefined> {
  const all = await runJob('Could not read your versions.', (kv) => loadAllStored(kv));
  if (!all) return undefined;
  const rows = all.map((e, i) => ({
    meta: e.meta,
    project: e.project,
    first: i === 0,
    summary: i === 0 ? [] : diffProjects(all[i - 1].project, e.project, { units, max: 3 }),
  }));
  return rows.reverse(); // newest first
}

function displayName(m: VersionMeta): string {
  return m.name;
}

export function VersionsPanel() {
  const open = useVersionsUi((s) => s.open);
  if (!open) return null;
  return <PanelBody />;
}

function PanelBody() {
  const setOpen = useVersionsUi((s) => s.setOpen);
  const includeHistory = useVersionsUi((s) => s.includeHistory);
  const setIncludeHistory = useVersionsUi((s) => s.setIncludeHistory);
  const units = useStore((s) => s.units);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ id: string; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await loadRows(units);
    setRows(r ?? []);
    return r ?? [];
  }, [units]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const close = () => setOpen(false);

  const startSaving = () => {
    setName(nextVersionName((rows ?? []).map((r) => r.meta)));
    setSaving(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    const meta = await runJob('Could not save this version.', (kv) => saveVersion(kv, useStore.getState().project, { kind: 'named', name: clean }));
    setBusy(false);
    if (!meta) return;
    setSaving(false);
    useStore.getState().toast(`Saved “${clean}”.`);
    await refresh();
  };

  const restore = async (row: Row) => {
    if (busy) return;
    setBusy(true);
    const label = displayName(row.meta);
    // Save what she has now first; if that fails, nothing is replaced.
    const got = await runJob('Could not restore this version.', async (kv) => {
      const found = await getResolvedVersion(kv, row.meta.id);
      if (!found) throw new Error('missing');
      await saveVersion(kv, useStore.getState().project, { kind: 'auto', name: `Before restoring ${label}`, reason: `restoring ${label}` });
      return found;
    });
    if (!got) {
      setBusy(false);
      return;
    }
    const s = useStore.getState();
    s.loadProject(validateProject(got.version.project), { keepLevel: true });
    await flushSave();
    s.toast(`Restored ${label}. Your previous plan was saved as a version.`);
    if (got.missingImages > 0) s.toast('A plan picture from that version could not be found, so it was left out.', 'warn');
    setBusy(false);
    close();
  };

  const remove = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    await runJob('Could not delete this version.', (kv) => deleteVersion(kv, id));
    if (compare?.id === id) setCompare(null);
    await refresh();
  };

  const commitRename = async () => {
    if (!renaming) return;
    const { id, text } = renaming;
    setRenaming(null);
    if (!text.trim()) return;
    await runJob('Could not rename this version.', (kv) => renameVersion(kv, id, text));
    await refresh();
  };

  const toggleCompare = async (row: Row) => {
    if (compare?.id === row.meta.id) {
      setCompare(null);
      return;
    }
    // The plan on screen holds whole pictures; stored versions hold references, so match them up first.
    const now = await externalizeImages(useStore.getState().project, () => {});
    const lines = diffProjects(row.project, now.project, { units, max: 12 });
    setCompare({ id: row.meta.id, lines });
  };

  const clock = Date.now();

  return (
    <div className="modal-backdrop fixed" onPointerDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal versions" role="dialog" aria-label="Versions">
        <div className="versions-head">
          <h2>Versions</h2>
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
        <p>Saved copies of your whole plan. Restoring one never loses what you have now: it is saved first.</p>

        {saving ? (
          <form className="versions-save" onSubmit={save}>
            <label className="form-row">
              <span>Name this version</span>
              <input className="text-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Version name" />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setSaving(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!name.trim() || busy}>
                Save
              </button>
            </div>
          </form>
        ) : (
          <button className="btn primary" onClick={startSaving}>
            Save this version…
          </button>
        )}

        {rows === null && <p>Looking for your versions…</p>}
        {rows && rows.length === 0 && <p>No versions yet. Save one before a big change, or just carry on: Flat Planner also saves one before it deletes a wall, opens one up, or imports a file.</p>}

        <ul className="version-list" aria-label="Saved versions">
          {(rows ?? []).map((row) => {
            const m = row.meta;
            const isRenaming = renaming?.id === m.id;
            return (
              <li key={m.id} className={m.kind === 'named' ? 'version-row named' : 'version-row'} data-testid="version-row">
                <div className="version-main">
                  {isRenaming ? (
                    <input
                      className="text-field"
                      autoFocus
                      aria-label="New name"
                      value={renaming.text}
                      onChange={(e) => setRenaming({ id: m.id, text: e.target.value })}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') void commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <strong className="version-name">{displayName(m)}</strong>
                  )}
                  <span className="muted version-time">{relativeTime(m.createdAt, clock)}</span>
                  <ul className="version-changes">
                    {row.first ? (
                      <li className="muted">The earliest version kept.</li>
                    ) : row.summary.length === 0 ? (
                      <li className="muted">Same as the version before it.</li>
                    ) : (
                      row.summary.map((line, i) => <li key={i}>{line}</li>)
                    )}
                  </ul>
                  {compare?.id === m.id && (
                    <div className="version-compare" data-testid="version-compare">
                      <strong>Changed since this version</strong>
                      {compare.lines.length === 0 ? (
                        <p>Nothing. Your plan is the same as this version.</p>
                      ) : (
                        <ul>
                          {compare.lines.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <div className="version-actions">
                  <button className="btn" disabled={busy} onClick={() => void restore(row)}>
                    Restore
                  </button>
                  <button className="btn" onClick={() => void toggleCompare(row)}>
                    {compare?.id === m.id ? 'Hide comparison' : 'Compare with now'}
                  </button>
                  {m.kind === 'named' && (
                    <button className="btn" onClick={() => setRenaming({ id: m.id, text: m.name })}>
                      Rename
                    </button>
                  )}
                  <button className={confirmDelete === m.id ? 'btn danger' : 'btn'} onClick={() => void remove(m.id)} onBlur={() => setConfirmDelete(null)}>
                    {confirmDelete === m.id ? 'Click again to delete' : 'Delete'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <label className="check-row">
          <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} />
          <span>Include versions when saving a copy</span>
        </label>
        <p className="note">Used by File → Save a copy to my computer. The file gets bigger, but the whole history travels with it.</p>
      </div>
    </div>
  );
}

/** Shown after opening a saved plan that has versions in it. */
export function VersionImportPrompt() {
  const offer = useVersionsUi((s) => s.offer);
  const setOffer = useVersionsUi((s) => s.setOffer);
  const [busy, setBusy] = useState(false);
  if (!offer) return null;
  const n = offer.history.versions.length;
  const add = async () => {
    setBusy(true);
    const added = await runJob('Could not add the versions.', (kv) => importHistory(kv, offer.history));
    setBusy(false);
    setOffer(null);
    if (added !== undefined) {
      useStore.getState().toast(added === 0 ? 'Those versions were already here.' : `Added ${added} ${added === 1 ? 'version' : 'versions'} to your list.`);
    }
  };
  return (
    <div className="modal-backdrop fixed" onKeyDown={(e) => e.key === 'Escape' && setOffer(null)}>
      <div className="modal" role="dialog" aria-label="Add saved versions">
        <h2>This plan has saved versions</h2>
        <p>
          “{offer.planName}” came with {n} {n === 1 ? 'version' : 'versions'} of its history. Add {n === 1 ? 'it' : 'them'} to the Versions list in this browser?
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={() => setOffer(null)}>
            Not now
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void add()} autoFocus>
            Add them
          </button>
        </div>
      </div>
    </div>
  );
}
