import { useState } from 'react';
import { useStore } from '../model/store';
import { RULES } from '../rules/registry';
import { EditableLength } from './EditableLength';
import { forgetApiKey, saveAdviceEnabled, saveApiKey } from '../advice/keyStore';
import { useSiteMeasure } from '../sitemeasure/state';
import { useDialogEsc } from './useDialogEsc';
import { useReportUi, saveReportTo } from '../report/state';
import { isValidEmail } from '../report/address';

/** Params that are ratios, not lengths (e.g. 1.5 × the screen size). */
const isFactor = (key: string) => /factor/i.test(key);

function FactorField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="editable-input factor"
      aria-label={label}
      inputMode="decimal"
      value={text ?? String(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = parseFloat((text ?? '').replace(',', '.'));
        if (text !== null && Number.isFinite(v) && v > 0 && v < 20) onChange(v);
        setText(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function RuleSettings() {
  const overrides = useStore((s) => s.project.ruleOverrides);
  const commit = useStore((s) => s.commit);
  const set = (ruleId: string, key: string, v: number) =>
    commit('Change a layout rule', (d) => {
      d.ruleOverrides ??= {};
      const r = (d.ruleOverrides[ruleId] ??= {});
      r[key] = v;
    });
  const changed = overrides && Object.values(overrides).some((r) => r && Object.keys(r).length > 0);
  return (
    <section className="settings-section" aria-label="Layout rules">
      <div className="row">
        <h3>Layout rules</h3>
        <button
          className="btn small"
          disabled={!changed}
          onClick={() =>
            commit('Reset layout rules', (d) => {
              delete d.ruleOverrides;
            })
          }
        >
          Reset to UK defaults
        </button>
      </div>
      <p className="note">UK rules of thumb for homes. Change any number to suit you; it is saved with this plan.</p>
      <div className="rule-settings">
        {RULES.filter((r) => Object.keys(r.params).length > 0).map((r) => (
          <div className="rule-setting" key={r.id}>
            <div className="rule-setting-title">{r.title}</div>
            {Object.entries(r.params).map(([key, def]) => {
              const v = overrides?.[r.id]?.[key] ?? def;
              const label = r.paramLabels[key] ?? key;
              const isChanged = overrides?.[r.id]?.[key] !== undefined && overrides[r.id]![key] !== def;
              return (
                <div className="field" key={key}>
                  <span className="field-label">
                    {label}
                    {isChanged && <span className="changed"> (changed)</span>}
                  </span>
                  {key === 'on' ? (
                    <input
                      type="checkbox"
                      aria-label={`${r.title}: ${label}`}
                      checked={v >= 0.5}
                      onChange={(e) => set(r.id, key, e.target.checked ? 1 : 0)}
                    />
                  ) : isFactor(key) ? (
                    <span className="factor-wrap">
                      <FactorField label={`${r.title}: ${label}`} value={v} onChange={(x) => set(r.id, key, x)} />× screen size
                    </span>
                  ) : (
                    <EditableLength label={`${r.title}: ${label}`} ctx="small" value={v} min={0} max={20000} onChange={(mm) => set(r.id, key, Math.round(mm))} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function OnSiteSettings() {
  const open = (fn: () => void) => () => {
    useStore.getState().setSettingsOpen(false);
    fn();
  };
  const sm = useSiteMeasure.getState();
  return (
    <section className="settings-section" aria-label="On site">
      <h3>On site</h3>
      <p className="note">
        Replace the estimates from the agent’s plan with real measurements: step through them on your phone, or scan rooms with a
        LiDAR iPhone or iPad Pro and import the scan.
      </p>
      <div className="settings-actions">
        <button className="btn primary" onClick={open(() => sm.setOpen(true))}>
          Measure on site
        </button>
        <button className="btn" onClick={open(() => sm.setGuideOpen(true))}>
          Scan with an iPhone or iPad Pro (LiDAR)
        </button>
        <button title="Bring in a scan from an iPhone or iPad Pro" className="btn" onClick={open(() => sm.setImportOpen(true))}>
          Import a scan…
        </button>
      </div>
    </section>
  );
}

function ClaudeSettings() {
  const enabled = useStore((s) => s.adviceEnabled);
  const keySaved = useStore((s) => s.adviceKeySaved);
  const setAdviceState = useStore((s) => s.setAdviceState);
  const [key, setKey] = useState('');
  return (
    <section className="settings-section" aria-label="Ask Claude for advice">
      <h3>Ask Claude for advice (optional)</h3>
      <p className="note">
        Get written suggestions for a floor from Claude. You need your own Anthropic API key. The key is kept only in
        this browser and is sent only to Anthropic. The layout checks work without it.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const v = e.target.checked;
            setAdviceState({ enabled: v });
            void saveAdviceEnabled(v);
          }}
        />
        Turn on “Ask for advice”
      </label>
      {enabled && (
        <div className="field column">
          <span className="field-label">{keySaved ? 'A key is saved in this browser.' : 'Anthropic API key'}</span>
          <div className="row">
            <input
              className="text-field"
              type="password"
              autoComplete="off"
              aria-label="Anthropic API key"
              placeholder={keySaved ? 'Paste a new key to replace it' : 'sk-ant-…'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button title="Keep the key in this browser only"
              className="btn primary"
              disabled={!key.trim()}
              onClick={async () => {
                await saveApiKey(key);
                setKey('');
                setAdviceState({ keySaved: true });
                useStore.getState().toast('API key saved in this browser.');
              }}
            >
              Save key
            </button>
          </div>
          {keySaved && (
            <button title="Remove the key from this browser"
              className="btn small danger-text"
              onClick={async () => {
                await forgetApiKey();
                setAdviceState({ keySaved: false });
                useStore.getState().toast('API key removed from this browser.');
              }}
            >
              Forget the key
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ReportSettings() {
  const saved = useReportUi((s) => s.address);
  const setAddress = useReportUi((s) => s.setAddress);
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const shown = text ?? saved;
  const commit = async () => {
    if (text === null) return;
    const v = text.trim();
    if (v && !isValidEmail(v)) {
      setBad(true);
      return;
    }
    setBad(false);
    setText(null);
    await saveReportTo(v);
    setAddress(v);
    useStore.getState().toast(v ? 'Problem reports will go to that address.' : 'That address was removed from this browser.');
  };
  return (
    <section className="settings-section" aria-label="Problem reports">
      <h3>Problem reports</h3>
      <p className="note">
        “Report a problem” opens an email to this address. Leave it empty to use the address that came with your plan, if it has one.
        It is kept in this browser only.
      </p>
      <label className="field column">
        <span className="field-label">Problem reports go to</span>
        <input
          className="text-field"
          type="email"
          autoComplete="off"
          aria-label="Problem reports go to"
          aria-invalid={bad}
          placeholder="name@example.com"
          value={shown}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      {bad && (
        <p role="alert" className="field-error">
          That does not look like an email address.
        </p>
      )}
    </section>
  );
}

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  useDialogEsc(open, () => setOpen(false));
  if (!open) return null;
  return (
    <div
      className="modal-backdrop fixed"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="modal settings"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        <div className="row">
          <h2>Settings</h2>
          <button title="Close Settings (Esc)" className="btn" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
        <OnSiteSettings />
        <ClaudeSettings />
        <ReportSettings />
        <RuleSettings />
      </div>
    </div>
  );
}
