import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { downloadDataUrl, safeFileName } from '../model/persistence';
import { useDialogEsc } from './useDialogEsc';
import { useReportUi } from '../report/state';
import { resolveReportAddress } from '../report/address';
import { buildMailto, buildReportText, collectDetails, formatDetails } from '../report/report';
import { copyPicture, copyText, makePlanPicture } from '../report/picture';

/**
 * "Report a problem": she says what happened, the app adds a few plain details, and the report goes
 * out by email (an email link, so her own mail app sends it) or is copied to paste anywhere.
 * It works on the error screen too, so it reads the store defensively.
 */
export function ReportDialog() {
  const open = useReportUi((s) => s.open);
  const from = useReportUi((s) => s.from);
  const setOpen = useReportUi((s) => s.setOpen);
  const stored = useReportUi((s) => s.address);
  const projectAddress = useStore((s) => (s.project as { reportTo?: string } | undefined)?.reportTo);
  const address = resolveReportAddress(stored, projectAddress);

  const [what, setWhat] = useState('');
  const [expected, setExpected] = useState('');
  const [withPicture, setWithPicture] = useState(true);
  // undefined while the picture is being made, null when there is none.
  const [picture, setPicture] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const [needText, setNeedText] = useState(false);
  const [showBox, setShowBox] = useState(false);
  const whatRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useDialogEsc(open, () => setOpen(false));

  // The details are read once when the window opens, so they describe what she was doing, not what the window changes.
  const details = useMemo(() => (open ? collectDetails({}, from) : null), [open, from]);

  useEffect(() => {
    if (!open) return;
    setWhat('');
    setExpected('');
    setWithPicture(true);
    setMsg('');
    setNeedText(false);
    setShowBox(false);
    setPicture(undefined);
    let dead = false;
    void makePlanPicture().then((u) => {
      if (!dead) setPicture(u);
    });
    setTimeout(() => whatRef.current?.focus(), 0);
    return () => {
      dead = true;
    };
  }, [open]);

  if (!open || !details) return null;

  const hasWhat = what.trim().length > 0;
  const fullText = buildReportText(what, expected, details);
  const mailto = address && hasWhat ? buildMailto(address, what, expected, details) : null;
  const pictureOn = withPicture && !!picture;
  const askForText = () => {
    setNeedText(true);
    whatRef.current?.focus();
  };

  const doCopy = async () => {
    if (!hasWhat) return askForText();
    let r = await copyText(fullText, null);
    if (r === 'select') {
      // The browser refused: show the text in a box, select it, and try the old copy command.
      setShowBox(true);
      await new Promise((res) => setTimeout(res, 0));
      r = await copyText(fullText, boxRef.current);
    }
    if (r === 'copied') setShowBox(false);
    setMsg(r === 'copied' ? 'Copied. Paste it into an email or a message.' : 'Your browser would not copy it, so it is selected below. Press Ctrl/⌘ C to copy it.');
  };
  const doCopyPicture = async () => {
    if (!picture) return;
    setMsg((await copyPicture(picture)) ? 'Picture copied. Paste it into your email.' : 'Your browser would not copy the picture. Use “Download picture” instead.');
  };
  const doDownload = () => {
    if (!picture) return;
    downloadDataUrl(picture, `${safeFileName(useStore.getState().project?.name ?? 'flat-plan')}-problem.png`);
    setMsg('The picture was saved to your downloads. Attach it to your email.');
  };

  const copyBtn = (primary: boolean) => (
    <button type="button" className={primary ? 'btn primary' : 'btn'} onClick={doCopy} title="Copy your report and the details so you can paste them anywhere">
      Copy everything
    </button>
  );

  return (
    // A tap outside does not close it: she may have typed a lot. Esc and Close do.
    <div className="modal-backdrop fixed">
      <div className="modal report" role="dialog" aria-label="Report a problem" aria-modal="true" data-testid="report-dialog">
        <div className="row">
          <h2>Report a problem</h2>
          <button type="button" className="btn" title="Close without sending (Esc)" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <p className="note">Tell us what went wrong. A few plain details are added for you, and your plan itself is never sent.</p>

        <label className="form-row">
          <span className="field-label">What happened?</span>
          <textarea
            ref={whatRef}
            className="text-field area"
            required
            aria-label="What happened?"
            aria-invalid={needText}
            value={what}
            onChange={(e) => {
              setWhat(e.target.value);
              if (e.target.value.trim()) setNeedText(false);
            }}
            onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
          />
        </label>
        {needText && (
          <p role="alert" className="field-error">
            Please say what happened first.
          </p>
        )}
        <label className="form-row">
          <span className="field-label">What did you expect? (optional)</span>
          <textarea
            className="text-field area"
            aria-label="What did you expect?"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
          />
        </label>

        <label className="toggle report-picture-toggle">
          <input type="checkbox" checked={withPicture && picture !== null} disabled={picture === null} onChange={(e) => setWithPicture(e.target.checked)} />
          Include a picture of the plan
        </label>
        {picture === null && <p className="note">A picture is not available right now.</p>}
        {pictureOn && <img className="report-thumb" src={picture!} alt="Preview of the picture of the plan" data-testid="report-thumb" />}

        <details className="report-details">
          <summary>What gets sent</summary>
          <p className="note">
            These details are added to your message. They never include the shape or sizes of your plan, or your API key.
          </p>
          <pre data-testid="report-details-text">{formatDetails(details)}</pre>
        </details>

        <div className="report-actions">
          {address ? (
            <>
              {mailto ? (
                <a className="btn primary" href={mailto.url} data-testid="report-send" title="Open your email app with this message ready to send">
                  Send email
                </a>
              ) : (
                <button type="button" className="btn primary" data-testid="report-send" onClick={askForText} title="Open your email app with this message ready to send">
                  Send email
                </button>
              )}
              {copyBtn(false)}
            </>
          ) : (
            <>
              {copyBtn(true)}
              <button
                type="button"
                className="btn"
                title="Choose where reports are sent"
                onClick={() => {
                  setOpen(false);
                  useStore.getState().setSettingsOpen(true);
                }}
              >
                Set an email address…
              </button>
            </>
          )}
        </div>
        {!address && <p className="note">Paste it into a message to David.</p>}
        {address && <p className="note">If your email app does not open, use Copy everything and paste it into an email.</p>}

        {pictureOn && (
          <>
            <div className="report-actions">
              <button type="button" className="btn" onClick={doCopyPicture} title="Copy the picture so you can paste it into an email">
                Copy picture
              </button>
              <button type="button" className="btn" onClick={doDownload} title="Save the picture as a file you can attach">
                Download picture
              </button>
            </div>
            <p className="note">Then paste or attach the picture in your email.</p>
          </>
        )}

        {showBox && (
          <textarea ref={boxRef} className="text-field area report-copybox" readOnly aria-label="Your report, ready to copy" value={fullText} onFocus={(e) => e.currentTarget.select()} />
        )}
        {msg && (
          <p role="status" className="note report-msg" data-testid="report-msg">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
