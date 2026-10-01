import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ArrowRight, Layers, ShieldCheck } from "lucide-react";
import { RecordForm, type Row } from "../components/ui";
import { getSession, request, setSession, type Session } from "../lib/api";
import { demoSession } from "../lib/demo";
import { toast } from "../lib/toast";
export function Auth({
  mode = "login",
  changed,
}: {
  mode?: "login" | "forgot" | "reset" | "change";
  changed: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const portal = location.pathname.startsWith("/portal");
  const [sent, setSent] = useState(false);
  const titles = {
    login: "Welcome back.",
    forgot: "Reset your password.",
    reset: "Choose a new password.",
    change: "Secure your account.",
  };
  const password = {
    name: "password",
    label: "Password",
    type: "password" as const,
    required: true,
    maxLength: 128,
  };
  const newPassword = {
    ...password,
    label: "New password",
    pattern: "(?=.*[A-Za-z])(?=.*[0-9]).{10,}",
    help: "At least 10 characters, with a letter and a number.",
  };
  async function submit(data: Row) {
    if (mode === "login") {
      const result = await request<Session>(
        portal ? "/auth/portal/login" : "/auth/login",
        "POST",
        data,
      );
      setSession(result);
      changed();
      navigate(
        result.user.mustChangePassword
          ? "/change-password"
          : portal
            ? "/portal"
            : "/",
        { replace: true },
      );
    }
    if (mode === "forgot") {
      await request("/auth/password/forgot", "POST", {
        kind: portal ? "CUSTOMER" : "STAFF",
        email: data.email,
      });
      setSent(true);
    }
    if (mode === "reset") {
      if (!params.get("token"))
        throw new Error(
          "This reset link is missing its token. Request a new link.",
        );
      await request("/auth/password/reset", "POST", {
        ...data,
        token: params.get("token"),
      });
      toast("Password reset. You can now sign in.", "success");
      navigate(portal ? "/portal/login" : "/login");
    }
    if (mode === "change") {
      await request("/auth/password/change", "POST", {
        currentPassword: data.currentPassword,
        newPassword: data.password,
      });
      const s = getSession();
      if (s)
        setSession({ ...s, user: { ...s.user, mustChangePassword: false } });
      changed();
      toast("Your password has been updated.", "success");
      navigate(getSession()?.user.kind === "CUSTOMER" ? "/portal" : "/");
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="wordmark">
          <Layers size={29} />
          <span>
            baris<span className="iml">IML</span>
          </span>
        </div>
        <div>
          <div className="eyebrow">FROM FIRST PROOF TO FINAL PRINT</div>
          <h1>
            Every label.
            <br />
            Every detail.
            <br />
            One workspace.
          </h1>
          <p>
            A shared workspace for your customers, label specifications and
            print operations.
          </p>
          <div className="auth-caption">
            <ShieldCheck size={22} />
            The right specification, at every step.
          </div>
        </div>
        <small>Baris IML · Order Management</small>
      </section>
      <section className="auth-content">
        <div className="auth-form">
          <div className="eyebrow">
            {portal ? "CUSTOMER PORTAL" : "TEAM WORKSPACE"}
          </div>
          <h1>{titles[mode]}</h1>
          <p>
            {mode === "login"
              ? "Sign in to continue to your workspace."
              : mode === "change"
                ? "Set a new password before continuing."
                : "We’ll help you get back into your workspace."}
          </p>
          {sent ? (
            <div className="notice tone-success">
              If your account exists, a reset link has been requested. Check
              your email.
            </div>
          ) : (
            <RecordForm
              fields={
                mode === "login"
                  ? [
                      {
                        name: "email",
                        label: "Work email",
                        type: "email",
                        required: true,
                      },
                      password,
                    ]
                  : mode === "forgot"
                    ? [
                        {
                          name: "email",
                          label: "Work email",
                          type: "email",
                          required: true,
                        },
                      ]
                    : mode === "change"
                      ? [
                          {
                            ...password,
                            name: "currentPassword",
                            label: "Current password",
                          },
                          newPassword,
                        ]
                      : [newPassword]
              }
              onSubmit={submit}
              submit={
                mode === "login"
                  ? "Sign in"
                  : mode === "forgot"
                    ? "Request reset link"
                    : "Update password"
              }
            />
          )}
          {mode === "login" ? (
            <>
              <Link
                className="auth-link"
                to={portal ? "/portal/forgot-password" : "/forgot-password"}
              >
                Forgot your password?
              </Link>
              <div className="auth-divider">EXPLORE THE EXPERIENCE</div>
              <button
                className="demo-button"
                onClick={() => {
                  setSession(demoSession(portal));
                  changed();
                  navigate(portal ? "/portal" : "/");
                }}
              >
                Open interactive demo <ArrowRight size={17} />
              </button>
              <small className="demo-help">
                Sample data only. Demo changes stay in this browser.
              </small>
              <Link
                className="auth-switch"
                to={portal ? "/login" : "/portal/login"}
              >
                {portal ? "Baris team sign in" : "Customer portal sign in"}{" "}
                <ArrowRight size={14} />
              </Link>
            </>
          ) : (
            mode !== "change" && (
              <Link
                className="auth-link"
                to={portal ? "/portal/login" : "/login"}
              >
                Back to sign in
              </Link>
            )
          )}
        </div>
      </section>
    </main>
  );
}
