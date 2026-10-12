import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDays } from "@/components/admin/format";

// Piese mici refolosite de paginile de administrare (utilizatori, puncte de lucru,
// reguli, jurnal), ca toate să arate la fel.

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-12 text-center",
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Insignă Activ / Inactiv, cu un punct colorat (nu doar culoarea transmite starea). */
export function ActiveBadge({
  active,
  activeLabel = "Activ",
  inactiveLabel = "Inactiv",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(!active && "text-muted-foreground")}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-primary" : "bg-muted-foreground/60"
        )}
      />
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

/** Sold în zile, în format românesc; soldul negativ e evidențiat. */
export function DaysValue({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const negative = value < 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        negative && "font-medium text-destructive",
        className
      )}
    >
      {formatDays(value)}
      {negative ? <span className="sr-only"> (sold negativ)</span> : null}
    </span>
  );
}

/** Mesaj de eroare sub un câmp; legat de câmp prin aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** Text ajutător sub un câmp. */
export function FieldHint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

type FieldControlProps = {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

/**
 * Etichetă + control + text ajutător + eroare, legate prin id / aria-describedby.
 * Controlul primește prin render-prop atributele de accesibilitate.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      <FieldError id={`${id}-error`} message={error} />
      {hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}
