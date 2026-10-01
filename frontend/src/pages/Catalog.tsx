import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowRight, Check, Edit3, FileText } from "lucide-react";
import {
  AddButton,
  Back,
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
import { can, errorMessage, request } from "../lib/api";
import { toast } from "../lib/toast";
const options = (rows?: Row[]) =>
  (rows || [])
    .filter((r) => r.isActive !== false)
    .map((r) => ({ value: r.id, label: r.name }));
const enums = (...values: string[]) =>
  values.map((v) => ({ value: v, label: human(v) }));
export function Catalog({
  kind,
  portal = false,
}: {
  kind: "customers" | "skus";
  portal?: boolean;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(params.get("new") === "1");
  useEffect(() => {
    setQ(params.get("q") || "");
    setPage(1);
  }, [params]);
  const isCustomer = kind === "customers";
  const endpoint = portal
    ? "/portal/skus"
    : `/${kind}?page=${page}&pageSize=20&q=${encodeURIComponent(q)}&status=${status}`;
  const { data, loading, error, reload } = useResource(endpoint);
  const md = useResource(open ? "/master-data" : null);
  const customers = useResource(
    open && !isCustomer ? "/customers?pageSize=200" : null,
  );
  const rows = portal
    ? (data || []).filter((r: Row) =>
        `${r.description} ${r.number}`.toLowerCase().includes(q.toLowerCase()),
      )
    : data?.items || [];
  const fields: Field[] = isCustomer
    ? [
        { name: "name", label: "Company name", required: true },
        { name: "tradingName", label: "Trading name" },
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Phone" },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: enums("PROSPECT", "ACTIVE", "ON_HOLD", "INACTIVE"),
        },
        { name: "currency", label: "Currency", maxLength: 3 },
        { name: "billingSuburb", label: "Billing suburb" },
        { name: "billingState", label: "State" },
        { name: "notes", label: "Internal notes", type: "textarea" },
      ]
    : [
        {
          name: "customerId",
          label: "Customer",
          type: "select",
          required: true,
          options: options(customers.data?.items),
          help: "Select the customer that owns this label.",
        },
        { name: "customerSkuCode", label: "Customer SKU code", maxLength: 80 },
        {
          name: "description",
          label: "Label description",
          required: true,
          maxLength: 300,
        },
        { name: "mouldedProduct", label: "Moulded product / pack size" },
        {
          name: "labelTypeId",
          label: "Label type",
          type: "select",
          options: options(md.data?.labelTypes),
        },
        {
          name: "applicationId",
          label: "Application",
          type: "select",
          options: options(md.data?.applications),
        },
      ];
  return (
    <>
      <PageHead
        eyebrow={portal ? "YOUR PRODUCT LIBRARY" : "MASTER RECORDS"}
        title={isCustomer ? "Customers" : "Label library"}
        description={
          isCustomer
            ? "One place for your relationships, requirements and delivery details."
            : "Customer labels and their controlled specifications, from draft to approved."
        }
        actions={
          !portal &&
          can(isCustomer ? "customer.create" : "sku.create") && (
            <AddButton onClick={() => setOpen(true)}>
              {isCustomer ? "New customer" : "New label"}
            </AddButton>
          )
        }
      />
      <div className="surface">
        <SearchBar
          value={q}
          set={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder={
            isCustomer
              ? "Search company or customer number…"
              : "Search label, SKU or customer…"
          }
        >
          {!portal && (
            <select
              aria-label="Filter status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All statuses</option>
              {(isCustomer
                ? ["PROSPECT", "ACTIVE", "ON_HOLD", "INACTIVE"]
                : ["DRAFT", "ACTIVE", "ON_HOLD", "DISCONTINUED"]
              ).map((s) => (
                <option key={s} value={s}>
                  {human(s)}
                </option>
              ))}
            </select>
          )}
        </SearchBar>
        {loading || error ? (
          <State loading={loading} error={error} retry={reload} />
        ) : (
          <DataTable
            rows={rows}
            page={portal ? undefined : page}
            total={data?.total}
            onPage={setPage}
            columns={
              isCustomer
                ? [
                    {
                      label: "Customer",
                      render: (r) => (
                        <Link
                          className="record-title"
                          to={`/customers/${r.id}`}
                        >
                          <span className="avatar small">
                            {r.name?.slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <strong>{r.name}</strong>
                            <small>{r.number}</small>
                          </span>
                        </Link>
                      ),
                    },
                    {
                      label: "Status",
                      render: (r) => (
                        <Badge>{r.creditHold ? "ON_HOLD" : r.status}</Badge>
                      ),
                    },
                    { label: "Label SKUs", render: (r) => r._count?.skus || 0 },
                    { label: "Currency", render: (r) => r.currency },
                    {
                      label: "View",
                      render: (r) => (
                        <Link
                          aria-label={`View ${r.name}`}
                          to={`/customers/${r.id}`}
                        >
                          <ArrowRight size={18} />
                        </Link>
                      ),
                    },
                  ]
                : [
                    {
                      label: "Label / SKU",
                      render: (r) => (
                        <Link
                          className="record-title"
                          to={`${portal ? "/portal" : ""}/skus/${r.id}`}
                        >
                          <span className="label-icon">
                            <FileText size={19} />
                          </span>
                          <span>
                            <strong>{r.description}</strong>
                            <small>
                              {r.number}
                              {r.customerSkuCode
                                ? ` / ${r.customerSkuCode}`
                                : ""}
                            </small>
                          </span>
                        </Link>
                      ),
                    },
                    ...(!portal
                      ? [
                          {
                            label: "Customer",
                            render: (r: Row) => r.customer?.name || "—",
                          },
                        ]
                      : []),
                    {
                      label: "Specification",
                      render: (r) =>
                        r.currentSpecification ? (
                          <span>
                            Rev {r.currentSpecification.revisionNo}{" "}
                            <Badge>{r.currentSpecification.status}</Badge>
                          </span>
                        ) : (
                          <span className="muted">Awaiting specification</span>
                        ),
                    },
                    {
                      label: "Status",
                      render: (r) => <Badge>{r.status}</Badge>,
                    },
                    {
                      label: "View",
                      render: (r) => (
                        <Link
                          aria-label={`View ${r.description}`}
                          to={`${portal ? "/portal" : ""}/skus/${r.id}`}
                        >
                          <ArrowRight size={18} />
                        </Link>
                      ),
                    },
                  ]
            }
          />
        )}
      </div>
      {open && (
        <Modal
          title={isCustomer ? "New customer" : "Create a label SKU"}
          description={
            isCustomer
              ? "Build a customer record. Contacts and delivery sites can be added next."
              : "Create the label record, then add its material and print specification."
          }
          close={() => setOpen(false)}
        >
          {md.loading || customers.loading ? (
            <State loading />
          ) : md.error || customers.error ? (
            <State
              error={md.error || customers.error}
              retry={() => {
                md.reload();
                customers.reload();
              }}
            />
          ) : (
            <RecordForm
              fields={fields}
              initial={
                isCustomer ? { status: "PROSPECT", currency: "AUD" } : {}
              }
              submit={isCustomer ? "Create customer" : "Create label"}
              onCancel={() => setOpen(false)}
              onSubmit={async (body) => {
                const result = await request(`/${kind}`, "POST", body);
                toast("Record created.", "success");
                setOpen(false);
                navigate(`/${kind}/${result.id}`);
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}
export function CustomerDetail({ portal = false }: { portal?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    data: c,
    loading,
    error,
    reload,
  } = useResource(portal ? "/portal/customer" : `/customers/${id}`);
  const [tab, setTab] = useState("Overview");
  const [modal, setModal] = useState<"edit" | "contact" | "site" | null>(null);
  const activity = useResource(
    tab === "Activity"
      ? portal
        ? "/portal/timeline"
        : `/customers/${id}/timeline`
      : null,
  );
  if (loading || error || !c)
    return <State loading={loading} error={error} retry={reload} />;
  const editFields: Field[] = [
    { name: "name", label: "Company name", required: true },
    { name: "tradingName", label: "Trading name" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "billingStreet", label: "Billing street" },
    { name: "billingSuburb", label: "Suburb" },
    { name: "billingState", label: "State" },
    { name: "billingPostcode", label: "Postcode" },
    { name: "requirements", label: "Customer requirements", type: "textarea" },
  ];
  const contactFields: Field[] = [
    { name: "name", label: "Name", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "position", label: "Position" },
    { name: "isPrimary", label: "Primary contact", type: "checkbox" },
    {
      name: "canApproveArtwork",
      label: "Can approve artwork",
      type: "checkbox",
    },
    { name: "canSubmitOrders", label: "Can submit orders", type: "checkbox" },
    {
      name: "canAcceptQuotations",
      label: "Can accept quotations",
      type: "checkbox",
    },
  ];
  const siteFields: Field[] = [
    { name: "name", label: "Site name", required: true },
    { name: "street", label: "Street" },
    { name: "suburb", label: "Suburb" },
    { name: "state", label: "State" },
    { name: "postcode", label: "Postcode" },
    { name: "country", label: "Country" },
    {
      name: "deliveryInstructions",
      label: "Delivery instructions",
      type: "textarea",
    },
    { name: "isDefault", label: "Default delivery site", type: "checkbox" },
  ];
  return (
    <>
      {!portal && <Back onClick={() => navigate("/customers")}>Customers</Back>}
      <PageHead
        eyebrow={c.number || "YOUR ORGANISATION"}
        title={c.name}
        description={c.tradingName || "Customer workspace"}
        actions={
          <>
            <Badge>{c.status || "ACTIVE"}</Badge>
            {can(portal ? "portal.customer.edit" : "customer.edit") && (
              <Button onClick={() => setModal("edit")}>
                <Edit3 size={16} />
                Edit details
              </Button>
            )}
          </>
        }
      />
      <div className="tabs" role="tablist">
        {[
          "Overview",
          "Contacts",
          "Delivery sites",
          ...(!portal ? ["Labels"] : []),
          "Activity",
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="two-column">
          <section className="surface padded">
            <h2>Company details</h2>
            <Details
              entries={[
                ["Customer number", c.number],
                ["Email", c.email],
                ["Phone", c.phone],
                ["Currency", c.currency],
                ["ABN", c.abn],
                [
                  "Billing address",
                  [
                    c.billingStreet,
                    c.billingSuburb,
                    c.billingState,
                    c.billingPostcode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—",
                ],
              ]}
            />
          </section>
          <section className="surface padded">
            <h2>Requirements & preferences</h2>
            <p className="body-text">
              {c.requirements || "No special requirements recorded."}
            </p>
            {c.creditHold && (
              <div className="notice tone-warning">
                Credit hold: {c.creditHoldReason}
              </div>
            )}
            <Details
              entries={[
                ["Default material", c.defaultMaterial?.name],
                ["Default finish", c.defaultFinish?.name],
                ["Payment terms", c.paymentTerms?.name],
              ]}
            />
          </section>
        </div>
      )}
      {tab === "Contacts" && (
        <section className="surface">
          <div className="section-head">
            <h2>Customer contacts</h2>
            {!portal && can("customer.edit") && (
              <AddButton onClick={() => setModal("contact")}>
                Add contact
              </AddButton>
            )}
          </div>
          <DataTable
            rows={c.contacts || []}
            columns={[
              {
                label: "Contact",
                render: (r) => (
                  <>
                    <strong>{r.name}</strong>
                    <small>{r.position}</small>
                  </>
                ),
              },
              { label: "Email", render: (r) => r.email || "—" },
              {
                label: "Permissions",
                render: (r) => (
                  <div className="badge-group">
                    {r.isPrimary && <Badge>Primary</Badge>}
                    {r.canApproveArtwork && (
                      <Badge tone="info">Artwork approver</Badge>
                    )}
                    {r.canSubmitOrders && <Badge>Order contact</Badge>}
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}
      {tab === "Delivery sites" && (
        <section className="surface">
          <div className="section-head">
            <h2>Delivery sites</h2>
            {can(portal ? "portal.customer.edit" : "customer.edit") && (
              <AddButton onClick={() => setModal("site")}>Add site</AddButton>
            )}
          </div>
          <DataTable
            rows={c.sites || []}
            columns={[
              {
                label: "Site",
                render: (r) => (
                  <>
                    <strong>{r.name}</strong>
                    {r.isDefault && <Badge>Default</Badge>}
                  </>
                ),
              },
              {
                label: "Address",
                render: (r) =>
                  [r.street, r.suburb, r.state, r.postcode]
                    .filter(Boolean)
                    .join(", "),
              },
              {
                label: "Instructions",
                render: (r) => r.deliveryInstructions || "—",
              },
            ]}
          />
        </section>
      )}
      {tab === "Labels" && (
        <div className="surface">
          <DataTable
            rows={c.skus || []}
            columns={[
              {
                label: "Label",
                render: (r) => (
                  <Link to={`/skus/${r.id}`}>
                    <strong>{r.description}</strong>
                    <small>{r.number}</small>
                  </Link>
                ),
              },
              { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
            ]}
          />
        </div>
      )}
      {tab === "Activity" && (
        <section className="surface padded">
          <h2>Activity timeline</h2>
          {activity.loading || activity.error ? (
            <State
              loading={activity.loading}
              error={activity.error}
              retry={activity.reload}
            />
          ) : (
            <div className="timeline">
              {activity.data?.length ? (
                activity.data.map((r: Row) => (
                  <div key={r.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{r.summary}</strong>
                      <small>{date(r.createdAt)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <State empty="No activity yet" />
              )}
            </div>
          )}
        </section>
      )}
      {modal && (
        <Modal
          title={
            modal === "edit"
              ? "Edit customer"
              : modal === "contact"
                ? "Add contact"
                : "Add delivery site"
          }
          close={() => setModal(null)}
        >
          <RecordForm
            fields={
              modal === "edit"
                ? portal
                  ? editFields.filter((f) =>
                      ["email", "phone"].includes(f.name),
                    )
                  : editFields
                : modal === "contact"
                  ? contactFields
                  : siteFields
            }
            initial={modal === "edit" ? c : {}}
            onCancel={() => setModal(null)}
            onSubmit={async (body) => {
              await request(
                portal
                  ? modal === "edit"
                    ? "/portal/customer"
                    : "/portal/sites"
                  : modal === "edit"
                    ? `/customers/${id}`
                    : `/customers/${id}/${modal === "contact" ? "contacts" : "sites"}`,
                modal === "edit" ? "PATCH" : "POST",
                modal === "edit" && !portal
                  ? { ...body, version: c.version }
                  : body,
              );
              toast("Customer record saved.", "success");
              setModal(null);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function SkuDetail({ portal = false }: { portal?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    data: sku,
    loading,
    error,
    reload,
  } = useResource(`${portal ? "/portal" : ""}/skus/${id}`);
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [revise, setRevise] = useState(false);
  const [approval, setApproval] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const md = useResource(revise ? "/master-data" : null);
  if (loading || error || !sku)
    return <State loading={loading} error={error} retry={reload} />;
  const specs: Row[] =
    sku.specifications ||
    (sku.currentSpecification ? [sku.currentSpecification] : []);
  const spec = specs.find((s) => s.id === selected) || specs[0];
  const draft = specs.find((s) => s.status === "DRAFT");
  const specFields: Field[] = [
    {
      name: "changeSummary",
      label: "Revision summary",
      required: true,
      maxLength: 500,
      section: "Revision details",
    },
    {
      name: "widthMm",
      label: "Width (mm)",
      type: "number",
      required: true,
      min: 0.001,
    },
    {
      name: "heightMm",
      label: "Height (mm)",
      type: "number",
      required: true,
      min: 0.001,
    },
    {
      name: "materialId",
      label: "Print material",
      type: "select",
      required: true,
      options: options(md.data?.materials),
      help: "Materials are selected from your material catalogue.",
      section: "Material & print",
    },
    { name: "micron", label: "Thickness (µm)", type: "number", min: 0 },
    {
      name: "finishId",
      label: "Finish",
      type: "select",
      options: options(md.data?.finishes),
    },
    {
      name: "colourCount",
      label: "Number of colours",
      type: "number",
      min: 0,
      max: 12,
      step: "1",
    },
    {
      name: "whiteInk",
      label: "White ink",
      type: "select",
      options: enums("NONE", "BACKING", "SPOT", "FLOOD"),
    },
    { name: "printOrientation", label: "Print orientation" },
    {
      name: "packingMethod",
      label: "Packing method",
      section: "Packing & requirements",
    },
    {
      name: "labelsPerCarton",
      label: "Labels per carton",
      type: "number",
      min: 0,
      step: "1",
    },
    {
      name: "labelsPerPallet",
      label: "Labels per pallet",
      type: "number",
      min: 0,
      step: "1",
    },
    {
      name: "customerRequirements",
      label: "Customer requirements",
      type: "textarea",
    },
    {
      name: "requiresCustomerReapproval",
      label: "Require customer artwork reapproval",
      type: "checkbox",
    },
    {
      name: "colourSystemId",
      label: "Colour system",
      type: "select",
      options: options(md.data?.colourSystems),
      help: "Add a reference when the number of colours is greater than zero.",
      section: "Colour reference",
    },
    {
      name: "colourCode",
      label: "Colour codes / process reference",
      help: "For example CMYK or PMS 280. Detailed colour tolerances can be added in a later revision.",
    },
  ];
  return (
    <>
      <Back onClick={() => navigate(portal ? "/portal/skus" : "/skus")}>
        Label library
      </Back>
      <PageHead
        eyebrow={`${sku.number} ${sku.customerSkuCode ? `/ ${sku.customerSkuCode}` : ""}`}
        title={sku.description}
        description={
          portal ? "Your approved label specification" : sku.customer?.name
        }
        actions={
          <>
            <Badge>{sku.status}</Badge>
            {!portal && can("sku.edit") && (
              <Button onClick={() => setEdit(true)}>
                <Edit3 size={16} />
                Edit label
              </Button>
            )}
            {!portal && can("spec.create_revision") && (
              <AddButton onClick={() => setRevise(true)}>
                {draft ? "Edit draft" : "New revision"}
              </AddButton>
            )}
          </>
        }
      />
      <div className="spec-layout">
        <aside className="surface revision-list">
          <div className="section-head">
            <h2>Specifications</h2>
            <span className="muted">{specs.length}</span>
          </div>
          {specs.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={spec?.id === s.id ? "selected" : ""}
            >
              <div>
                <strong>Revision {s.revisionNo}</strong>
                <Badge>{s.status}</Badge>
              </div>
              <small>{s.changeSummary || "Label specification"}</small>
            </button>
          ))}
          {!specs.length && (
            <p className="padded muted">
              Add the first specification to define this label.
            </p>
          )}
        </aside>
        <section className="surface padded">
          {spec ? (
            <>
              <div className="section-title">
                <div>
                  <div className="eyebrow">CONTROLLED SPECIFICATION</div>
                  <h2>Revision {spec.revisionNo}</h2>
                </div>
                {!portal && spec.status === "DRAFT" && can("spec.approve") && (
                  <Button
                    primary
                    onClick={() => {
                      setActionError("");
                      setApproval(true);
                    }}
                  >
                    <Check size={16} />
                    Approve specification
                  </Button>
                )}
              </div>
              {spec.status === "APPROVED" && (
                <div className="notice tone-success">
                  <Check size={18} />
                  Approved specification · {date(spec.approvedAt)}. Create a new
                  revision to make changes.
                </div>
              )}
              <h3>Dimensions & material</h3>
              <Details
                entries={[
                  ["Label dimensions", `${spec.widthMm} × ${spec.heightMm} mm`],
                  [
                    "Material",
                    spec.material?.name ||
                      spec.materialName ||
                      spec.materialCode,
                  ],
                  [
                    "Thickness",
                    spec.micron != null ? `${spec.micron} µm` : null,
                  ],
                  [
                    "Finish",
                    spec.finish?.name || spec.finishName || spec.finishCode,
                  ],
                ]}
              />
              <h3>Print details</h3>
              <Details
                entries={[
                  ["Colours", spec.colourCount ?? 0],
                  ["White ink", human(spec.whiteInk || "NONE")],
                  ["Print orientation", spec.printOrientation],
                  [
                    "Colour references",
                    spec.colours
                      ?.map((c: Row) =>
                        [c.code, c.name].filter(Boolean).join(" · "),
                      )
                      .join(", ") || "—",
                  ],
                ]}
              />
              <h3>Packing & requirements</h3>
              <Details
                entries={[
                  ["Packing method", spec.packingMethod],
                  ["Labels / carton", spec.labelsPerCarton],
                  ["Labels / pallet", spec.labelsPerPallet],
                  [
                    "Customer requirements",
                    spec.customerRequirements || "None recorded",
                  ],
                ]}
              />
            </>
          ) : (
            <State empty="No specification yet" />
          )}
        </section>
      </div>
      {edit && (
        <Modal title="Edit label details" close={() => setEdit(false)}>
          <RecordForm
            initial={sku}
            fields={[
              {
                name: "description",
                label: "Description",
                required: true,
                maxLength: 300,
              },
              {
                name: "customerSkuCode",
                label: "Customer SKU code",
                maxLength: 80,
              },
              { name: "mouldedProduct", label: "Moulded product" },
              {
                name: "status",
                label: "Status",
                type: "select",
                options: enums("DRAFT", "ACTIVE", "ON_HOLD", "DISCONTINUED"),
              },
            ]}
            onCancel={() => setEdit(false)}
            onSubmit={async (body) => {
              await request(`/skus/${id}`, "PATCH", {
                ...body,
                version: sku.version,
              });
              setEdit(false);
              reload();
              toast("Label updated.", "success");
            }}
          />
        </Modal>
      )}
      {revise && (
        <Modal
          title={
            draft
              ? `Edit draft · revision ${draft.revisionNo}`
              : "Create a specification revision"
          }
          description="Select the material from the catalogue and define how this label will be printed."
          close={() => setRevise(false)}
        >
          {md.loading || md.error ? (
            <State loading={md.loading} error={md.error} retry={md.reload} />
          ) : (
            <RecordForm
              fields={specFields}
              initial={{
                ...(draft || spec),
                changeSummary: draft?.changeSummary || "",
                colourCount: (draft || spec)?.colourCount || 0,
                colourSystemId: (draft || spec)?.colours?.[0]?.colourSystemId,
                colourCode: (draft || spec)?.colours?.[0]?.code,
              }}
              submit="Save draft revision"
              onCancel={() => setRevise(false)}
              onSubmit={async (body) => {
                const { colourSystemId, colourCode, ...payload } = body;
                if (
                  Number(payload.colourCount) > 0 &&
                  (!colourSystemId || !colourCode)
                )
                  throw new Error(
                    "Choose a colour system and add colour references.",
                  );
                const sourceColours = (draft || spec)?.colours || [];
                const first = sourceColours[0];
                const strip = (c: Row) => ({
                  colourSystemId: c.colourSystemId,
                  code: c.code || undefined,
                  name: c.name || undefined,
                  reference: c.reference || undefined,
                  toleranceDeltaE:
                    c.toleranceDeltaE == null
                      ? undefined
                      : Number(c.toleranceDeltaE),
                  instructions: c.instructions || undefined,
                });
                payload.colours =
                  colourSystemId && colourCode
                    ? [
                        {
                          ...(first ? strip(first) : {}),
                          colourSystemId,
                          code: colourCode,
                        },
                        ...sourceColours.slice(1).map(strip),
                      ]
                    : Number(payload.colourCount) > 0
                      ? sourceColours.map(strip)
                      : [];
                await request(
                  draft
                    ? `/specifications/${draft.id}`
                    : `/skus/${id}/specifications`,
                  draft ? "PATCH" : "POST",
                  payload,
                );
                setRevise(false);
                reload();
                toast("Draft specification saved.", "success");
              }}
            />
          )}
        </Modal>
      )}
      {approval && (
        <Modal
          title={`Approve revision ${spec?.revisionNo}?`}
          description="This will make the revision the current approved specification and supersede the previous approved revision."
          close={() => {
            if (!busy) setApproval(false);
          }}
        >
          <p>
            Check dimensions, material, colour references and packing details
            before approving.
          </p>
          {actionError && (
            <div className="notice tone-danger" role="alert">
              {actionError}
            </div>
          )}
          <div className="form-footer">
            <Button disabled={busy} onClick={() => setApproval(false)}>
              Cancel
            </Button>
            <Button
              primary
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request(`/specifications/${spec.id}/approve`, "POST");
                  setApproval(false);
                  reload();
                  toast("Specification approved.", "success");
                } catch (e) {
                  setActionError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Approving…" : "Approve specification"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
