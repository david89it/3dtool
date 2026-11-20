// Catches a crash while drawing and shows a plain message instead of a blank
// page. The plan is never lost by a crash: autosave already holds it, saving is
// paused while the error is on screen (so the thing that broke is not written
// over the good copy), and "Save a copy of my plan" writes a file straight
// from the store or, failing that, from storage.

import { Component, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { useStore } from '../model/store';
import { pauseSaving, resumeSaving, saveRescueCopy } from '../model/persistence';

interface Props {
  children: ReactNode;
  /** `app`: the whole screen. `view`: the 3D view only. `panel`: one side panel. */
  scope?: 'app' | 'view' | 'panel';
  /** When this changes, a shown error is cleared and the children try again (e.g. the selection changed). */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Flat Planner crashed while drawing', error, info.componentStack);
    // The state that crashed must not replace the saved copy. Whatever was saved before is kept.
    if ((this.props.scope ?? 'app') === 'app') pauseSaving();
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const scope = this.props.scope ?? 'app';
    if (scope === 'panel') return <PanelFallback onRetry={this.reset} />;
    if (scope === 'view') return <ViewFallback onRetry={this.reset} />;
    return <AppFallback onRetry={this.reset} />;
  }
}

/** A panel boundary that tries again whenever the selection changes (a bad selection must not keep the panel broken). */
export function SelectionBoundary({ children }: { children: ReactNode }) {
  const selection = useStore((s) => s.selection);
  return (
    <ErrorBoundary scope="panel" resetKey={selection}>
      {children}
    </ErrorBoundary>
  );
}

const box: CSSProperties = {
  maxWidth: 460,
  margin: '12vh auto 0',
  padding: '24px 28px',
  borderRadius: 12,
  background: '#fff',
  color: '#1f2933',
  border: '1px solid #d0d7de',
  font: '16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
  boxShadow: '0 8px 30px rgba(0,0,0,.12)',
};
const btn: CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  borderRadius: 8,
  border: '1px solid #8a949e',
  background: '#f6f8fa',
  color: '#1f2933',
  font: 'inherit',
  cursor: 'pointer',
};
const primary: CSSProperties = { ...btn, background: '#1f6feb', borderColor: '#1f6feb', color: '#fff' };

function AppFallback({ onRetry }: { onRetry: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'saved' | 'failed'>('idle');
  const canUndo = useStore.getState().past.length > 0;
  return (
    <div role="alert" data-testid="error-screen" style={{ minHeight: '100vh', background: '#eef1f4', padding: 16, boxSizing: 'border-box' }}>
      <div style={box}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something went wrong. Your plan is saved.</h1>
        <p style={{ margin: '0 0 16px' }}>Reload to carry on from your last saved plan. You can also keep a copy of it as a file first.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={primary} onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            type="button"
            style={btn}
            onClick={async () => setCopy((await saveRescueCopy()) ? 'saved' : 'failed')}
          >
            Save a copy of my plan
          </button>
          {canUndo && (
            <button
              type="button"
              style={btn}
              onClick={() => {
                const s = useStore.getState();
                s.select(null);
                s.undo();
                resumeSaving();
                onRetry();
              }}
            >
              Undo my last change
            </button>
          )}
        </div>
        {copy === 'saved' && <p style={{ margin: '14px 0 0' }}>A copy was saved to your downloads.</p>}
        {copy === 'failed' && <p style={{ margin: '14px 0 0' }}>A copy could not be made. Reload, then use File, Save a copy.</p>}
      </div>
    </div>
  );
}

function ViewFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-testid="error-view" style={{ padding: 24, font: '16px/1.5 system-ui, sans-serif' }}>
      <p style={{ margin: '0 0 12px' }}>The 3D view had a problem. Your plan is not affected.</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={primary} onClick={() => useStore.getState().setMode('trace')}>
          Back to the plan
        </button>
        <button type="button" style={btn} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function PanelFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-testid="error-panel" style={{ padding: 16, font: '14px/1.5 system-ui, sans-serif' }}>
      <p style={{ margin: '0 0 10px' }}>This panel could not be shown. Your plan is not affected.</p>
      <button type="button" style={btn} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/**
 * Errors thrown inside event handlers and promises do not reach an error
 * boundary and would otherwise vanish silently. Show a short note (at most
 * one every ten seconds) so she knows an action did not complete.
 */
export function installGlobalErrorToasts(): () => void {
  let last = 0;
  const tell = (message: string) => {
    if (/ResizeObserver loop/i.test(message)) return;
    console.error('Flat Planner error', message);
    const now = Date.now();
    if (now - last < 10_000) return;
    last = now;
    useStore.getState().toast('That did not work. If it keeps happening, use File, Save a copy to keep your work.', 'warn');
  };
  const onError = (e: ErrorEvent) => tell(e.message || String(e.error));
  const onRejection = (e: PromiseRejectionEvent) => tell((e.reason as Error | undefined)?.message ?? String(e.reason));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
