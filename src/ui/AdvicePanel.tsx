import { useState } from 'react';
import { useLevel, useStore } from '../model/store';
import { countBySeverity, groupByRoom, type Issue } from '../rules/engine';
import { RULES } from '../rules/registry';
import type { RuleFact } from '../advice/claudeAdvice';
import { loadApiKey } from '../advice/keyStore';
import { useLevelIssues } from './useIssues';
import { fixIssueNow, renderAdvice, SEVERITY_LABEL, showIssue } from './advice';

export function IssueCard({ issue, compact }: { issue: Issue; compact?: boolean }) {
  const active = useStore((s) => s.highlight?.issueId === issue.id);
  return (
    <li className={`issue ${issue.severity}${active ? ' active' : ''}`} data-testid="issue">
      <button className="issue-main" onClick={() => showIssue(issue)} title="Show on the plan">
        <span className={`sev-chip ${issue.severity}`}>{SEVERITY_LABEL[issue.severity]}</span>
        <span className="issue-text">{issue.message}</span>
        {!compact && <span className="issue-rule">{issue.ruleTitle}</span>}
      </button>
      {issue.fixable && (
        <button className="btn small fix-btn" onClick={() => fixIssueNow(issue)}>
          Fix
        </button>
      )}
    </li>
  );
}

/** Right panel in Advice mode: every problem on this floor, by room. */
export function AdvicePanel() {
  const level = useLevel();
  const issues = useLevelIssues();
  const groups = groupByRoom(issues);
  const counts = countBySeverity(issues);
  if (!level) return null;
  return (
    <aside className="inspector" aria-label="Layout advice" data-testid="advice-panel">
      <div className="panel-section">
        <h2>Layout check: {level.name}</h2>
        <div className="sev-counts" aria-label="Problems by severity">
          <span className="sev-chip error">{counts.error} block use</span>
          <span className="sev-chip warning">{counts.warning} uncomfortable</span>
          <span className="sev-chip tip">{counts.tip} tips</span>
        </div>
        {issues.length === 0 && <p className="note">No problems found on this floor.</p>}
        {issues.length > 0 && <p className="note">Click a problem to see it on the plan. “Fix” nudges only the things named.</p>}
      </div>
      {groups.map((g) => (
        <div className="panel-section" key={g.roomName}>
          <h3>{g.roomName}</h3>
          <ul className="issue-list">
            {g.issues.map((i) => (
              <IssueCard key={i.id} issue={i} />
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

/** Left panel in Advice mode: what is checked, and the optional Claude advice. */
export function AdviceLeftPanel() {
  const level = useLevel();
  const project = useStore((s) => s.project);
  const enabled = useStore((s) => s.adviceEnabled);
  const keySaved = useStore((s) => s.adviceKeySaved);
  const issues = useLevelIssues();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ html: string; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!level) return;
    setBusy(true);
    setError(null);
    try {
      const key = await loadApiKey();
      if (!key) throw new Error('No API key saved. Add one in Settings.');
      const facts: RuleFact[] = issues.map((i) => ({ severity: i.severity, roomName: i.roomName, message: i.message }));
      const { askForAdvice } = await import('../advice/claudeAdvice');
      const r = await askForAdvice(key, level, project, facts, question);
      setAnswer({ html: renderAdvice(r.text), model: r.servedBy });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="leftpanel" aria-label="About the checks">
      <section className="panel-section">
        <h2>What is checked</h2>
        <p className="note">
          Every change is checked against UK rules of thumb for space around furniture, kitchens and bathrooms,
          door swings, windows, radiators and structural walls. You can change every number in Settings.
        </p>
        <ul className="rule-list">
          {RULES.map((r) => (
            <li key={r.id}>{r.title}</li>
          ))}
        </ul>
      </section>
      {enabled && keySaved ? (
        <section className="panel-section" aria-label="Ask Claude">
          <h2>Ask Claude for advice</h2>
          <p className="note">Sends this floor and the problems above to Claude. The measurements are given as facts.</p>
          <label className="field column">
            <span className="field-label">Your question (optional)</span>
            <textarea
              className="text-field area"
              aria-label="Your question"
              value={question}
              placeholder="e.g. Where should the dining table go once the kitchen wall is open?"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <button className="btn primary wide" disabled={busy} onClick={() => void ask()}>
            {busy ? 'Asking Claude…' : 'Ask for advice'}
          </button>
          {error && <p className="error">{error}</p>}
          {answer && (
            <div className="advice-answer" data-testid="advice-answer">
              <div dangerouslySetInnerHTML={{ __html: answer.html }} />
              <p className="note">Answered by {answer.model}. Suggestions, not measurements: check them against the plan.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="panel-section">
          <h2>Ask Claude (optional)</h2>
          <p className="note">Turn this on in Settings with your own Anthropic API key to get written suggestions. The checks above work without it.</p>
          <button className="btn" onClick={() => useStore.getState().setSettingsOpen(true)}>
            Open Settings
          </button>
        </section>
      )}
    </aside>
  );
}
