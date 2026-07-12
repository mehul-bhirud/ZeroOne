import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, FormField, Input, ScreenShell, ErrorSummary, Skeleton } from "../design-system";
import { useAuth } from "./AuthContext";
import { forgotPassword } from "./api";

/* ───────────────────────── Login ───────────────────────── */

export function LoginScreen() {
  const { login, loading: sessionLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (sessionLoading) {
    return (
      <ScreenShell title="Welcome back" description="Restoring your session…">
        <Skeleton lines={4} />
      </ScreenShell>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Enter your work email to sign in."); return; }
    if (!password) { setError("Enter your password."); return; }

    setPending(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      setError(msg || "Unable to sign in. Check your credentials and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenShell title="Welcome back" description="Sign in to manage custody, bookings, maintenance, and audits.">
      <form className="panel auth-card" onSubmit={handleSubmit} noValidate>
        {error && <ErrorSummary message={error} />}

        <FormField label="Work email">
          <Input
            id="login-email"
            required
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </FormField>

        <FormField label="Password">
          <Input
            id="login-password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
        </FormField>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <Button id="login-submit" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <Link to="/forgot-password" style={{ color: "#5AA7FF", fontSize: 14 }}>
            Forgot password?
          </Link>
        </div>

        <p style={{ marginTop: 20, fontSize: 14, color: "#9EABB8" }}>
          Don't have an account?{" "}
          <Link to="/signup" style={{ color: "#5AA7FF" }}>Create an employee account</Link>
        </p>
      </form>
    </ScreenShell>
  );
}

/* ───────────────────────── Signup ───────────────────────── */

export function SignupScreen() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Enter your full name."); return; }
    if (!email.trim()) { setError("Enter a valid work email address."); return; }
    if (password.length < 12) { setError("Password must be at least 12 characters."); return; }

    setPending(true);
    try {
      await signup(name.trim(), email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      setError(msg || "Unable to create account. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenShell title="Create an employee account" description="An administrator can assign additional responsibilities after signup.">
      <form className="panel auth-card" onSubmit={handleSubmit} noValidate>
        {error && <ErrorSummary message={error} />}

        <p style={{ background: "#19334E", color: "#8FC8FF", borderRadius: 9, padding: "10px 14px", fontSize: 13, marginBottom: 20 }}>
          Signup creates an Employee account. An Admin can promote you to a different role later.
        </p>

        <FormField label="Full name">
          <Input
            id="signup-name"
            required
            autoComplete="name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </FormField>

        <FormField label="Work email">
          <Input
            id="signup-email"
            required
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </FormField>

        <FormField label="Password" hint="Use at least 12 characters.">
          <Input
            id="signup-password"
            required
            minLength={12}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
        </FormField>

        {/* No role picker — enforced by both UI and API */}

        <Button id="signup-submit" type="submit" disabled={pending} style={{ marginTop: 8 }}>
          {pending ? "Creating account…" : "Create employee account"}
        </Button>

        <p style={{ marginTop: 20, fontSize: 14, color: "#9EABB8" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "#5AA7FF" }}>Sign in</Link>
        </p>
      </form>
    </ScreenShell>
  );
}

/* ───────────────────── Forgot Password ─────────────────── */

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Enter your work email address."); return; }

    setPending(true);
    try {
      await forgotPassword(email.trim());
      setSubmitted(true);
    } catch {
      setError("Unable to send a reset link right now. Please try again later.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <ScreenShell title="Check your email" description="If an account exists with that email, we sent a reset link.">
        <div className="panel auth-card">
          <p style={{ color: "#9EABB8", marginBottom: 16 }}>
            If you don't see it within a few minutes, check your spam folder.
          </p>
          <Link to="/login" style={{ color: "#5AA7FF" }}>Back to sign in</Link>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Reset your password" description="Enter the email associated with your account.">
      <form className="panel auth-card" onSubmit={handleSubmit} noValidate>
        {error && <ErrorSummary message={error} />}

        <FormField label="Work email">
          <Input
            id="forgot-email"
            required
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </FormField>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <Button id="forgot-submit" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
          <Link to="/login" style={{ color: "#5AA7FF", fontSize: 14 }}>
            Back to sign in
          </Link>
        </div>
      </form>
    </ScreenShell>
  );
}
