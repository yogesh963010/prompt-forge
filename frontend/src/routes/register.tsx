import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAuthenticated, setAuthData } from "@/lib/auth";
import { ApiError, authService } from "@/services";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    // Only redirect on the client — localStorage is unavailable during SSR
    if (typeof window !== "undefined" && isAuthenticated()) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign up — PromptForge" },
      { name: "description", content: "Create an account to start building modular Prompt Systems." },
      { property: "og:title", content: "Sign up — PromptForge" },
      { property: "og:description", content: "Create an account to start building modular Prompt Systems." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already authenticated on client mount, redirect to /dashboard
  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (globalError) setGlobalError("");
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    setGlobalError("");

    if (!form.name.trim()) {
      newErrors.name = "Full name is required.";
    }

    const emailTrimmed = form.email.trim();
    if (!emailTrimmed) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!form.password) {
      newErrors.password = "Password is required.";
    } else if (form.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    }

    if (!form.confirm) {
      newErrors.confirm = "Please confirm your password.";
    } else if (form.password !== form.confirm) {
      newErrors.confirm = "Passwords do not match.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;

    setLoading(true);
    setGlobalError("");

    try {
      const normalizedEmail = form.email.trim().toLowerCase();

      // 1. Call backend registration endpoint
      await authService.register({
        name: form.name.trim(),
        email: normalizedEmail,
        password: form.password,
      });

      // 2. Automatically log in the user upon successful registration
      try {
        const loginResponse = await authService.login({
          email: normalizedEmail,
          password: form.password,
        });

        setAuthData(
          {
            id: loginResponse.user?.id,
            name: loginResponse.user?.name,
            email: loginResponse.user?.email || normalizedEmail,
          },
          loginResponse.access_token
        );

        navigate({ to: "/dashboard", replace: true });
      } catch {
        // Fallback: If auto-login fails, redirect to /login with prompt
        navigate({ to: "/login", replace: true });
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 400 && err.message.toLowerCase().includes("email")) {
          setErrors((prev) => ({ ...prev, email: err.message }));
        } else {
          setGlobalError(err.message);
        }
      } else {
        setGlobalError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start building Prompt Systems in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {globalError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {globalError}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Full name</span>
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="Ada Lovelace"
            disabled={loading}
            className={`bg-card/70 ${errors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
            autoComplete="name"
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Email</span>
          <Input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@company.com"
            disabled={loading}
            className={`bg-card/70 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
            autoComplete="email"
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Password</span>
          <Input
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="At least 8 characters"
            disabled={loading}
            className={`bg-card/70 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
            autoComplete="new-password"
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Confirm password</span>
          <Input
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            placeholder="Repeat your password"
            disabled={loading}
            className={`bg-card/70 ${errors.confirm ? "border-destructive focus-visible:ring-destructive" : ""}`}
            autoComplete="new-password"
          />
          {errors.confirm && <p className="mt-1 text-xs text-destructive">{errors.confirm}</p>}
        </label>

        <Button type="submit" disabled={loading} className="w-full cursor-pointer">
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
