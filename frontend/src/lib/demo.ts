import type { Session } from "./api";
type Row = Record<string, any>;
const KEY = "baris.demo.v1";
const stamp = "2026-10-01T04:30:00.000Z";
const seed = () => ({
  customers: [
    {
      id: "c1",
      number: "CUS-0001",
      name: "Piber Plastics Australia",
      tradingName: "Piber Plastics",
      status: "ACTIVE",
      currency: "AUD",
      email: "orders@example.com",
      phone: "+61 3 9000 0000",
      billingStreet: "500 Boundary Road",
      billingSuburb: "Derrimut",
      billingState: "VIC",
      billingCountry: "Australia",
      version: 1,
      creditHold: false,
      contacts: [
        {
          id: "ct1",
          name: "Sample purchasing contact",
          email: "purchasing@example.com",
          isPrimary: true,
          canApproveArtwork: true,
        },
      ],
      sites: [
        {
          id: "site1",
          name: "Derrimut factory",
          street: "500 Boundary Road",
          suburb: "Derrimut",
          state: "VIC",
          isDefault: true,
        },
      ],
      users: [],
    },
    {
      id: "c2",
      number: "CUS-0002",
      name: "Southern Packaging",
      status: "ACTIVE",
      currency: "AUD",
      version: 1,
      contacts: [],
      sites: [],
      users: [],
    },
    {
      id: "c3",
      number: "CUS-0003",
      name: "Coastal Food Co.",
      status: "PROSPECT",
      currency: "AUD",
      version: 1,
      contacts: [],
      sites: [],
      users: [],
    },
  ],
  skus: [
    {
      id: "s1",
      customerId: "c1",
      number: "SKU-0001",
      customerSkuCode: "ATA-15L",
      description: "ATA Adhesives · 15L pail label",
      status: "ACTIVE",
      mouldedProduct: "15L round pail",
      version: 1,
      specifications: [
        {
          id: "sp1",
          revisionNo: 2,
          status: "APPROVED",
          widthMm: 890,
          heightMm: 245,
          materialId: "m1",
          materialName: "White BOPP",
          micron: 60,
          finishId: "f1",
          finishName: "Matt",
          colourCount: 4,
          whiteInk: "NONE",
          labelsPerCarton: 1000,
          packingMethod: "Flat stacked",
          changeSummary: "Updated customer copy",
          colours: [
            { colourSystemId: "cs1", code: "CMYK", name: "Process colours" },
          ],
          approvedAt: stamp,
        },
      ],
    },
    {
      id: "s2",
      customerId: "c1",
      number: "SKU-0002",
      customerSkuCode: "GHEE-5L",
      description: "Pure Ghee · 5L wraparound label",
      status: "DRAFT",
      version: 1,
      specifications: [
        {
          id: "sp2",
          revisionNo: 1,
          status: "DRAFT",
          widthMm: 640,
          heightMm: 170,
          materialId: "m1",
          materialName: "White BOPP",
          micron: 60,
          finishId: "f2",
          finishName: "Gloss",
          colourCount: 5,
          colours: [],
          changeSummary: "Initial specification",
        },
      ],
    },
    {
      id: "s3",
      customerId: "c2",
      number: "SKU-0003",
      description: "Garden care · 2.3L label",
      status: "ACTIVE",
      version: 1,
      specifications: [
        {
          id: "sp3",
          revisionNo: 1,
          status: "APPROVED",
          widthMm: 440,
          heightMm: 130,
          materialId: "m2",
          materialName: "Clear BOPP",
          micron: 50,
          colourCount: 0,
          colours: [],
        },
      ],
    },
  ],
  master: {
    materials: [
      {
        id: "m1",
        code: "BOPP-W60",
        name: "White BOPP",
        micronDefault: 60,
        isActive: true,
      },
      {
        id: "m2",
        code: "BOPP-C50",
        name: "Clear BOPP",
        micronDefault: 50,
        isActive: true,
      },
      {
        id: "m3",
        code: "BOPP-W70",
        name: "White BOPP · high stiffness",
        micronDefault: 70,
        isActive: false,
      },
    ],
    finishes: [
      { id: "f1", code: "MATT", name: "Matt", isActive: true },
      { id: "f2", code: "GLOSS", name: "Gloss", isActive: true },
    ],
    colourSystems: [
      { id: "cs1", code: "PROCESS", name: "CMYK process", isActive: true },
      { id: "cs2", code: "PMS", name: "Pantone", isActive: true },
    ],
    labelTypes: [
      { id: "lt1", code: "IML", name: "In-mould label", isActive: true },
    ],
    applications: [{ id: "ap1", code: "PAIL", name: "Pail", isActive: true }],
    paymentTerms: [
      { id: "pt1", code: "NET30", name: "30 days", days: 30, isActive: true },
    ],
    carriers: [],
    machines: [
      {
        id: "mc1",
        code: "PRESS01",
        name: "Print press 01",
        type: "PRESS",
        isActive: true,
      },
    ],
    routes: [],
    stageDefinitions: [],
    checklistTemplates: [],
  },
  tools: [
    {
      id: "t1",
      code: "DIE-15L",
      name: "15L round pail die",
      type: "DIE",
      widthMm: 890,
      heightMm: 245,
      cavities: 2,
      status: "ACTIVE",
      ownedBy: "BARIS",
      location: "Rack A · 03",
    },
  ],
  plates: [
    {
      id: "pl1",
      code: "ATA-CMYK",
      name: "ATA process plate set",
      type: "PLATE",
      colourCount: 4,
      status: "ACTIVE",
      ownedBy: "CUSTOMER",
    },
  ],
  users: [
    {
      id: "u1",
      name: "Demo administrator",
      email: "admin@example.com",
      isActive: true,
      roles: ["ADMIN"],
    },
  ],
  roles: [
    { id: "r1", code: "ADMIN", name: "Administrator", scope: "STAFF" },
    { id: "r2", code: "SALES", name: "Sales", scope: "STAFF" },
  ],
  company: {
    legalName: "Baris IML",
    tradingName: "Baris IML",
    defaultCurrency: "AUD",
    timeZone: "Australia/Sydney",
    gstRatePct: 10,
    quoteValidityDays: 30,
  },
  audit: [
    {
      id: "a1",
      action: "SPEC_APPROVED",
      entityType: "SpecificationVersion",
      entityId: "sp1",
      actorName: "Demo administrator",
      createdAt: stamp,
    },
  ],
  notifications: [
    {
      id: "n1",
      title: "Specification revision approved",
      body: "ATA Adhesives · 15L pail label is ready.",
      link: "/skus/s1",
      createdAt: stamp,
      readAt: null,
    },
  ],
  orders: [
    {
      id: "o1",
      number: "ORD-00124",
      customer: "Piber Plastics Australia",
      description: "ATA Adhesives · 15L pail label",
      quantity: 25000,
      due: "2026-10-09",
      status: "PRINTING",
    },
    {
      id: "o2",
      number: "ORD-00125",
      customer: "Southern Packaging",
      description: "Garden care · 2.3L label",
      quantity: 10000,
      due: "2026-10-12",
      status: "CONFIRMED",
    },
  ],
  artworks: [
    {
      id: "ar1",
      number: "ART-00042",
      customer: "Piber Plastics Australia",
      description: "Pure Ghee · 5L wraparound label",
      revision: 3,
      status: "AWAITING_APPROVAL",
      comments: "Please check the net weight and ingredient copy.",
    },
  ],
  quotations: [
    {
      id: "q1",
      number: "QUO-00031",
      customer: "Piber Plastics Australia",
      description: "ATA Adhesives · 15L pail label",
      quantity: 25000,
      unitPrice: 0.085,
      status: "SENT",
    },
  ],
});
function load(): Row {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null") || seed();
  } catch {
    return seed();
  }
}
let db = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const id = () =>
  `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const aliases: Row = {
  "colour-systems": "colourSystems",
  "label-types": "labelTypes",
  "payment-terms": "paymentTerms",
};
export function demoSession(portal = false): Session {
  return {
    accessToken: "demo",
    refreshToken: "demo",
    demo: true,
    user: {
      id: "u1",
      name: portal ? "Piber customer" : "Demo administrator",
      email: "demo@example.com",
      kind: portal ? "CUSTOMER" : "STAFF",
      permissions: [],
      roles: ["ADMIN"],
      mustChangePassword: false,
    },
  };
}
export function resetDemo() {
  db = seed();
  save();
}
function skuView(s: Row) {
  if (!s) throw new Error("Label not found.");
  const specifications = (s.specifications || []).map((v: Row) => ({
    ...v,
    material: db.master.materials.find((r: Row) => r.id === v.materialId),
    finish: db.master.finishes.find((r: Row) => r.id === v.finishId),
  }));
  return {
    ...s,
    specifications,
    customer: db.customers.find((c: Row) => c.id === s.customerId),
    currentSpecification: specifications.find(
      (v: Row) => v.status === "APPROVED",
    ),
  };
}
function customerView(c: Row) {
  return {
    ...c,
    _count: {
      skus: db.skus.filter((s: Row) => s.customerId === c.id).length,
      contacts: c.contacts?.length || 0,
    },
    skus: db.skus.filter((s: Row) => s.customerId === c.id).map(skuView),
  };
}
export function demoRequest(url: string, method: string, raw?: unknown): any {
  const [path, query = ""] = url.split("?");
  const p = path.split("/").filter(Boolean);
  const data = (raw || {}) as Row;
  const params = new URLSearchParams(query);
  const list = (rows: Row[], paged = true) => {
    let filtered = rows.filter(
      (r) =>
        (!params.get("q") ||
          JSON.stringify(r)
            .toLowerCase()
            .includes(params.get("q")!.toLowerCase())) &&
        (!params.get("status") ||
          params.get("status") === "ALL" ||
          r.status === params.get("status")) &&
        (!params.get("customerId") ||
          r.customerId === params.get("customerId")) &&
        !r.archivedAt,
    );
    const page = Number(params.get("page") || 1),
      pageSize = Number(params.get("pageSize") || 20);
    return paged
      ? {
          items: filtered.slice((page - 1) * pageSize, page * pageSize),
          total: filtered.length,
          page,
          pageSize,
        }
      : filtered;
  };
  const write = (rows: Row[], rowId?: string) => {
    if (!rowId) {
      const r = {
        id: id(),
        version: 1,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        ...data,
      };
      rows.push(r);
      save();
      return r;
    }
    const r = rows.find((r) => r.id === rowId);
    if (!r) throw new Error("Record not found.");
    Object.assign(r, data, { version: (r.version || 0) + 1 });
    save();
    return r;
  };
  if (p[0] === "auth") return p[1] === "me" ? demoSession().user : {};
  if (p[0] === "portal") {
    if (p[1] === "customer") {
      if (method !== "GET") {
        Object.assign(db.customers[0], data);
        save();
      }
      const c: Row = customerView(db.customers[0]);
      const { notes, users, skus, ...visible } = c;
      return visible;
    }
    if (p[1] === "sites")
      return method === "GET"
        ? db.customers[0].sites
        : write(db.customers[0].sites, p[2]);
    if (p[1] === "skus") {
      const visible = (s: Row) => {
        const { specifications, customer, ...rest } = skuView(s);
        return rest;
      };
      return p[2]
        ? visible(
            db.skus.find((r: Row) => r.id === p[2] && r.customerId === "c1"),
          )
        : db.skus.filter((s: Row) => s.customerId === "c1").map(visible);
    }
    if (p[1] === "timeline")
      return [
        {
          id: "act1",
          summary: "ATA label specification approved",
          createdAt: stamp,
        },
      ];
    if (p[1] === "dashboard")
      return { tiles: { activeSkus: 1 }, recentActivity: [] };
  }
  if (p[0] === "master-data") {
    if (p.length === 1) return db.master;
    const key = aliases[p[2]] || p[2];
    const rows = db.master[key] || (db.master[key] = []);
    return method === "GET" ? rows : write(rows, p[3]);
  }
  if (p[0] === "customers") {
    if (p[2] === "timeline")
      return [
        { id: "act1", summary: "Customer record created", createdAt: stamp },
      ];
    if (p[2] === "contacts" || p[2] === "sites") {
      const c = db.customers.find((r: Row) => r.id === p[1]);
      return write(c[p[2]], p[3]);
    }
    if (p[2] === "archive")
      return (
        write(db.customers, p[1] && p[1]) &&
        ((db.customers.find((r: Row) => r.id === p[1]).archivedAt = stamp),
        save())
      );
    if (method === "GET")
      return p[1]
        ? customerView(db.customers.find((r: Row) => r.id === p[1]))
        : list(db.customers.map(customerView));
    return write(db.customers, p[1]);
  }
  if (p[0] === "skus") {
    if (p[2] === "specifications") {
      const s = db.skus.find((r: Row) => r.id === p[1]);
      if (s.specifications?.some((r: Row) => r.status === "DRAFT"))
        throw new Error("This label already has a draft revision.");
      const r = {
        id: id(),
        revisionNo: (s.specifications?.[0]?.revisionNo || 0) + 1,
        status: "DRAFT",
        ...data,
      };
      s.specifications = [r, ...(s.specifications || [])];
      save();
      return r;
    }
    if (method === "GET")
      return p[1]
        ? skuView(db.skus.find((r: Row) => r.id === p[1]))
        : list(db.skus.map(skuView));
    const result = write(db.skus, p[1]);
    if (!p[1])
      Object.assign(result, {
        number: `SKU-${String(db.skus.length).padStart(4, "0")}`,
        specifications: [],
      });
    save();
    return result;
  }
  if (p[0] === "specifications") {
    const s = db.skus.find((s: Row) =>
      s.specifications?.some((r: Row) => r.id === p[1]),
    );
    const r = s?.specifications.find((r: Row) => r.id === p[1]);
    if (!r) throw new Error("Specification not found.");
    if (p[2] === "approve") {
      if (r.colourCount > 0 && !r.colours?.length)
        throw new Error("Add colour references before approving.");
      s.specifications
        .filter((x: Row) => x.status === "APPROVED")
        .forEach((x: Row) => (x.status = "SUPERSEDED"));
      r.status = "APPROVED";
      s.status = "ACTIVE";
      r.approvedAt = new Date().toISOString();
    } else if (method !== "GET") Object.assign(r, data);
    save();
    return r;
  }
  if (p[0] === "tooling") {
    const rows = p[1] === "tools" ? db.tools : db.plates;
    return method === "GET" ? list(rows) : write(rows, p[2]);
  }
  if (p[0] === "users")
    return method === "GET" ? list(db.users) : write(db.users, p[1]);
  if (p[0] === "roles") return db.roles;
  if (p[0] === "settings") {
    if (method !== "GET") {
      Object.assign(db.company, data);
      save();
    }
    return db.company;
  }
  if (p[0] === "audit") return list(db.audit);
  if (p[0] === "notifications") {
    if (method !== "GET") {
      db.notifications.forEach((n: Row) => {
        if (p[1] === "read-all" || n.id === p[1])
          n.readAt = new Date().toISOString();
      });
      save();
    }
    return db.notifications;
  }
  if (p[0] === "design") {
    const rows = db[p[1]];
    if (!rows) return [];
    return method === "GET" ? rows : write(rows, p[2]);
  }
  throw new Error("This action is not included in the design preview.");
}
