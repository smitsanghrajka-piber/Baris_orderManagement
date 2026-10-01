import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Mail } from "lucide-react";
import {
  AddButton,
  Badge,
  Button,
  DataTable,
  Modal,
  PageHead,
  RecordForm,
  SearchBar,
  State,
  date,
  useResource,
  type Field,
  type Row,
} from "../components/ui";
import { can, errorMessage, isDemo, request } from "../lib/api";
import { toast } from "../lib/toast";
export function UsersPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null | false>(false);
  const { data, loading, error, reload } = useResource(
    `/users?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`,
  );
  const roles = useResource(editing === null ? "/roles?scope=STAFF" : null);
  const fields: Field[] = [
    { name: "name", label: "Full name", required: true, maxLength: 120 },
    { name: "email", label: "Work email", type: "email", required: true },
    ...(editing
      ? [
          {
            name: "isActive",
            label: "Account active",
            type: "checkbox" as const,
          },
        ]
      : [
          {
            name: "roleCode",
            label: "Role",
            type: "select" as const,
            required: true,
            options: (roles.data || []).map((r: Row) => ({
              value: r.code,
              label: r.name,
            })),
            help: "The backend sends the account invitation.",
          },
        ]),
  ];
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Team & access"
        description="Give each person the access they need to do their work."
        actions={
          <AddButton onClick={() => setEditing(null)}>
            Add team member
          </AddButton>
        }
      />
      <div className="surface">
        <SearchBar
          value={q}
          set={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search team members…"
        />
        {loading || error ? (
          <State loading={loading} error={error} retry={reload} />
        ) : (
          <DataTable
            rows={data?.items || []}
            page={page}
            total={data?.total}
            onPage={setPage}
            columns={[
              {
                label: "Team member",
                render: (r) => (
                  <>
                    <strong>{r.name}</strong>
                    <small>{r.email}</small>
                  </>
                ),
              },
              {
                label: "Role",
                render: (r) =>
                  (r.roles || [])
                    .map((role: any) =>
                      typeof role === "string"
                        ? role
                        : role.role?.name || role.name || role.code,
                    )
                    .join(", "),
              },
              {
                label: "Status",
                render: (r) => (
                  <Badge>
                    {r.lockedAt
                      ? "ON_HOLD"
                      : r.isActive
                        ? "ACTIVE"
                        : "INACTIVE"}
                  </Badge>
                ),
              },
              {
                label: "Actions",
                render: (r) => (
                  <Button onClick={() => setEditing(r)}>Edit</Button>
                ),
              },
            ]}
          />
        )}
      </div>
      {editing !== false && (
        <Modal
          title={editing ? "Edit team member" : "Invite team member"}
          description={
            isDemo() ? "Demo only. No invitation is sent." : undefined
          }
          close={() => setEditing(false)}
        >
          {roles.loading || roles.error ? (
            <State
              loading={roles.loading}
              error={roles.error}
              retry={roles.reload}
            />
          ) : (
            <RecordForm
              fields={fields}
              initial={editing || {}}
              onCancel={() => setEditing(false)}
              onSubmit={async (body) => {
                const { roleCode, ...rest } = body;
                await request(
                  `/users${editing ? `/${editing.id}` : ""}`,
                  editing ? "PATCH" : "POST",
                  editing ? rest : { ...rest, roleCodes: [roleCode] },
                );
                setEditing(false);
                reload();
                toast("Team member saved.", "success");
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}
export function Settings() {
  const { data, loading, error, reload } = useResource("/settings/company");
  const fields: Field[] = [
    {
      name: "legalName",
      label: "Legal company name",
      required: true,
      section: "Company identity",
    },
    { name: "tradingName", label: "Trading name" },
    { name: "abn", label: "ABN", maxLength: 20 },
    { name: "email", label: "Company email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "website", label: "Website" },
    { name: "street", label: "Street", section: "Address" },
    { name: "suburb", label: "Suburb" },
    { name: "state", label: "State" },
    { name: "postcode", label: "Postcode" },
    {
      name: "defaultCurrency",
      label: "Default currency",
      maxLength: 3,
      section: "Commercial defaults",
    },
    { name: "gstRatePct", label: "GST (%)", type: "number", min: 0, max: 100 },
    {
      name: "quoteValidityDays",
      label: "Quotation validity (days)",
      type: "number",
      min: 1,
      max: 365,
      step: "1",
    },
    {
      name: "defaultOversPct",
      label: "Default overs (%)",
      type: "number",
      min: 0,
      max: 100,
    },
  ];
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Company settings"
        description="Your company identity and default commercial settings."
      />
      {loading || error ? (
        <State loading={loading} error={error} retry={reload} />
      ) : (
        <section className="surface padded settings-form">
          <RecordForm
            fields={fields}
            initial={data || {}}
            onSubmit={async (body) => {
              await request("/settings/company", "PATCH", body);
              toast("Company settings saved.", "success");
              reload();
            }}
          />
        </section>
      )}
    </>
  );
}
export function Notifications() {
  const { data, loading, error, reload } = useResource("/notifications");
  const [busy, setBusy] = useState(false);
  async function mark(id: string) {
    setBusy(true);
    try {
      await request(
        `/notifications/${id === "all" ? "read-all" : `${id}/read`}`,
        "POST",
      );
      reload();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE UPDATES"
        title="Notifications"
        description="Your latest specification and account updates."
        actions={
          <Button disabled={busy} onClick={() => mark("all")}>
            <Check size={16} />
            Mark all as read
          </Button>
        }
      />
      <section className="surface">
        {loading || error ? (
          <State loading={loading} error={error} retry={reload} />
        ) : data?.length ? (
          <div className="notification-list">
            {data.map((r: Row) => (
              <div key={r.id} className={r.readAt ? "" : "unread"}>
                <span className="label-icon">
                  <Mail size={20} />
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.body}</p>
                  <small>{date(r.createdAt)}</small>
                  {r.link && <Link to={r.link}>View record</Link>}
                </div>
                {!r.readAt && (
                  <Button disabled={busy} onClick={() => mark(r.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <State empty="You’re all caught up" />
        )}
      </section>
    </>
  );
}
export function Audit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const { data, loading, error, reload } = useResource(
    `/audit?action=${encodeURIComponent(action)}&page=${page}&pageSize=20`,
  );
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const text = await request<string>(
        `/audit/export.csv?action=${encodeURIComponent(action)}`,
      );
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "baris-audit.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ACCOUNTABILITY"
        title="Audit trail"
        description="A traceable history of changes to your business records."
        actions={
          can("audit.export") &&
          !isDemo() && (
            <Button disabled={busy} onClick={download}>
              <Download size={16} />
              Export CSV
            </Button>
          )
        }
      />
      <section className="surface">
        <SearchBar
          value={action}
          set={(v) => {
            setAction(v);
            setPage(1);
          }}
          placeholder="Filter by action, e.g. SPEC_APPROVED…"
        />
        {loading || error ? (
          <State loading={loading} error={error} retry={reload} />
        ) : (
          <DataTable
            rows={data?.items || []}
            page={page}
            total={data?.total}
            onPage={setPage}
            columns={[
              {
                label: "Action",
                render: (r) => (
                  <button
                    className="record-link"
                    onClick={() => setSelected(r)}
                  >
                    {r.action}
                  </button>
                ),
              },
              { label: "Entity", render: (r) => r.entityType },
              { label: "By", render: (r) => r.actorName || "System" },
              { label: "Date", render: (r) => date(r.createdAt) },
            ]}
          />
        )}
      </section>
      {selected && (
        <Modal title={selected.action} close={() => setSelected(null)}>
          <h3>Before</h3>
          <pre className="json-view">
            {JSON.stringify(selected.before || {}, null, 2)}
          </pre>
          <h3>After</h3>
          <pre className="json-view">
            {JSON.stringify(selected.after || {}, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
}
