import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MousePointerSquareDashed, RotateCcw, X } from "lucide-react";
import type { Annotation, ArtworkComment } from "../lib/artwork";
import { dateTime } from "../lib/artwork";
import { errorMessage } from "../lib/api";
import { Badge, Button } from "./ui";

interface Props {
  mode: "staff" | "portal";
  comments: ArtworkComment[];
  numbers: Map<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Staff: resolve / reopen customer feedback. */
  onResolve?: (id: string, status: "OPEN" | "RESOLVED") => Promise<void>;
  /** Reply to a top-level comment (staff always; portal while the review is open). */
  onReply?: (parentId: string, body: string) => Promise<void>;
  /** Portal: own drafts can be edited or removed until the review is submitted. */
  onEditDraft?: (id: string, body: string) => Promise<void>;
  onDeleteDraft?: (id: string) => Promise<void>;
  /** New comment. When omitted, the composer is hidden (read-only version). */
  onCreate?: (body: string, area: Annotation | null, visibility: "SHARED" | "INTERNAL") => Promise<void>;
  pendingArea: Annotation | null;
  onClearArea: () => void;
  onStartDrawing?: () => void;
  /** Staff choose who sees a new comment. */
  visibilityOptions?: Array<"SHARED" | "INTERNAL">;
  emptyText: string;
  readOnlyNote?: string;
}

/**
 * Numbered comment thread for a proof version. Numbers match the markers on
 * the proof; clicking a comment highlights its area and vice versa.
 */
