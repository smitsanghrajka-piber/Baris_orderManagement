import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, ClipboardCheck, FileUp, Loader2, MessageSquareWarning, Send, Upload } from "lucide-react";
import { Back, Badge, Button, DataTable, Details, Modal, PageHead, SearchBar, State, useResource, type Row } from "../components/ui";
import { ProofViewer, type ViewerMarker } from "../components/ProofViewer";
import { ArtworkComments } from "../components/ArtworkComments";
import { can, errorMessage, isDemo, request } from "../lib/api";
import { toast } from "../lib/toast";
import {
  AWAITING_CUSTOMER, PORTAL_STATUS_LABEL, PROOF_ACCEPT, STATUS_LABEL, STATUS_TONE, dateTime, numberAnnotated,
  type Annotation, type ArtworkComment, type ArtworkStatus, type ArtworkVersion,
} from "../lib/artwork";

function StatusBadge({ status, portal }: { status: ArtworkStatus; portal?: boolean }) {
  return <Badge tone={STATUS_TONE[status]}>{(portal && PORTAL_STATUS_LABEL[status]) || STATUS_LABEL[status]}</Badge>;
}

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "NEEDS_ACTION", label: "Needs action" },
  { key: "AWAITING_CUSTOMER", label: "With customer" },
  { key: "IN_PREPARATION", label: "In preparation" },
  { key: "APPROVED", label: "Approved" },
];

// ═══════════════════════════════ Staff: list ═══════════════════════════════

export function ArtworksPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "ALL";
  const [q, setQ] = useState(params.get("q") || "");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const query = new URLSearchParams({ page: String(page), pageSize: "20", filter, ...(q.trim() ? { q: q.trim() } : {}), ...(params.get("customerId") ? { customerId: params.get("customerId")! } : {}) });
  const { data, loading, error, reload } = useResource<Row>(`/artworks?${query}`);

  useEffect(() => { setPage(1); }, [filter, q]);
  const setFilter = (f: string) => setParams((p) => { const n = new URLSearchParams(p); if (f === "ALL") n.delete("filter"); else n.set("filter", f); return n; }, { replace: true });

  return (
    <>
      <PageHead
        eyebrow="ARTWORK"
        title="Artwork approvals"
        description="Upload proofs, send them to customers, and work through their feedback."
        actions={can("artwork.create") && <Button primary onClick={() => setCreating(true)}><Upload size={16} />Upload artwork</Button>}
      />
      <div className="tabs scroll-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
            {f.label}
            {data?.counts?.[f.key] !== undefined && <span className="muted"> · {data.counts[f.key]}</span>}
          </button>
        ))}
      </div>
      <section className="surface">
        <SearchBar value={q} set={setQ} placeholder="Search number, title, customer or SKU" />
        {loading && !data ? (
          <State loading />
        ) : error ? (
          <State error={error} retry={reload} />
        ) : (
          <DataTable
            rows={data?.items || []}
            page={page}
            total={data?.total}
            pageSize={20}
            onPage={setPage}
            empty={filter === "NEEDS_ACTION" ? "Nothing needs action. Customer feedback will appear here." : "No artwork yet. Upload a proof to send it to a customer."}
            columns={[
              {
                label: "Artwork",
                render: (r) => (
                  <Link className="record-title" to={`/artworks/${r.id}`}>
                    <strong>{r.title}</strong>
                    <small>{r.number}{r.sku ? ` · ${r.sku.number}` : ""}</small>
                  </Link>
                ),
              },
              { label: "Customer", render: (r) => <Link className="record-link" to={`/customers/${r.customer.id}`}>{r.customer.name}</Link> },
              { label: "Version", render: (r) => (r.currentVersion ? `V${r.currentVersion.revisionNo}` : "—") },
              { label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { label: "Account manager", render: (r) => r.accountManager?.name || "—" },
              { label: "Updated", render: (r) => dateTime(r.updatedAt) },
            ]}
          />
        )}
      </section>
      {creating && (
        <NewArtworkModal
          presetCustomerId={params.get("customerId") || undefined}
          close={() => { setCreating(false); if (params.has("new")) setParams((p) => { const n = new URLSearchParams(p); n.delete("new"); return n; }, { replace: true }); }}
          created={(id) => navigate(`/artworks/${id}`)}
        />
      )}
    </>
  );
}

