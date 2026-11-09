import { useState } from 'react';
import { useStore } from '../model/store';
import { RULES } from '../rules/registry';
import { EditableLength } from './EditableLength';
import { forgetApiKey, saveAdviceEnabled, saveApiKey } from '../advice/keyStore';

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
                  {isFactor(key) ? (
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
            <button
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
            <button
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

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <div className="row">
          <h2>Settings</h2>
          <button className="btn" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
        <ClaudeSettings />
        <RuleSettings />
      </div>
    </div>
  );
}
