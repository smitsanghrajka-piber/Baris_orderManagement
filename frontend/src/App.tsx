import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  Box,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Gauge,
  Layers,
  LogOut,
  Menu,
  Moon,
  Package,
  Printer,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { Auth } from "./pages/Auth";
import { Catalog, CustomerDetail, SkuDetail } from "./pages/Catalog";
import { Dashboard, MasterData, Tooling, Workflow } from "./pages/Operations";
import { Audit, Notifications, Settings, UsersPage } from "./pages/Admin";
import { ArtworkDetailPage, ArtworksPage, PortalArtworkReviewPage, PortalArtworksPage } from "./pages/Artworks";
import { Button, Modal, State, Toaster } from "./components/ui";
import { can, getSession, isDemo, request, setSession } from "./lib/api";
import { resetDemo } from "./lib/demo";
import { toast } from "./lib/toast";
const navigation = [
  { path: "/", label: "Overview", icon: Gauge, permission: "" },
  {
    path: "/orders",
    label: "Orders",
    icon: Package,
    permission: "sku.view",
    preview: true,
  },
  {
    path: "/artworks",
    label: "Artwork approvals",
    icon: ClipboardCheck,
    permission: "artwork.view",
  },
  {
    path: "/quotations",
    label: "Quotations",
    icon: FileText,
    permission: "sku.view",
    preview: true,
  },
  {
    path: "/production",
    label: "Production",
    icon: Printer,
    permission: "sku.view",
    preview: true,
  },
  {
    path: "/dispatch",
    label: "Dispatch",
    icon: Truck,
    permission: "sku.view",
    preview: true,
  },
  {
    path: "/customers",
    label: "Customers",
    icon: Users,
    permission: "customer.view",
    group: "LIBRARY",
  },
  {
    path: "/skus",
    label: "Label library",
    icon: Layers,
    permission: "sku.view",
  },
  {
    path: "/materials",
    label: "Materials",
    icon: Box,
    permission: "master_data.view",
  },
  {
    path: "/tooling",
    label: "Tooling & plates",
    icon: Wrench,
    permission: "tooling.view",
  },
  {
    path: "/users",
    label: "Team & access",
    icon: ShieldCheck,
    permission: "user.manage",
    group: "ADMINISTRATION",
  },
  {
    path: "/master-data",
    label: "Master data",
    icon: SettingsIcon,
    permission: "master_data.view",
  },
  {
    path: "/audit",
    label: "Audit trail",
    icon: FileText,
    permission: "audit.view",
  },
  {
    path: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    permission: "settings.edit",
  },
];
export function App() {
  const [session, update] = useState(getSession);
  const location = useLocation();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const changed = () => update(getSession());
  useEffect(() => {
    const expire = () => {
      changed();
      toast("Your session expired. Please sign in again.", "warning");
    };
    window.addEventListener("baris:expired", expire);
    return () => window.removeEventListener("baris:expired", expire);
  }, []);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const isAuth =
    /\/(login|forgot-password|reset-password|change-password)$/.test(
      location.pathname,
    );
  if (isAuth) {
    const mode = location.pathname.endsWith("forgot-password")
      ? "forgot"
      : location.pathname.endsWith("reset-password")
        ? "reset"
        : location.pathname.endsWith("change-password")
          ? "change"
          : "login";
    if (mode === "change" && !session) return <Navigate to="/login" replace />;
    return (
      <>
        <Auth mode={mode} changed={changed} />
        <Toaster />
      </>
    );
  }
  if (!session)
    return (
      <Navigate
        to={
          location.pathname.startsWith("/portal") ? "/portal/login" : "/login"
        }
        replace
      />
    );
  if (session.user.mustChangePassword)
    return <Navigate to="/change-password" replace />;
  const portal = session.user.kind === "CUSTOMER";
  if (portal && !location.pathname.startsWith("/portal"))
    return <Navigate to="/portal" replace />;
  if (!portal && location.pathname.startsWith("/portal"))
    return <Navigate to="/" replace />;
  const nav = portal
    ? [
        {
          path: "/portal",
          label: "Overview",
          icon: Gauge,
          permission: "portal.dashboard.view",
        },
        {
          path: "/portal/artworks",
          label: "Artwork proofs",
          icon: ClipboardCheck,
          permission: "portal.artwork.view",
        },
        {
          path: "/portal/skus",
          label: "My labels",
          icon: Layers,
          permission: "portal.sku.view",
        },
        {
          path: "/portal/customer",
          label: "My organisation",
          icon: Users,
          permission: "portal.customer.view",
        },
        {
          path: "/portal/notifications",
          label: "Updates",
          icon: Bell,
          permission: "",
        },
      ]
    : navigation;
  const section =
    nav
      .filter(
        (n) =>
          location.pathname === n.path ||
          (n.path !== "/" && location.pathname.startsWith(`${n.path}/`)),
      )
      .slice(-1)[0]?.label || "Workspace";
  const logout = async () => {
    const s = getSession();
    setSession(null);
    changed();
    navigate(portal ? "/portal/login" : "/login");
    if (s && !s.demo) {
      try {
        await request("/auth/logout", "POST", { refreshToken: s.refreshToken });
      } catch {
        /* Local sign out still succeeds. */
      }
    }
  };
  const allowed = (permission: string, children: ReactNode) =>
    can(permission) ? (
      children
    ) : (
      <State empty="You don’t have access to this page. Ask your administrator." />
    );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <Link className="wordmark" to={portal ? "/portal" : "/"}>
          <Layers size={28} />
          <span>
            baris<span className="iml">IML</span>
          </span>
        </Link>
        <div className="workspace-label">
          {portal ? "CUSTOMER PORTAL" : "PRINT OPERATIONS"}
          <ChevronDown size={13} />
        </div>
        <nav aria-label="Main navigation">
          {nav.map(
            (n) =>
              (!n.permission || can(n.permission)) && (
                <div key={n.path}>
                  {"group" in n && n.group && (
                    <div className="nav-group">{n.group}</div>
                  )}
                  <NavLink
                    to={n.path}
                    end={n.path === "/" || n.path === "/portal"}
                  >
                    <n.icon size={18} />
                    <span>{n.label}</span>
                    {"preview" in n && n.preview && (
                      <span className="nav-preview" title="Design preview">
                        Preview
                      </span>
                    )}
                  </NavLink>
                </div>
              ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Workspace guide
          </button>
          <div className="profile">
            <span className="avatar">
              {session.user.name
                .split(" ")
                .slice(0, 2)
                .map((v) => v[0])
                .join("")}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>
                {session.demo
                  ? "Demo workspace"
                  : portal
                    ? "Customer account"
                    : session.user.roles.join(", ")}
              </small>
            </div>
            <button onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>{portal ? "Customer portal" : "Workspace"}</span>
            <span>/</span>
            <strong>{section}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(
                  `${portal ? "/portal" : ""}/skus?q=${encodeURIComponent(query)}`,
                );
                setQuery("");
              }}
            >
              <Search size={16} />
              <input
                aria-label="Find labels"
                placeholder="Open label library"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="submit"
                className="search-shortcut"
                aria-label="Open label library"
              >
                ↵
              </button>
            </form>
            <button
              className="icon-btn"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => {
                const next = !dark;
                setDark(next);
                document.documentElement.classList.toggle("dark", next);
                localStorage.setItem("baris.theme", next ? "dark" : "light");
              }}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              className="icon-btn"
              aria-label="Notifications"
              to={portal ? "/portal/notifications" : "/notifications"}
            >
              <Bell size={20} />
            </Link>
            <span className="avatar small top-avatar">
              {session.user.name[0]}
            </span>
          </div>
        </header>
        {session.demo && (
          <div className="demo-banner">
            <span>
              <strong>Demo workspace</strong> · Sample data, saved in this
              browser only.
            </span>
            <button
              onClick={() => {
                resetDemo();
                window.location.reload();
              }}
            >
              Reset demo
            </button>
          </div>
        )}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/customers"
              element={allowed(
                "customer.view",
                <Catalog key="customers" kind="customers" />,
              )}
            />
            <Route
              path="/customers/:id"
              element={allowed("customer.view", <CustomerDetail />)}
            />
            <Route
              path="/skus"
              element={allowed("sku.view", <Catalog key="skus" kind="skus" />)}
            />
            <Route
              path="/skus/:id"
              element={allowed("sku.view", <SkuDetail />)}
            />
            <Route
              path="/materials"
              element={allowed(
                "master_data.view",
                <MasterData key="materials" materialsOnly />,
              )}
            />
            <Route
              path="/master-data"
              element={allowed("master_data.view", <MasterData key="master" />)}
            />
            <Route
              path="/tooling"
              element={allowed("tooling.view", <Tooling />)}
            />
            <Route
              path="/users"
              element={allowed("user.manage", <UsersPage />)}
            />
            <Route
              path="/settings"
              element={allowed("settings.edit", <Settings />)}
            />
            <Route path="/audit" element={allowed("audit.view", <Audit />)} />
            <Route path="/notifications" element={<Notifications />} />
            <Route
              path="/artworks"
              element={allowed(
                "artwork.view",
                isDemo() ? <Workflow key="artworks" kind="artworks" /> : <ArtworksPage />,
              )}
            />
            <Route
              path="/artworks/:id"
              element={allowed("artwork.view", <ArtworkDetailPage />)}
            />
            {["orders", "quotations", "production", "dispatch"].map(
              (k) => (
                <Route
                  key={k}
                  path={`/${k}`}
                  element={allowed("sku.view", <Workflow key={k} kind={k} />)}
                />
              ),
            )}
            <Route
              path="/portal"
              element={allowed("portal.dashboard.view", <Dashboard portal />)}
            />
            <Route
              path="/portal/skus"
              element={allowed(
                "portal.sku.view",
                <Catalog kind="skus" portal />,
              )}
            />
            <Route
              path="/portal/skus/:id"
              element={allowed("portal.sku.view", <SkuDetail portal />)}
            />
            <Route
              path="/portal/customer"
              element={allowed(
                "portal.customer.view",
                <CustomerDetail portal />,
              )}
            />
            <Route
              path="/portal/artworks"
              element={allowed("portal.artwork.view", <PortalArtworksPage />)}
            />
            <Route
              path="/portal/artworks/:id"
              element={allowed("portal.artwork.view", <PortalArtworkReviewPage />)}
            />
            <Route path="/portal/notifications" element={<Notifications />} />
            <Route
              path="*"
              element={
                <State empty="Page not found. Use the navigation to return to your workspace." />
              }
            />
          </Routes>
        </main>
        <footer className="app-footer">
          Baris IML <span>Every detail, in order.</span>
        </footer>
      </div>
      <Toaster />
      {help && (
        <Modal title="Your Baris workspace" close={() => setHelp(false)}>
          <p>
            Start with a customer record and a material catalogue. Create a
            label SKU, add its specification and approve the revision when the
            details are correct.
          </p>
          <h3>Connected workflows</h3>
          <p>
            Customers, labels, specification approval, artwork proofs and
            customer markup, materials, tooling, team, settings, notifications
            and audit use the backend APIs.
          </p>
          <h3>Design previews</h3>
          <p>
            Quotations, orders, production and dispatch are
            interactive with sample data in demo mode. They need additional
            backend modules before operational use. Materials currently form a
            catalogue; stock quantities and receipt tracking are still to be
            implemented.
          </p>
          <Button onClick={() => setHelp(false)}>Got it</Button>
        </Modal>
      )}
    </div>
  );
}