export function ArtworkComments(p: Props) {
  const top = p.comments.filter((c) => !c.parentId);
  const replies = (id: string) => p.comments.filter((c) => c.parentId === id);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (p.activeId) document.getElementById(`comment-${p.activeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.activeId]);

  return (
    <>
      <div className="comment-scroll" ref={listRef}>
        {top.length === 0 ? (
          <p className="muted padded" style={{ fontSize: 13 }}>{p.emptyText}</p>
        ) : (
          <div className="comment-list">
            {top.map((c) => (
              <CommentItem key={c.id} c={c} n={p.numbers.get(c.id)} replies={replies(c.id)} {...p} />
            ))}
          </div>
        )}
      </div>
      {p.onCreate ? <Composer {...p} /> : p.readOnlyNote ? <div className="composer"><span className="composer-hint">{p.readOnlyNote}</span></div> : null}
    </>
  );
}

function CommentItem({ c, n, replies, mode, activeId, onSelect, onResolve, onReply, onEditDraft, onDeleteDraft }: Props & { c: ArtworkComment; n?: number; replies: ArtworkComment[] }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolved = c.status === "RESOLVED";
  const fromCustomer = c.authorType === "CUSTOMER";
  const clickable = !!c.annotation;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div
      id={`comment-${c.id}`}
      className={`comment${activeId === c.id ? " is-active" : ""}${resolved ? " is-resolved" : ""}${clickable ? " is-clickable" : ""}`}
      onClick={() => clickable && onSelect(c.id)}
    >
      <span className={`comment-n${!n ? " is-general" : ""}${resolved ? " is-resolved" : ""}${!fromCustomer ? " tone-staff" : ""}`} aria-hidden>
        {resolved ? <CheckCircle2 size={13} /> : n ?? "•"}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="comment-meta">
          <strong>{c.authorName}</strong>
          {mode === "staff" && <span>{fromCustomer ? "Customer" : "Baris"}</span>}
          {mode === "portal" && !fromCustomer && <span>Baris</span>}
          <span>· {dateTime(c.createdAt)}</span>
          {c.visibility === "INTERNAL" && <Badge tone="purple">Internal</Badge>}
          {c.isDraft && <Badge tone="warning">Draft</Badge>}
          {resolved && <Badge tone="success">Resolved</Badge>}
          {!n && !c.parentId && <span>· General</span>}
        </div>
        {editing ? (
          <div className="composer" style={{ padding: 0, border: 0, background: "none", marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} autoFocus aria-label="Edit comment" />
            <div className="composer-row">
              <Button type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <Button primary type="button" disabled={busy || !text.trim()} onClick={() => run(async () => { await onEditDraft!(c.id, text.trim()); setEditing(false); })}>Save</Button>
            </div>
          </div>
        ) : (
          <p className="comment-body">{c.body}</p>
        )}
        {resolved && c.resolvedByName && <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>Resolved by {c.resolvedByName} · {dateTime(c.resolvedAt)}</p>}

        {replies.length > 0 && (
          <div className="comment-replies">
            {replies.map((r) => (
              <div key={r.id}>
                <div className="comment-meta">
                  <strong>{r.authorName}</strong>
                  {r.authorType !== "CUSTOMER" && <span>Baris</span>}
                  <span>· {dateTime(r.createdAt)}</span>
                  {r.visibility === "INTERNAL" && <Badge tone="purple">Internal</Badge>}
                  {r.isDraft && <Badge tone="warning">Draft</Badge>}
                </div>
                <p className="comment-body">{r.body}</p>
              </div>
            ))}
          </div>
        )}

        {replying && (
          <div className="composer" style={{ padding: "10px 0 0", border: 0, background: "none" }} onClick={(e) => e.stopPropagation()}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} placeholder="Write a reply…" autoFocus aria-label="Reply" />
            <div className="composer-row">
              <Button type="button" onClick={() => { setReplying(false); setText(""); }} disabled={busy}>Cancel</Button>
              <Button primary type="button" disabled={busy || !text.trim()} onClick={() => run(async () => { await onReply!(c.id, text.trim()); setReplying(false); setText(""); })}>
                {busy && <Loader2 size={14} className="spin" />}Reply
              </Button>
            </div>
          </div>
        )}

        {error && <p className="muted" role="alert" style={{ color: "var(--tone-danger-fg)", fontSize: 12, marginTop: 6 }}>{error}</p>}

        {!replying && !editing && (
          <div className="comment-actions" onClick={(e) => e.stopPropagation()}>
            {onReply && !c.isDraft && <button type="button" onClick={() => { setReplying(true); setText(""); }}>Reply</button>}
            {onResolve && fromCustomer && (
              <button type="button" disabled={busy} onClick={() => run(() => onResolve(c.id, resolved ? "OPEN" : "RESOLVED"))}>
                {resolved ? <><RotateCcw size={11} /> Reopen</> : "Mark resolved"}
              </button>
            )}
            {c.isDraft && c.isMine && onEditDraft && <button type="button" onClick={() => { setEditing(true); setText(c.body); }}>Edit</button>}
            {c.isDraft && c.isMine && onDeleteDraft && <button type="button" disabled={busy} onClick={() => run(() => onDeleteDraft(c.id))}>Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ onCreate, pendingArea, onClearArea, onStartDrawing, visibilityOptions, mode }: Props) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"SHARED" | "INTERNAL">(visibilityOptions?.[0] ?? "SHARED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // A freshly drawn area puts the cursor straight into the comment box.
  useEffect(() => { if (pendingArea) ref.current?.focus(); }, [pendingArea]);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onCreate!(body.trim(), pendingArea, visibility);
      setBody("");
      onClearArea();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer">
      <div className="composer-hint">
        <MousePointerSquareDashed size={14} />
        {pendingArea ? (
          <>
            Commenting on the marked area{pendingArea.page > 1 ? ` (page ${pendingArea.page})` : ""}.
            <button type="button" onClick={onClearArea} aria-label="Remove the marked area"><X size={12} /> Remove</button>
          </>
        ) : onStartDrawing ? (
          <>
            General comment, or{" "}
            <button type="button" onClick={onStartDrawing}>mark an area</button>
            {" "}first.
          </>
        ) : (
          "General comment"
        )}
      </div>
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
        maxLength={5000}
        placeholder={mode === "portal" ? "Describe the change you need…" : "Write a comment…"}
        aria-label="New comment"
      />
      {error && <p role="alert" style={{ color: "var(--tone-danger-fg)", fontSize: 12 }}>{error}</p>}
      <div className="composer-row">
        {visibilityOptions && visibilityOptions.length > 1 ? (
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as "SHARED" | "INTERNAL")} aria-label="Who can see this comment" style={{ minHeight: 34, padding: "6px 10px" }}>
            <option value="SHARED">Visible to customer</option>
            <option value="INTERNAL">Internal (Baris only)</option>
          </select>
        ) : (
          <span className="muted" style={{ fontSize: 11 }}>
            {mode === "portal" ? "Saved as a draft until you submit your review." : visibility === "INTERNAL" ? "Internal (Baris only)" : "Visible to customer"}
          </span>
        )}
        <Button primary type="button" onClick={submit} disabled={busy || !body.trim()}>
          {busy && <Loader2 size={14} className="spin" />}
          {mode === "portal" ? "Add comment" : "Post"}
        </Button>
      </div>
    </div>
  );
}
