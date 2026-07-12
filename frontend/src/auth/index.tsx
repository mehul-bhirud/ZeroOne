import { useState } from "react";
import { Button, FormField, Input, ScreenShell } from "../design-system";

export function LoginScreen() {
  const [pending, setPending] = useState(false);
  return (
    <ScreenShell title="Welcome back" description="Sign in to manage custody, bookings, maintenance, and audits.">
      <form className="panel auth-card" onSubmit={(event) => { event.preventDefault(); setPending(true); }}>
        <FormField label="Work email"><Input required type="email" autoComplete="email" /></FormField>
        <FormField label="Password"><Input required type="password" autoComplete="current-password" /></FormField>
        <Button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
    </ScreenShell>
  );
}

export function SignupScreen() {
  return (
    <ScreenShell title="Create an employee account" description="An administrator can assign additional responsibilities after signup.">
      <form className="panel auth-card" onSubmit={(event) => event.preventDefault()}>
        <FormField label="Name"><Input required autoComplete="name" /></FormField>
        <FormField label="Work email"><Input required type="email" autoComplete="email" /></FormField>
        <FormField label="Password" hint="Use at least 12 characters."><Input required minLength={12} type="password" autoComplete="new-password" /></FormField>
        <Button>Create employee account</Button>
      </form>
    </ScreenShell>
  );
}

