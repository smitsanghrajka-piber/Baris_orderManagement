import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { errorMessage, request } from "../lib/api";
import { dismissToast, subscribeToasts, type Toast } from "../lib/toast";
export type Row = Record<string, any>;
export const human = (value: unknown) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const date = (v?: string) =>
  v
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Sydney",
      }).format(new Date(v))
    : "—";
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const text = String(children).toUpperCase();
  const resolved =
    tone ||
    (/ACTIVE|APPROVED|COMPLETE|DISPATCHED/.test(text)
      ? "success"
      : /DRAFT|PROSPECT|INACTIVE|SUPERSEDED/.test(text)
        ? "neutral"
        : /HOLD|AWAITING|MAINTENANCE/.test(text)
          ? "warning"
          : "info");
  return (
    <span className={`badge tone-${resolved}`}>
      {typeof children === "string" ? human(children) : children}
    </span>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function Button({
  children,
  primary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button className={primary ? "btn primary" : "btn"} {...props}>
      {children}
    </button>
  );
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button primary onClick={onClick}>
      <Plus size={16} />
      {children}
    </Button>
  );
}
export function State({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: string;
  retry?: () => void;
}) {
  return (
    <div className="empty" role={error ? "alert" : "status"}>
      {loading ? (
        <Loader2 className="spin" size={28} />
      ) : error ? (
        <AlertCircle size={28} />
      ) : (
        <Inbox size={32} />
      )}
      <h3>
        {loading
          ? "Loading your workspace…"
          : error
            ? "Couldn’t load this page"
            : empty || "No records yet"}
      </h3>
      {error && (
        <>
          <p>{error}</p>
          <Button onClick={retry}>Try again</Button>
        </>
      )}
    </div>
  );
}
export function useResource<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((r) => r + 1);
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    request<T>(path)
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, revision]);
  return { data, loading, error, reload };
}
export interface Field {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "textarea"
    | "select"
    | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
  section?: string;
  pattern?: string;
}
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  submit = "Save changes",
  onCancel,
}: {
  fields: Field[];
  initial?: Row;
  onSubmit: (data: Row) => Promise<unknown>;
  submit?: string;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Row>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const payload: Row = {};
        for (const f of fields) {
          const v = values[f.name];
          if (f.type === "checkbox") payload[f.name] = !!v;
          else if (v !== undefined && v !== "" && v !== null)
            payload[f.name] = f.type === "number" ? Number(v) : v;
        }
        try {
          await onSubmit(payload);
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f, i) => (
          <div
            key={f.name}
            className={
              f.type === "textarea" || f.section ? "field wide" : "field"
            }
          >
            {f.section && <h3 className="form-section">{f.section}</h3>}
            {f.type === "checkbox" ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!values[f.name]}
                  onChange={(e) =>
                    setValues({ ...values, [f.name]: e.target.checked })
                  }
                />
                {f.label}
              </label>
            ) : (
              <>
                <label htmlFor={`field-${f.name}`}>
                  {f.label}
                  {f.required && <span aria-label="required"> *</span>}
                </label>
                {f.type === "select" ? (
                  <select
                    id={`field-${f.name}`}
                    required={f.required}
                    value={values[f.name] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.name]: e.target.value })
                    }
                  >
                    <option value="">Select {f.label.toLowerCase()}</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    id={`field-${f.name}`}
                    maxLength={f.maxLength || 5000}
                    rows={3}
                    value={values[f.name] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.name]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    autoFocus={i === 0}
                    id={`field-${f.name}`}
                    type={f.type || "text"}
                    required={f.required}
                    min={f.min}
                    max={f.max}
                    step={f.step || (f.type === "number" ? "any" : undefined)}
                    pattern={f.pattern}
                    maxLength={f.maxLength || 200}
                    value={values[f.name] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.name]: e.target.value })
                    }
                  />
                )}
              </>
            )}
            {f.help && <small>{f.help}</small>}
          </div>
        ))}
      </div>
      {error && (
        <div className="notice tone-danger" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      <div className="form-footer">
        {onCancel && (
          <Button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button primary type="submit" disabled={busy}>
          {busy && <Loader2 size={16} className="spin" />}
          {busy ? "Saving…" : submit}
        </Button>
      </div>
    </form>
  );
}
export function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = ref.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const all = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), select, textarea, a[href]",
          ) || [],
        );
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [close]);
  return (
    <div className="modal-overlay">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-btn"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function DataTable({
  columns,
  rows,
  empty = "No matching records",
  page,
  total,
  pageSize = 20,
  onPage,
}: {
  columns: { label: string; render: (row: Row) => ReactNode }[];
  rows: Row[];
  empty?: string;
  page?: number;
  total?: number;
  pageSize?: number;
  onPage?: (page: number) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c, i) => (
                <td key={i}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <State empty={empty} />}
      {page && total !== undefined && (
        <div className="table-footer">
          <span>
            {total
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
              : "0 records"}
          </span>
          <div className="actions">
            <button
              className="icon-btn"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => onPage?.(page - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>Page {page}</span>
            <button
              className="icon-btn"
              aria-label="Next page"
              disabled={page * pageSize >= total}
              onClick={() => onPage?.(page + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export function SearchBar({
  value,
  set,
  placeholder = "Search records…",
  children,
}: {
  value: string;
  set: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="search-input">
        <Search size={17} />
        <input
          aria-label={placeholder}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
        />
        {value && (
          <button
            className="icon-btn"
            aria-label="Clear search"
            onClick={() => set("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
export function Back({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className="back" onClick={onClick}>
      <ArrowLeft size={15} />
      {children}
    </button>
  );
}
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast tone-${t.tone}`}>
          {t.message}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(t.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
export function Details({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="details">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
