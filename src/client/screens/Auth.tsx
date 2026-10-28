import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignUpScreen() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verify, setVerify] = useState("");
  const [accountType, setAccountType] = useState<"household" | "business">("household");
  const [errors, setErrors] = useState<{ email?: string; password?: string; verify?: string }>({});
  const [submitted, setSubmitted] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email)) e.email = "Enter a valid email address.";
    if (password.length < 6) e.password = "Password must be at least 6 characters.";
    if (verify !== password) e.verify = "Passwords do not match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitted(true);
    setTimeout(() => nav({ to: "/home" }), 900);
  }

  return (
    <div className="main auth-page">
      <h1 className="auth-title">
        <span className="auth-title-line">HOLD</span>
        <span className="auth-title-line">THAT CART</span>
      </h1>
      <p className="auth-subtitle">
        <span className="auth-subtitle-line">Shop Smarter.</span>
        <span className="auth-subtitle-line">Live Greener.</span>
      </p>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {errors.email && <span className="auth-error">{errors.email}</span>}
        </div>
        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {errors.password && <span className="auth-error">{errors.password}</span>}
        </div>
        <div className="auth-field">
          <label className="auth-label">Verify Password</label>
          <input
            className="auth-input"
            type="password"
            value={verify}
            onChange={(e) => setVerify(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {errors.verify && <span className="auth-error">{errors.verify}</span>}
        </div>
        <div className="auth-toggle">
          <button
            type="button"
            className={accountType === "household" ? "active" : ""}
            onClick={() => setAccountType("household")}
          >
            Household
          </button>
          <button
            type="button"
            className={accountType === "business" ? "active" : ""}
            onClick={() => setAccountType("business")}
          >
            Business
          </button>
        </div>
        <button type="submit" className="auth-btn">Sign Up</button>
        {submitted && <p className="auth-success">Account created! Redirecting…</p>}
      </form>
      <p className="auth-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}

export function LoginScreen() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitted, setSubmitted] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email)) e.email = "Enter a valid email address.";
    if (!password) e.password = "Password is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitted(true);
    setTimeout(() => nav({ to: "/home" }), 900);
  }

  return (
    <div className="main auth-page">
      <h1 className="auth-title">
        <span className="auth-title-line">HOLD</span>
        <span className="auth-title-line">THAT CART</span>
      </h1>
      <p className="auth-subtitle">Welcome back</p>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {errors.email && <span className="auth-error">{errors.email}</span>}
        </div>
        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          {errors.password && <span className="auth-error">{errors.password}</span>}
        </div>
        <button type="submit" className="auth-btn">Log In</button>
        {submitted && <p className="auth-success">Welcome back! Redirecting…</p>}
      </form>
      <p className="auth-footer">
        Don't have an account? <Link to="/">Sign up</Link>
      </p>
    </div>
  );
}
