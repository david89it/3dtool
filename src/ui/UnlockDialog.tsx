import { useEffect, useRef, useState, type FormEvent } from 'react';
import { create } from 'zustand';
import { useStore } from '../model/store';
import { flushSave, validateProject } from '../model/persistence';
import { fetchSeedFile, NO_FLAT_MESSAGE, openSeedFlat, WrongPasswordError } from '../model/seedCrypto';
import { isBlankProject } from '../model/firstRun';

interface UnlockState {
  /** Is there an encrypted flat on this site? null until we have looked. */
  available: boolean | null;
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const useUnlock = create<UnlockState>((set) => ({
  available: null,
  open: false,
  setOpen: (open) => set({ open }),
}));

let probed = false;

/** Look for ./seed.enc once. The "Open our flat" buttons stay hidden unless it is there. */
export function useSeedAvailable(): boolean {
  const available = useUnlock((s) => s.available);
  useEffect(() => {
    if (probed) return;
    probed = true;
    void fetchSeedFile().then((f) => useUnlock.setState({ available: !!f }));
  }, []);
  return available === true;
}

/** Asks for the password and opens the owners' encrypted flat. The password is never stored. */
export function UnlockDialog() {
  const open = useUnlock((s) => s.open);
  const setOpen = useUnlock((s) => s.setOpen);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setBusy(false);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const close = () => {
    setPassword('');
    setOpen(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      const project = validateProject(await openSeedFlat(password));
      useStore.getState().snapshotBefore('opening our flat');
      useStore.getState().loadProject(project);
      await flushSave();
      useStore.getState().toast(`Opened “${project.name}”.`);
      close();
    } catch (err) {
      if (err instanceof WrongPasswordError) setError(err.message);
      else setError((err as Error).message || NO_FLAT_MESSAGE);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop fixed" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <form className="modal" role="dialog" aria-label="Open our flat" onSubmit={submit}>
        <h2>Open our flat</h2>
        <p>
          Type the password to open the saved plan of our flat.
          {!isBlankProject(useStore.getState().project) && ' This replaces the plan you have open now.'}
        </p>
        <label className="form-row">
          <span>Password</span>
          <input
            ref={input}
            className="text-field"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
        </label>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !password}>
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Shown on the empty first-run screen when this site has an encrypted flat. */
export function EmptyStart() {
  const available = useSeedAvailable();
  const blank = useStore((s) => isBlankProject(s.project));
  const tour = useStore((s) => s.tourStep);
  const setOpen = useUnlock((s) => s.setOpen);
  if (!available || !blank || tour !== null) return null;
  return (
    <div className="empty-start">
      <p>Starting with a blank page? If you have the password, you can open our flat instead.</p>
      <button className="btn primary" onClick={() => setOpen(true)}>
        Open our flat (password)
      </button>
    </div>
  );
}