function FilePicker({ file, setFile, label }: { file: File | null; setFile: (f: File | null) => void; label: string }) {
  return (
    <label className={`file-drop${file ? " has-file" : ""}`}>
      <FileUp size={20} />
      <span>
        {file ? (
          <><strong>{file.name}</strong> <span className="muted">· {(file.size / 1024 / 1024).toFixed(1)} MB</span></>
        ) : (
          <>{label} <span className="muted">PDF only</span></>
        )}
      </span>
      <input
        type="file"
        accept={PROOF_ACCEPT}
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && !/\.pdf$/i.test(f.name)) {
            toast("Proofs must be PDF files.", "warning");
            e.target.value = "";
            setFile(null);
            return;
          }
          setFile(f);
        }}
      />
    </label>
  );
}

function FormError({ error }: { error: string }) {
  if (!error) return null;
  return <div className="notice tone-danger" role="alert"><AlertCircle size={18} />{error}</div>;
}

function NewArtworkModal({ close, created, presetCustomerId }: { close: () => void; created: (id: string) => void; presetCustomerId?: string }) {
  const customers = useResource<Row>("/customers?pageSize=200&status=ALL");
  const [customerId, setCustomerId] = useState(presetCustomerId || "");
  const skus = useResource<Row>(customerId ? `/skus?customerId=${customerId}&pageSize=200` : null);
  const [skuId, setSkuId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [internal, setInternal] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Choose the proof file."); return; }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("customerId", customerId);
    if (skuId) form.append("skuId", skuId);
    form.append("title", title.trim());
    if (notes.trim()) form.append("customerNotes", notes.trim());
    if (internal.trim()) form.append("internalNotes", internal.trim());
    form.append("sendNow", String(sendNow));
    try {
      const a = await request<Row>("/artworks", "POST", form);
      toast(sendNow ? `${a.number} sent to the customer for review.` : `${a.number} uploaded. Send it when you're ready.`, "success");
      created(a.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload artwork" description="The proof is only visible to this customer's portal users, and only once it's sent." close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="aw-customer">Customer <span aria-label="required">*</span></label>
            <select id="aw-customer" required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSkuId(""); }}>
              <option value="">Select customer</option>
              {(customers.data?.items || []).map((c: Row) => <option key={c.id} value={c.id}>{c.name} ({c.number})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="aw-sku">Label SKU <span aria-label="required">*</span></label>
            <select id="aw-sku" required value={skuId} disabled={!customerId} onChange={(e) => setSkuId(e.target.value)}>
              <option value="">{!customerId ? "Choose a customer first" : skus.data && !(skus.data.items || []).length ? "This customer has no SKUs yet" : "Select SKU"}</option>
              {(skus.data?.items || []).map((s: Row) => <option key={s.id} value={s.id}>{s.number} · {s.description}</option>)}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="aw-title">Title <span aria-label="required">*</span></label>
            <input id="aw-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Yoghurt tub lid 500g" />
          </div>
          <div className="field wide">
            <FilePicker file={file} setFile={setFile} label="Choose the proof file" />
          </div>
          <div className="field wide">
            <label htmlFor="aw-notes">Note to the customer</label>
            <textarea id="aw-notes" rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything they should check in particular" />
          </div>
          <div className="field wide">
            <label htmlFor="aw-internal">Internal notes</label>
            <textarea id="aw-internal" rows={2} maxLength={5000} value={internal} onChange={(e) => setInternal(e.target.value)} />
            <small>Baris only, never shown in the portal.</small>
          </div>
          <div className="field wide">
            <label className="check"><input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />Send to the customer now</label>
            <small>Their approvers are notified by email and in the portal.</small>
          </div>
        </div>
        <FormError error={error} />
        <div className="form-footer">
          <Button type="button" onClick={close} disabled={busy}>Cancel</Button>
          <Button primary type="submit" disabled={busy || !customerId || !skuId || !title.trim() || !file}>
            {busy && <Loader2 size={16} className="spin" />}{sendNow ? "Upload and send" : "Upload"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════ Shared review hooks ═══════════════════════════════

function useComments(path: string | null) {
  const [comments, setComments] = useState<ArtworkComment[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!path) return;
    try { setComments(await request<ArtworkComment[]>(path)); setError(""); } catch (e) { setError(errorMessage(e)); }
  }, [path]);
  useEffect(() => { setComments(null); void load(); }, [load]);
  return { comments, error, reload: load };
}

function markersFor(comments: ArtworkComment[], numbers: Map<string, number>): ViewerMarker[] {
  return comments
    .filter((c) => !c.parentId && c.annotation && numbers.has(c.id))
    .map((c) => ({
      id: c.id,
      n: numbers.get(c.id)!,
      area: c.annotation!,
      tone: c.isDraft ? "draft" : c.authorType === "CUSTOMER" ? "customer" : "staff",
      resolved: c.status === "RESOLVED",
    }));
}

function proofOf(v: ArtworkVersion | undefined) {
  return v?.files.find((f) => f.kind === "PROOF" && f.isPrimary) ?? v?.files.find((f) => f.kind === "PROOF");
}

function VersionPills({ versions, selected, select, portal }: { versions: ArtworkVersion[]; selected: string; select: (id: string) => void; portal?: boolean }) {
  if (versions.length < 2) return null;
  return (
    <div className="version-pills" role="tablist" aria-label="Versions">
      {versions.map((v) => (
        <button key={v.id} role="tab" aria-selected={v.id === selected} className={v.id === selected ? "selected" : ""} onClick={() => select(v.id)}>
          Version {v.revisionNo}
          <StatusBadge status={v.status} portal={portal} />
        </button>
      ))}
    </div>
  );
}

function DecisionRecords({ v }: { v: ArtworkVersion }) {
  if (!v.approvals.length) return null;
  return (
    <section className="surface">
      <div className="section-head"><h2>Customer decision</h2></div>
      {v.approvals.map((d) => (
        <div className="decision-card" key={d.id}>
          <div className="comment-meta">
            <Badge tone={d.decision === "APPROVED" ? "success" : "warning"}>{d.decision === "APPROVED" ? "Approved" : "Changes requested"}</Badge>
            <strong>{d.decidedByName}</strong>
            <span>· {dateTime(d.decidedAt)}</span>
          </div>
          {d.comments && <p className="comment-body" style={{ marginTop: 8 }}>{d.comments}</p>}
          {d.statement && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Accepted approval statement (version {d.statementVersion}): “{d.statement}”
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

// ═══════════════════════════════ Staff: detail ═══════════════════════════════

export function ArtworkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: a, loading, error, reload } = useResource<Row>(`/artworks/${id}`);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pending, setPending] = useState<Annotation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const versions: ArtworkVersion[] = a?.versions || [];
  const current = versions[0];
  const v = versions.find((x) => x.id === versionId) ?? current;
  const { comments, reload: reloadComments } = useComments(v ? `/artwork-versions/${v.id}/comments` : null);
  const numbers = useMemo(() => numberAnnotated(comments || []), [comments]);

  useEffect(() => { setActiveId(null); setPending(null); setDrawing(false); }, [v?.id]);

  if (loading || error || !a) return <State loading={loading} error={error} retry={reload} />;

  const proof = proofOf(v);
  const isCurrent = v?.id === current?.id;
  const canShared = can("artwork.comment") && !!v?.sentAt;
  const canInternal = can("artwork.comment.internal");
  const visibility: Array<"SHARED" | "INTERNAL"> = [...(canShared ? ["SHARED" as const] : []), ...(canInternal ? ["INTERNAL" as const] : [])];
  const openFeedback = (comments || []).filter((c) => c.authorType === "CUSTOMER" && !c.parentId && c.status === "OPEN").length;

  const send = async () => {
    setSending(true);
    try {
      await request(`/artwork-versions/${current.id}/send`, "POST");
      toast(`Version ${current.revisionNo} sent to ${a.customer.name}.`, "success");
      reload();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Back onClick={() => navigate("/artworks")}>Artwork approvals</Back>
      <PageHead
        eyebrow={`${a.number} · VERSION ${current?.revisionNo ?? 1}`}
        title={a.title}
        description={`${a.customer.name}${a.sku ? ` · ${a.sku.number} ${a.sku.description}` : ""}`}
        actions={
          <>
            <StatusBadge status={a.status} />
            {current?.status === "PROOF_IN_PREPARATION" && can("artwork.send_proof") && (
              <Button onClick={send} disabled={sending}>{sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}Send to customer</Button>
            )}
            {can("artwork.upload_version") && (
              <Button primary onClick={() => setUploading(true)}><Upload size={16} />Upload new version</Button>
            )}
          </>
        }
      />

      {a.status === "CHANGES_REQUESTED" && (
        <div className="notice tone-warning" role="status">
          <MessageSquareWarning size={18} />
          <div>
            <strong>{a.customer.name} requested changes to version {current.revisionNo}.</strong>{" "}
            {openFeedback > 0 ? `${openFeedback} comment${openFeedback === 1 ? "" : "s"} to work through.` : "Review their feedback below."}
            {" "}When the artwork is updated, upload a new version.
          </div>
        </div>
      )}
      {a.status === "APPROVED" && (
        <div className="notice tone-success" role="status">
          <CheckCircle2 size={18} />
          <div><strong>Approved by the customer.</strong> Version {current.revisionNo} is the approved artwork.</div>
        </div>
      )}
      {current?.status === "PROOF_IN_PREPARATION" && (
        <div className="notice tone-info" role="status">
          <AlertCircle size={18} />
          <div><strong>Not sent yet.</strong> The customer can't see version {current.revisionNo} until you send it.</div>
        </div>
      )}

      <VersionPills versions={versions} selected={v?.id ?? ""} select={setVersionId} />

      <div className="review-layout">
        <div>
          {proof ? (
            <ProofViewer
              fileKey={proof.file.id}
              loadUrl={() => request(`/files/${proof.file.id}/url`)}
              markers={markersFor(comments || [], numbers)}
              activeId={activeId}
              onSelect={setActiveId}
              canDraw={visibility.length > 0}
              drawing={drawing}
              onDrawingChange={setDrawing}
              onDraw={(area) => { setPending(area); setDrawing(false); }}
              pending={pending}
            />
          ) : (
            <State empty="This version has no proof file." />
          )}
        </div>

        <div className="review-side">
          <section className="surface">
            <div className="section-head">
              <div>
                <h2>Comments</h2>
                <p>{isCurrent ? "Customer feedback appears once they submit their review." : `Version ${v?.revisionNo} (${STATUS_LABEL[v!.status].toLowerCase()})`}</p>
              </div>
              {openFeedback > 0 && <Badge tone="warning">{openFeedback} open</Badge>}
            </div>
            {comments === null ? (
              <State loading />
            ) : (
              <ArtworkComments
                mode="staff"
                comments={comments}
                numbers={numbers}
                activeId={activeId}
                onSelect={setActiveId}
                onResolve={can("artwork.comment.resolve") ? async (cid, status) => { await request(`/artwork-comments/${cid}`, "PATCH", { status }); await reloadComments(); } : undefined}
                onReply={visibility.length ? async (parentId, body) => { await request(`/artwork-versions/${v!.id}/comments`, "POST", { body, parentId, visibility: visibility[0] }); await reloadComments(); } : undefined}
                onCreate={visibility.length ? async (body, area, vis) => { await request(`/artwork-versions/${v!.id}/comments`, "POST", { body, visibility: vis, ...(area ? { annotation: area } : {}) }); await reloadComments(); } : undefined}
                visibilityOptions={visibility}
                pendingArea={pending}
                onClearArea={() => setPending(null)}
                onStartDrawing={() => setDrawing(true)}
                emptyText={v?.sentAt ? "No comments on this version yet." : "Add internal notes here. Shared comments open up once the proof is sent."}
              />
            )}
          </section>

          {v && <DecisionRecords v={v} />}

          <section className="surface padded">
            <h2 style={{ fontSize: 15 }}>Version {v?.revisionNo}</h2>
            <Details
              entries={[
                ["Status", v ? <StatusBadge status={v.status} /> : "—"],
                ["Uploaded", `${dateTime(v?.createdAt)}${v?.uploadedByUser ? ` · ${v.uploadedByUser.name}` : ""}`],
                ["Sent", v?.sentAt ? `${dateTime(v.sentAt)}${v.sentBy ? ` · ${v.sentBy.name}` : ""}` : "Not sent"],
                ["First viewed", dateTime(v?.firstViewedAt)],
                ["What changed", v?.revisionDescription],
                ["Note to customer", v?.customerNotes || "—"],
                ["Internal notes", v?.internalNotes || "—"],
                ["Account manager", a.accountManager?.name || "—"],
              ]}
            />
            {v && v.files.length > 1 && (
              <>
                <h3 style={{ fontSize: 13, marginBottom: 8 }}>Files</h3>
                {v.files.map((f) => (
                  <p key={f.id} style={{ fontSize: 12, marginBottom: 4 }}>
                    <button className="text-link" style={{ border: 0, background: "none", padding: 0 }} onClick={async () => { const r = await request<Row>(`/files/${f.file.id}/url?download=1`); window.open(r.url, "_blank", "noopener"); }}>
                      {f.file.originalName}
                    </button>{" "}
                    <span className="muted">· {f.kind.toLowerCase()}</span>
                  </p>
                ))}
              </>
            )}
          </section>
        </div>
      </div>

      {uploading && (
        <NewVersionModal
          artwork={a}
          close={() => setUploading(false)}
          done={() => { setUploading(false); setVersionId(null); reload(); }}
        />
      )}
    </>
  );
}

function NewVersionModal({ artwork, close, done }: { artwork: Row; close: () => void; done: () => void }) {
  const current: ArtworkVersion | undefined = artwork.versions?.[0];
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [internal, setInternal] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const replacesUnderReview = current && AWAITING_CUSTOMER.includes(current.status);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Choose the new proof file."); return; }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("revisionDescription", description.trim());
    if (notes.trim()) form.append("customerNotes", notes.trim());
    if (internal.trim()) form.append("internalNotes", internal.trim());
    form.append("sendNow", String(sendNow));
    try {
      await request(`/artworks/${artwork.id}/versions`, "POST", form);
      toast(sendNow ? "New version sent to the customer." : "New version uploaded.", "success");
      done();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Upload version ${(current?.revisionNo ?? 0) + 1}`} description={`${artwork.number} · ${artwork.title}`} close={close}>
      <form onSubmit={submit}>
        {replacesUnderReview && (
          <div className="notice tone-warning"><AlertCircle size={18} />The customer is still reviewing version {current!.revisionNo}. Uploading replaces it, and their unsent comments stay on the old version.</div>
        )}
        <div className="form-grid">
          <div className="field wide"><FilePicker file={file} setFile={setFile} label="Choose the updated proof" /></div>
          <div className="field wide">
            <label htmlFor="nv-desc">What changed <span aria-label="required">*</span></label>
            <textarea id="nv-desc" rows={2} required minLength={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Logo enlarged 20%, barcode moved to the bottom edge" />
            <small>Shown to the customer with the new proof.</small>
          </div>
          <div className="field wide">
            <label htmlFor="nv-notes">Note to the customer</label>
            <textarea id="nv-notes" rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="field wide">
            <label htmlFor="nv-internal">Internal notes</label>
            <textarea id="nv-internal" rows={2} maxLength={5000} value={internal} onChange={(e) => setInternal(e.target.value)} />
          </div>
          <div className="field wide">
            <label className="check"><input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />Send to the customer now</label>
          </div>
        </div>
        <FormError error={error} />
        <div className="form-footer">
          <Button type="button" onClick={close} disabled={busy}>Cancel</Button>
          <Button primary type="submit" disabled={busy || !file || description.trim().length < 3}>
            {busy && <Loader2 size={16} className="spin" />}{sendNow ? "Upload and send" : "Upload"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════ Portal: list ═══════════════════════════════

export function PortalArtworksPage() {
  const { data, loading, error, reload } = useResource<Row[]>("/portal/artworks");
  const [q, setQ] = useState("");
  const rows = (data || []).filter((r) => !q.trim() || `${r.number} ${r.title} ${r.sku?.number ?? ""} ${r.sku?.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const waiting = (data || []).filter((r) => r.awaitingReview).length;
  return (
    <>
      <PageHead eyebrow="ARTWORK" title="Artwork proofs" description="Review proofs from Baris, mark up anything that needs to change, and approve when it's right." />
      {waiting > 0 && (
        <div className="notice tone-warning" role="status">
          <ClipboardCheck size={18} />
          <div><strong>{waiting} proof{waiting === 1 ? " is" : "s are"} waiting for your review.</strong></div>
        </div>
      )}
      <section className="surface">
        <SearchBar value={q} set={setQ} placeholder="Search proofs" />
        {loading && !data ? (
          <State loading />
        ) : error ? (
          <State error={error} retry={reload} />
        ) : (
          <DataTable
            rows={rows}
            empty={data?.length ? "No proofs match your search." : "No proofs yet. Baris will notify you when one is ready."}
            columns={[
              {
                label: "Proof",
                render: (r) => (
                  <Link className="record-title" to={`/portal/artworks/${r.id}`}>
                    <strong>{r.title}</strong>
                    <small>{r.number}{r.sku ? ` · ${r.sku.customerSkuCode || r.sku.number}` : ""}</small>
                  </Link>
                ),
              },
              { label: "Version", render: (r) => (r.latestVersion ? `Version ${r.latestVersion.revisionNo}` : "—") },
              {
                label: "Status",
                render: (r) => r.newVersionInPreparation
                  ? <Badge tone="info">New version coming</Badge>
                  : r.latestVersion ? <StatusBadge status={r.latestVersion.status} portal /> : "—",
              },
              { label: "Sent", render: (r) => dateTime(r.latestVersion?.sentAt) },
              { label: "", render: (r) => r.awaitingReview && <Link className="text-link" to={`/portal/artworks/${r.id}`}>Review now →</Link> },
            ]}
          />
        )}
      </section>
    </>
  );
}

// ═══════════════════════════════ Portal: review ═══════════════════════════════

export function PortalArtworkReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: a, loading, error, reload } = useResource<Row>(`/portal/artworks/${id}`);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pending, setPending] = useState<Annotation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const versions: ArtworkVersion[] = a?.versions || [];
  const latest = versions[0];
  const v = versions.find((x) => x.id === versionId) ?? latest;
  const { comments, reload: reloadComments } = useComments(v ? `/portal/artwork-versions/${v.id}/comments` : null);
  const numbers = useMemo(() => numberAnnotated(comments || []), [comments]);
  const open = !!v && v.id === latest?.id && !a?.newVersionInPreparation && AWAITING_CUSTOMER.includes(v.status) && !!a?.canComment;

  // Opening a freshly sent proof tells Baris it is being reviewed.
  useEffect(() => {
    if (latest?.status === "PROOF_SENT") void request(`/portal/artwork-versions/${latest.id}/viewed`, "POST").catch(() => undefined);
  }, [latest?.id, latest?.status]);
  useEffect(() => { setActiveId(null); setPending(null); setDrawing(false); }, [v?.id]);

  if (loading || error || !a) return <State loading={loading} error={error} retry={reload} />;

  const proof = proofOf(v);
  const drafts = (comments || []).filter((c) => c.isDraft).length;

  return (
    <>
      <Back onClick={() => navigate("/portal/artworks")}>Artwork proofs</Back>
      <PageHead
        eyebrow={`${a.number} · VERSION ${v?.revisionNo}`}
        title={a.title}
        description={a.sku ? `${a.sku.customerSkuCode ? `${a.sku.customerSkuCode} · ` : ""}${a.sku.description}` : undefined}
        actions={
          <>
            {v && <StatusBadge status={v.status} portal />}
            {open && (
              <Button primary onClick={() => setSubmitting(true)}>
                <Send size={16} />Submit review{drafts ? ` (${drafts})` : ""}
              </Button>
            )}
          </>
        }
      />

      {a.newVersionInPreparation ? (
        <div className="notice tone-info" role="status"><AlertCircle size={18} /><div><strong>Baris is preparing a new version.</strong> You'll be notified when it's ready to review.</div></div>
      ) : open ? (
        <div className="notice tone-info" role="status">
          <ClipboardCheck size={18} />
          <div>
            <strong>Please review this proof.</strong> Use <em>Mark an area</em> to point at anything that needs to change and add a comment. Your comments stay as drafts, visible to your colleagues, until you submit your review.
            {v?.customerNotes && <><br /><strong>Note from Baris:</strong> {v.customerNotes}</>}
          </div>
        </div>
      ) : v?.status === "CHANGES_REQUESTED" ? (
        <div className="notice tone-warning" role="status"><MessageSquareWarning size={18} /><div><strong>You requested changes.</strong> Baris will send an updated version.</div></div>
      ) : v?.status === "APPROVED" || v?.status === "APPROVED_FOR_PRODUCTION" ? (
        <div className="notice tone-success" role="status"><CheckCircle2 size={18} /><div><strong>Approved.</strong> This version will be used for printing.</div></div>
      ) : null}

      <VersionPills versions={versions} selected={v?.id ?? ""} select={setVersionId} portal />

      <div className="review-layout">
        <div>
          {proof ? (
            <ProofViewer
              fileKey={proof.file.id}
              loadUrl={() => request(`/portal/files/${proof.file.id}/url`)}
              markers={markersFor(comments || [], numbers)}
              activeId={activeId}
              onSelect={setActiveId}
              canDraw={open}
              drawing={drawing}
              onDrawingChange={setDrawing}
              onDraw={(area) => { setPending(area); setDrawing(false); }}
              pending={pending}
            />
          ) : (
            <State empty="This version has no proof file." />
          )}
        </div>
        <div className="review-side">
          <section className="surface">
            <div className="section-head">
              <div>
                <h2>Your comments</h2>
                <p>{open ? "Numbers match the marked areas on the proof." : `Version ${v?.revisionNo}`}</p>
              </div>
              {drafts > 0 && <Badge tone="warning">{drafts} draft{drafts === 1 ? "" : "s"}</Badge>}
            </div>
            {comments === null ? (
              <State loading />
            ) : (
              <ArtworkComments
                mode="portal"
                comments={comments}
                numbers={numbers}
                activeId={activeId}
                onSelect={setActiveId}
                onReply={open ? async (parentId, body) => { await request(`/portal/artwork-versions/${v!.id}/comments`, "POST", { body, parentId }); await reloadComments(); } : undefined}
                onEditDraft={open ? async (cid, body) => { await request(`/portal/artwork-comments/${cid}`, "PATCH", { body }); await reloadComments(); } : undefined}
                onDeleteDraft={open ? async (cid) => { await request(`/portal/artwork-comments/${cid}`, "DELETE"); await reloadComments(); } : undefined}
                onCreate={open ? async (body, area) => { await request(`/portal/artwork-versions/${v!.id}/comments`, "POST", { body, ...(area ? { annotation: area } : {}) }); await reloadComments(); } : undefined}
                pendingArea={pending}
                onClearArea={() => setPending(null)}
                onStartDrawing={open ? () => setDrawing(true) : undefined}
                emptyText={open ? "No comments yet. Mark an area on the proof, or write a general comment below." : "No comments on this version."}
                readOnlyNote={!open && !a.newVersionInPreparation && AWAITING_CUSTOMER.includes(v?.status as ArtworkStatus) && !a.canComment ? "Your login can view proofs but not comment. Ask your administrator." : undefined}
              />
            )}
          </section>
          {v && <DecisionRecords v={v} />}
          <section className="surface padded">
            <h2 style={{ fontSize: 15 }}>About this version</h2>
            <Details
              entries={[
                ["What changed", v?.revisionDescription],
                ["Sent", dateTime(v?.sentAt)],
                ["Your Baris contact", a.accountManager ? <a className="text-link" href={`mailto:${a.accountManager.email}`}>{a.accountManager.name}</a> : "—"],
              ]}
            />
          </section>
        </div>
      </div>

      {submitting && v && (
        <SubmitReviewModal
          artwork={a}
          version={v}
          drafts={drafts}
          close={() => setSubmitting(false)}
          done={(decision) => {
            setSubmitting(false);
            toast(decision === "APPROVED" ? "Thank you. The proof is approved and Baris has been notified." : "Your changes have been sent to Baris.", "success");
            reload();
            void reloadComments();
          }}
        />
      )}
    </>
  );
}

function SubmitReviewModal({ artwork, version, drafts, close, done }: {
  artwork: Row;
  version: ArtworkVersion;
  drafts: number;
  close: () => void;
  done: (decision: "APPROVED" | "CHANGES_REQUESTED") => void;
}) {
  const canApprove = !!artwork.canApprove;
  const [decision, setDecision] = useState<"APPROVED" | "CHANGES_REQUESTED">(drafts > 0 || !canApprove ? "CHANGES_REQUESTED" : "APPROVED");
  const [summary, setSummary] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = decision === "APPROVED" ? accept : summary.trim().length > 0 || drafts > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`/portal/artwork-versions/${version.id}/decision`, "POST", {
        decision,
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(decision === "APPROVED" ? { acceptStatement: accept } : {}),
      });
      done(decision);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Submit your review" description={`${artwork.number} · version ${version.revisionNo}`} close={close}>
      <form onSubmit={submit}>
        <div className="choice-cards" role="radiogroup" aria-label="Your decision">
          <label className={decision === "CHANGES_REQUESTED" ? "selected" : ""}>
            <input type="radio" name="decision" checked={decision === "CHANGES_REQUESTED"} onChange={() => setDecision("CHANGES_REQUESTED")} />
            <span><strong>Request changes</strong>Send your comments to Baris for an updated proof.</span>
          </label>
          <label className={`${decision === "APPROVED" ? "selected" : ""}${!canApprove ? " disabled" : ""}`}>
            <input type="radio" name="decision" disabled={!canApprove} checked={decision === "APPROVED"} onChange={() => setDecision("APPROVED")} />
            <span>
              <strong>Approve for printing</strong>
              {canApprove ? "Confirm this proof is correct as shown." : "Your login isn't authorised to approve artwork."}
            </span>
          </label>
        </div>

        {decision === "CHANGES_REQUESTED" ? (
          <div className="field">
            <label htmlFor="rv-summary">Summary of the changes{drafts === 0 && <span aria-label="required"> *</span>}</label>
            <textarea id="rv-summary" rows={3} maxLength={5000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={drafts ? "Optional: anything else Baris should know" : "Describe what needs to change"} />
            <small>{drafts ? `${drafts} marked-up comment${drafts === 1 ? "" : "s"} will be sent with this.` : "Or close this and mark up the proof first."}</small>
          </div>
        ) : (
          <>
            {drafts > 0 && <div className="notice tone-warning"><AlertCircle size={18} />You have {drafts} draft comment{drafts === 1 ? "" : "s"}. They'll be sent to Baris with your approval.</div>}
            <div className="statement">{artwork.approvalStatement?.text}</div>
            <label className="check" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              I have read and agree to the statement above.
            </label>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="rv-note">Note to Baris (optional)</label>
              <textarea id="rv-note" rows={2} maxLength={5000} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
          </>
        )}

        <FormError error={error} />
        <div className="form-footer">
          <Button type="button" onClick={close} disabled={busy}>Back to proof</Button>
          <Button primary type="submit" disabled={busy || !ready}>
            {busy && <Loader2 size={16} className="spin" />}
            {decision === "APPROVED" ? "Approve proof" : "Send changes to Baris"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════ Dashboard notice ═══════════════════════════════

/** "N proofs are waiting" on the overview pages; renders nothing when there is nothing to do. */
export function ArtworkDashboardNotice({ portal }: { portal?: boolean }) {
  // Demo mode keeps its own artwork preview; this notice is for live data only.
  const allowed = !isDemo() && (portal ? can("portal.artwork.view") : can("artwork.view"));
  const { data } = useResource<Row>(allowed ? (portal ? "/portal/artworks" : "/artworks?filter=NEEDS_ACTION&pageSize=1") : null);
  if (!data) return null;
  const count = portal ? (data as unknown as Row[]).filter((r) => r.awaitingReview).length : data.total ?? 0;
  if (!count) return null;
  return (
    <div className="notice tone-warning" role="status">
      <ClipboardCheck size={18} />
      <div>
        <strong>
          {portal
            ? `${count} artwork proof${count === 1 ? " is" : "s are"} waiting for your review.`
            : `${count} artwork${count === 1 ? "" : "s"} with customer changes to action.`}
        </strong>{" "}
        <Link className="text-link" to={portal ? "/portal/artworks" : "/artworks?filter=NEEDS_ACTION"}>{portal ? "Review now" : "Open"} →</Link>
      </div>
    </div>
  );
}
