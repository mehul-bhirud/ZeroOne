import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="button" {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function FormField({ label, children, hint }: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ScreenShell({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return (
    <main className="screen-shell">
      <header>
        <p className="eyebrow">AssetFlow</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return <section className="panel empty-state"><p>{title}</p>{action}</section>;
}

export function ErrorSummary({ message }: { message: string }) {
  return <div className="error-summary" role="alert">{message}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="panel" aria-label="Loading">{Array.from({ length: lines }, (_, index) => <span className="skeleton" key={index} />)}</div>;
}

export function Modal({ title, children }: PropsWithChildren<{ title: string }>) {
  return <section className="panel" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</section>;
}

export function Toast({ message }: { message: string }) {
  return <div className="toast" role="status">{message}</div>;
}

