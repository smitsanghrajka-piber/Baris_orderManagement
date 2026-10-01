import { useState } from "react";
import { ArtworkDashboardNotice } from "./Artworks";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Box,
  FileCheck2,
  Layers,
  Package,
  Plus,
  Users,
} from "lucide-react";
import {
  AddButton,
  Badge,
  Button,
  DataTable,
  Details,
  Modal,
  PageHead,
  RecordForm,
  SearchBar,
  State,
  date,
  human,
  useResource,
  type Field,
  type Row,
} from "../components/ui";
import { can, isDemo, request } from "../lib/api";
import { toast } from "../lib/toast";
const enumOptions = (...v: string[]) =>
  v.map((value) => ({ value, label: human(value) }));
export function Dashboard({ portal = false }: { portal?: boolean }) {
  const skus = useResource(
    portal
      ? "/portal/skus"
      : can("sku.view")
        ? "/skus?pageSize=5&sort=updatedAt:desc"
        : null,
  );
  const customers = useResource(
    !portal && can("customer.view") ? "/customers?pageSize=1" : null,
  );
  const notifications = useResource("/notifications");
  const rows = portal ? skus.data || [] : skus.data?.items || [];
  return (
    <>
      <PageHead
        eyebrow="YOUR WORKSPACE AT A GLANCE"
        title={portal ? "Your label workspace" : "Overview"}
        description={
          portal
            ? "Your labels, approved specifications and shared updates."
            : "Keep every customer and every label moving in the right direction."
        }
        actions={
          can("sku.create") &&
          !portal && (
            <Link className="btn primary" to="/skus?new=1">
              <Plus size={16} />
              Create a label
            </Link>
          )
        }
      />
      <ArtworkDashboardNotice portal={portal} />
      <div className="overview-intro">
        <div>
          <div className="eyebrow">A CLEAR PATH TO PRINT</div>
          <h2>
            Start with the right
            <br />
            specification.
          </h2>
          <p>
            Define the material, finish and print requirements.
            <br />
            Keep every revision traceable and ready for approval.
          </p>
          <Link className="text-link" to={portal ? "/portal/skus" : "/skus"}>
            Open your label library <ArrowRight size={17} />
          </Link>
        </div>
        <div className="workflow-mark">
          <Layers size={60} strokeWidth={1.2} />
          <div>
            Define <span>→</span> Review <span>→</span> Approve
          </div>
        </div>
      </div>
      <div className="metrics">
        {!portal && can("customer.view") && (
          <Link to="/customers">
            <Users size={21} />
            <span>Customers</span>
            <strong>
              {customers.loading
                ? "…"
                : customers.error
                  ? "—"
                  : (customers.data?.total ?? 0)}
            </strong>
            <small>Customer records</small>
          </Link>
        )}
        <Link to={portal ? "/portal/skus" : "/skus"}>
          <Layers size={21} />
          <span>Label SKUs</span>
          <strong>
            {skus.loading
              ? "…"
              : skus.error
                ? "—"
                : portal
                  ? rows.length
                  : (skus.data?.total ?? 0)}
          </strong>
          <small>
            {portal ? "Your product library" : "Across all customers"}
          </small>
        </Link>
        <Link to={portal ? "/portal/notifications" : "/notifications"}>
          <FileCheck2 size={21} />
          <span>Unread updates</span>
          <strong>
            {notifications.loading
              ? "…"
              : notifications.error
                ? "—"
                : (notifications.data?.filter((n: Row) => !n.readAt).length ??
                  0)}
          </strong>
          <small>Latest 50 notifications</small>
        </Link>
      </div>
      <div className="dashboard-grid">
        <section className="surface">
          <div className="section-head">
            <div>
              <h2>{portal ? "Your labels" : "Recently updated labels"}</h2>
              <p>Specifications that keep everyone aligned.</p>
            </div>
            <Link className="text-link" to={portal ? "/portal/skus" : "/skus"}>
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {skus.loading || skus.error ? (
            <State
              loading={skus.loading}
              error={skus.error}
              retry={skus.reload}
            />
          ) : (
            <DataTable
              rows={rows.slice(0, 5)}
              columns={[
                {
                  label: "Label",
                  render: (r) => (
                    <Link to={`${portal ? "/portal" : ""}/skus/${r.id}`}>
                      <strong>{r.description}</strong>
                      <small>{r.number}</small>
                    </Link>
                  ),
                },
                { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
              ]}
            />
          )}
        </section>
        <section className="surface padded">
          <div className="eyebrow">WORKSPACE GUIDE</div>
          <h2>Your next step</h2>
          <div className="next-step">
            <span>01</span>
            <div>
              <h3>
                {portal
                  ? "Review your labels"
                  : "Set up the material catalogue"}
              </h3>
              <p>
                {portal
                  ? "Open any label to see its current approved specification."
                  : "Add print materials so specifications use a consistent source."}
              </p>
              <Link to={portal ? "/portal/skus" : "/materials"}>
                Open {portal ? "labels" : "materials"} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
          {!portal && (
            <div className="next-step">
              <span>02</span>
              <div>
                <h3>Create a customer label</h3>
                <p>
                  Assign the customer, then add dimensions, material and print
                  details.
                </p>
                <Link to="/skus">
                  Open label library <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
const lookupTabs: Record<string, string> = {
  materials: "Materials",
  finishes: "Finishes",
  "colour-systems": "Colour systems",
  "label-types": "Label types",
  applications: "Applications",
  "payment-terms": "Payment terms",
  carriers: "Carriers",
  machines: "Machines",
};
export function MasterData({
  materialsOnly = false,
}: {
  materialsOnly?: boolean;
}) {
  const [kind, setKind] = useState("materials");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null | false>(false);
  const { data, loading, error, reload } = useResource(
    `/master-data/lookups/${kind}`,
  );
  const permission =
    kind === "machines"
      ? "master_data.machines.edit"
      : "master_data.lookups.edit";
  const fields: Field[] = [
    {
      name: "code",
      label: "Code",
      required: true,
      pattern: "[A-Z0-9][A-Z0-9_\\-]{0,39}",
      maxLength: 40,
      help: "Uppercase letters, numbers, underscores or hyphens.",
    },
    { name: "name", label: "Name", required: true, maxLength: 120 },
    ...(kind === "materials"
      ? [
          {
            name: "micronDefault",
            label: "Default thickness (µm)",
            type: "number" as const,
            min: 0,
          },
        ]
      : []),
    ...(kind === "payment-terms"
      ? [
          {
            name: "days",
            label: "Days",
            type: "number" as const,
            required: true,
            min: 0,
            step: "1",
          },
        ]
      : []),
    ...(kind === "machines" ? [{ name: "type", label: "Machine type" }] : []),
    {
      name: "isActive",
      label: "Available for new specifications",
      type: "checkbox",
    },
  ];
  const rows = (data || []).filter((r: Row) =>
    `${r.name} ${r.code}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHead
        eyebrow="PRINT FOUNDATIONS"
        title={materialsOnly ? "Materials" : "Master data"}
        description={
          materialsOnly
            ? "The controlled catalogue of materials available for your label specifications."
            : "Consistent choices for specifications, customer records and print operations."
        }
        actions={
          can(permission) && (
            <AddButton onClick={() => setEditing(null)}>
              Add {lookupTabs[kind].toLowerCase().replace(/s$/, "")}
            </AddButton>
          )
        }
      />
      {!materialsOnly && (
        <div className="tabs scroll-tabs">
          {Object.entries(lookupTabs).map(([k, label]) => (
            <button
              key={k}
              className={kind === k ? "active" : ""}
              onClick={() => {
                setKind(k);
                setQ("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {materialsOnly && (
        <div className="notice tone-info">
          <Box size={19} />
          <div>
            <strong>Materials link directly to label specifications.</strong>
            <br />
            This catalogue stores material types and thickness. Stock receipts,
            lot numbers and quantities need an inventory backend.
          </div>
        </div>
      )}
      <div className="surface">
        <SearchBar
          value={q}
          set={setQ}
          placeholder={`Search ${lookupTabs[kind].toLowerCase()}…`}
        />
        {loading || error ? (
          <State loading={loading} error={error} retry={reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                label: "Name",
                render: (r) => (
                  <div className="record-title">
                    <span className="label-icon">
                      <Box size={19} />
                    </span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.code}</small>
                    </span>
                  </div>
                ),
              },
              ...(kind === "materials"
                ? [
                    {
                      label: "Default thickness",
                      render: (r: Row) =>
                        r.micronDefault != null ? `${r.micronDefault} µm` : "—",
                    },
                  ]
                : []),
              {
                label: "Availability",
                render: (r) => (
                  <Badge>{r.isActive ? "ACTIVE" : "INACTIVE"}</Badge>
                ),
              },
              {
                label: "Actions",
                render: (r) =>
                  can(permission) ? (
                    <Button onClick={() => setEditing(r)}>Edit</Button>
                  ) : (
                    "View only"
                  ),
              },
            ]}
          />
        )}
      </div>
      {editing !== false && (
        <Modal
          title={
            editing
              ? `Edit ${editing.name}`
              : `Add ${lookupTabs[kind].toLowerCase().replace(/s$/, "")}`
          }
          close={() => setEditing(false)}
        >
          <RecordForm
            fields={fields}
            initial={editing || { isActive: true }}
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await request(
                `/master-data/lookups/${kind}${editing ? `/${editing.id}` : ""}`,
                editing ? "PATCH" : "POST",
                body,
              );
              setEditing(false);
              reload();
              toast("Master record saved.", "success");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function Tooling() {
  const [tab, setTab] = useState("tools");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null | false>(false);
  const { data, loading, error, reload } = useResource(
    `/tooling/${tab}?q=${encodeURIComponent(q)}&page=${page}&pageSize=20`,
  );
  const fields: Field[] = [
    {
      name: "code",
      label: "Code",
      required: true,
      pattern: "[A-Z0-9][A-Z0-9_\\-]{0,39}",
      maxLength: 40,
    },
    { name: "name", label: "Name", required: true, maxLength: 120 },
    {
      name: "type",
      label: "Type",
      type: "select",
      options:
        tab === "tools"
          ? enumOptions("DIE", "CUTTING_TOOL", "OTHER")
          : enumOptions("PLATE", "CYLINDER"),
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: enumOptions("ACTIVE", "MAINTENANCE", "RETIRED"),
    },
    ...(tab === "tools"
      ? [
          {
            name: "widthMm",
            label: "Width (mm)",
            type: "number" as const,
            min: 0,
          },
          {
            name: "heightMm",
            label: "Height (mm)",
            type: "number" as const,
            min: 0,
          },
          {
            name: "cavities",
            label: "Cavities",
            type: "number" as const,
            min: 0,
            step: "1",
          },
          { name: "location", label: "Storage location" },
        ]
      : [
          {
            name: "colourCount",
            label: "Colours",
            type: "number" as const,
            min: 0,
            step: "1",
          },
        ]),
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <>
      <PageHead
        eyebrow="PRINT ASSETS"
        title="Tooling & plates"
        description="Keep your dies, cutting tools and plate sets ready for the right label."
        actions={
          can("tooling.edit") && (
            <AddButton onClick={() => setEditing(null)}>
              Add {tab === "tools" ? "tool" : "plate set"}
            </AddButton>
          )
        }
      />
      <div className="tabs">
        {["tools", "plate-sets"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t === "tools" ? "Dies & tools" : "Plate sets"}
          </button>
        ))}
      </div>
      <div className="surface">
        <SearchBar
          value={q}
          set={(v) => {
            setQ(v);
            setPage(1);
          }}
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
                label: "Asset",
                render: (r) => (
                  <>
                    <strong>{r.name}</strong>
                    <small>{r.code}</small>
                  </>
                ),
              },
              { label: "Type", render: (r) => human(r.type) },
              { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
              {
                label: tab === "tools" ? "Location" : "Colours",
                render: (r) =>
                  tab === "tools" ? r.location || "—" : (r.colourCount ?? "—"),
              },
              {
                label: "Actions",
                render: (r) =>
                  can("tooling.edit") && (
                    <Button onClick={() => setEditing(r)}>Edit</Button>
                  ),
              },
            ]}
          />
        )}
      </div>
      {editing !== false && (
        <Modal
          title={editing ? "Edit asset" : "Add print asset"}
          close={() => setEditing(false)}
        >
          <RecordForm
            fields={fields}
            initial={
              editing || {
                status: "ACTIVE",
                type: tab === "tools" ? "DIE" : "PLATE",
              }
            }
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await request(
                `/tooling/${tab}${editing ? `/${editing.id}` : ""}`,
                editing ? "PATCH" : "POST",
                body,
              );
              setEditing(false);
              reload();
              toast("Asset saved.", "success");
            }}
          />
        </Modal>
      )}
    </>
  );
}
const workflowConfig: Record<
  string,
  {
    title: string;
    description: string;
    endpoint: string;
    statuses: string[];
    icon: typeof Package;
  }
> = {
  orders: {
    title: "Orders",
    description: "From customer commitment to a print-ready order.",
    endpoint: "orders",
    statuses: ["CONFIRMED", "PRINTING", "READY", "DISPATCHED"],
    icon: Package,
  },
  artworks: {
    title: "Artwork approvals",
    description: "Make every proof, revision and customer decision traceable.",
    endpoint: "artworks",
    statuses: ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "CHANGES_REQUESTED"],
    icon: FileCheck2,
  },
  quotations: {
    title: "Quotations",
    description:
      "Clear quantities, print specifications and prices for every customer.",
    endpoint: "quotations",
    statuses: ["DRAFT", "SENT", "ACCEPTED", "DECLINED"],
    icon: FileCheck2,
  },
  production: {
    title: "Production",
    description: "Follow every print job through the production stages.",
    endpoint: "orders",
    statuses: ["CONFIRMED", "PRINTING", "READY", "DISPATCHED"],
    icon: Layers,
  },
  dispatch: {
    title: "Dispatch",
    description: "A clear handover from finished labels to customer delivery.",
    endpoint: "orders",
    statuses: ["CONFIRMED", "PRINTING", "READY", "DISPATCHED"],
    icon: Package,
  },
};
export function Workflow({ kind }: { kind: string }) {
  const cfg = workflowConfig[kind];
  const demo = isDemo();
  const { data, loading, error, reload } = useResource(
    demo ? `/design/${cfg.endpoint}` : null,
  );
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Row | null>(null);
  const [create, setCreate] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = (data || []).filter(
    (r: Row) =>
      JSON.stringify(r).toLowerCase().includes(q.toLowerCase()) &&
      (filter === "ALL" || r.status === filter),
  );
  const fields: Field[] = [
    { name: "customer", label: "Customer", required: true },
    { name: "description", label: "Label description", required: true },
    ...(kind !== "artworks"
      ? [
          {
            name: "quantity",
            label: "Quantity",
            type: "number" as const,
            required: true,
            min: 1,
            step: "1",
          },
        ]
      : [
          {
            name: "revision",
            label: "Revision",
            type: "number" as const,
            required: true,
            min: 1,
            step: "1",
          },
        ]),
    ...(kind === "quotations"
      ? [
          {
            name: "unitPrice",
            label: "Unit price (AUD)",
            type: "number" as const,
            required: true,
            min: 0,
          },
        ]
      : []),
    {
      name: "status",
      label: "Status",
      type: "select",
      options: enumOptions(...cfg.statuses),
      required: true,
    },
  ];
  async function update(body: Row) {
    setBusy(true);
    setActionError("");
    try {
      const next = await request(
        `/design/${cfg.endpoint}/${selected!.id}`,
        "PATCH",
        body,
      );
      setSelected({ ...next });
      reload();
      toast("Demo record updated.", "success");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ORDER WORKSPACE"
        title={cfg.title}
        description={cfg.description}
        actions={
          demo && (
            <AddButton onClick={() => setCreate(true)}>
              New{" "}
              {kind === "artworks"
                ? "proof"
                : kind === "quotations"
                  ? "quotation"
                  : "order"}
            </AddButton>
          )
        }
      />
      <div className="notice tone-info">
        <cfg.icon size={20} />
        <div>
          <strong>
            {demo
              ? "Interactive design preview"
              : "This workflow is awaiting its backend."}
          </strong>
          <br />
          {demo
            ? "These are sample records. Changes stay in this browser; no proofs, orders or messages are sent."
            : "The repository does not yet provide APIs for this workflow. Open the demo from the sign-in page to explore the proposed experience."}
        </div>
      </div>
      {demo ? (
        <div className="surface">
          <SearchBar
            value={q}
            set={setQ}
            placeholder={`Search ${cfg.title.toLowerCase()}…`}
          >
            <select
              aria-label="Filter status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              {cfg.statuses.map((s) => (
                <option key={s} value={s}>
                  {human(s)}
                </option>
              ))}
            </select>
          </SearchBar>
          {loading || error ? (
            <State loading={loading} error={error} retry={reload} />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                {
                  label: "Reference / label",
                  render: (r) => (
                    <button
                      className="record-link"
                      onClick={() => {
                        setActionError("");
                        setSelected(r);
                      }}
                    >
                      <strong>{r.description}</strong>
                      <small>{r.number}</small>
                    </button>
                  ),
                },
                { label: "Customer", render: (r) => r.customer },
                {
                  label: kind === "artworks" ? "Revision" : "Quantity",
                  render: (r) =>
                    kind === "artworks"
                      ? `Rev ${r.revision}`
                      : r.quantity?.toLocaleString(),
                },
                ...(kind === "quotations"
                  ? [
                      {
                        label: "Value (AUD)",
                        render: (r: Row) =>
                          new Intl.NumberFormat("en-AU", {
                            style: "currency",
                            currency: "AUD",
                          }).format(r.quantity * r.unitPrice),
                      },
                    ]
                  : []),
                { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
                {
                  label: "View",
                  render: (r) => (
                    <button
                      className="icon-btn"
                      aria-label={`View ${r.number}`}
                      onClick={() => setSelected(r)}
                    >
                      <ArrowRight size={18} />
                    </button>
                  ),
                },
              ]}
            />
          )}
        </div>
      ) : (
        <section className="surface">
          <State empty={`Your ${cfg.title.toLowerCase()} will appear here`} />
        </section>
      )}
      {create && (
        <Modal
          title={`Create demo ${kind === "artworks" ? "proof" : kind === "quotations" ? "quotation" : "order"}`}
          close={() => setCreate(false)}
        >
          <RecordForm
            fields={fields}
            initial={{ status: cfg.statuses[0] }}
            submit="Create sample record"
            onCancel={() => setCreate(false)}
            onSubmit={async (body) => {
              await request(`/design/${cfg.endpoint}`, "POST", {
                ...body,
                number: `DEMO-${Date.now().toString().slice(-6)}`,
              });
              setCreate(false);
              reload();
              toast("Sample record created.", "success");
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.number}
          description="Sample record · design preview only"
          close={() => setSelected(null)}
        >
          <h3>{selected.description}</h3>
          <Details
            entries={[
              ["Customer", selected.customer],
              ["Status", <Badge>{selected.status}</Badge>],
              ["Quantity", selected.quantity?.toLocaleString()],
              ["Due date", selected.due ? date(selected.due) : "—"],
            ]}
          />
          {actionError && (
            <div className="notice tone-danger" role="alert">
              {actionError}
            </div>
          )}
          <RecordForm
            key={selected.id}
            fields={[
              {
                name: "status",
                label: "Workflow status",
                type: "select",
                options: enumOptions(...cfg.statuses),
                required: true,
              },
              ...(kind === "artworks"
                ? [
                    {
                      name: "comments",
                      label: "Review comments",
                      type: "textarea" as const,
                    },
                  ]
                : []),
            ]}
            initial={selected}
            submit={busy ? "Saving…" : "Save demo changes"}
            onSubmit={update}
          />
          <p className="muted">
            {kind === "artworks"
              ? "A production version needs uploaded proofs, approval history and verified approvers."
              : "A production version needs validated order lines, quantities and backend status transitions."}
          </p>
        </Modal>
      )}
    </>
  );
}
