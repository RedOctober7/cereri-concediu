"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DaysValue, FormField } from "@/components/admin/admin-ui";
import { formatDays, pluralRo } from "@/components/admin/format";
import { apiRequest, fieldErrorsFrom, omitKey, parseDecimal } from "@/components/admin/form-utils";
import { balanceAdjustmentSchema } from "@/lib/validators";
import { adjustmentYears } from "@/lib/leaves/rollover";
import { cn } from "@/lib/utils";

type Direction = "add" | "subtract";

/**
 * „Ajustare sold”: adminul alege dacă adaugă sau scade zile (pe mobil tastatura
 * numerică nu are mereu semnul minus), numărul de zile, anul lor și motivul, obligatoriu.
 * Anul contează la expirare: zilele adăugate pentru anul N se pot folosi până pe
 * 30 iunie N + 2, ca cele acumulate în acel an.
 */
export function BalanceAdjustmentDialog({
  open,
  onOpenChange,
  userId,
  userName,
  availableDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  availableDays: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [direction, setDirection] = useState<Direction>("add");
  const [days, setDays] = useState("");
  // Anii ale căror zile nu au expirat încă; implicit anul curent (ultimul din listă).
  const [years] = useState(() => adjustmentYears(new Date()));
  const [year, setYear] = useState(() => years[years.length - 1]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amount = parseDecimal(days);
  const delta = Number.isFinite(amount) ? (direction === "add" ? amount : -amount) : Number.NaN;
  const preview =
    Number.isFinite(delta) && delta !== 0
      ? Math.round((availableDays + delta) * 100) / 100
      : null;

  function reset() {
    setDirection("add");
    setDays("");
    setYear(years[years.length - 1]);
    setReason("");
    setErrors({});
    setFormError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (Number.isFinite(amount) && amount < 0) {
      setErrors({ delta: "Scrie numărul de zile fără semn și alege „Adaugă” sau „Scade”." });
      return;
    }
    const input = { delta, reason, year };
    const parsed = balanceAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setSubmitting(true);
    const result = await apiRequest<{ after: number; delta: number }>(
      `/api/admin/users/${userId}/balance`,
      { method: "POST", body: input }
    );
    setSubmitting(false);

    if (!result.ok) {
      if (result.field === "delta" || result.field === "reason" || result.field === "year") {
        setErrors({ [result.field]: result.error });
      } else {
        setFormError(result.error);
      }
      return;
    }

    const sign = result.data.delta > 0 ? "+" : "-";
    toast.success(
      `Sold ajustat cu ${sign}${pluralRo(Math.abs(result.data.delta), "zi", "zile")}. Sold nou: ${formatDays(result.data.after)} zile.`
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) {
          onOpenChange(next);
        }
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          reset();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustare sold</DialogTitle>
          <DialogDescription>
            Corectează soldul de concediu al lui {userName}. Ajustarea și motivul apar în
            jurnalul de activitate.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} noValidate onSubmit={onSubmit} className="grid gap-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Tip ajustare</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  { value: "add", label: "Adaugă zile", icon: Plus },
                  { value: "subtract", label: "Scade zile", icon: Minus },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    direction === option.value &&
                      "bg-background text-foreground shadow-sm dark:bg-input/40"
                  )}
                >
                  <input
                    type="radio"
                    name="direction"
                    value={option.value}
                    checked={direction === option.value}
                    onChange={() => setDirection(option.value)}
                    className="sr-only"
                  />
                  <option.icon aria-hidden="true" className="size-4" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <FormField
            id="balance-days"
            label="Număr de zile"
            error={errors.delta}
            hint="Poate avea zecimale, ex. 1,75."
          >
            {(field) => (
              <Input
                {...field}
                name="delta"
                inputMode="decimal"
                autoComplete="off"
                value={days}
                disabled={submitting}
                className="max-w-40"
                onChange={(event) => {
                  setDays(event.target.value);
                  setErrors((current) => omitKey(current, "delta"));
                }}
              />
            )}
          </FormField>

          <FormField
            id="balance-year"
            label="Zile din anul"
            error={errors.year}
            hint={`Se pot folosi până pe 30 iunie ${year + 2}, ca zilele acumulate în ${year}.`}
          >
            {(field) => (
              <div className="max-w-40">
                <NativeSelect
                  {...field}
                  name="year"
                  value={year}
                  disabled={submitting}
                  onChange={(event) => {
                    setYear(Number(event.target.value));
                    setErrors((current) => omitKey(current, "year"));
                  }}
                >
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </FormField>

          <FormField id="balance-reason" label="Motiv" error={errors.reason}>
            {(field) => (
              <Textarea
                {...field}
                name="reason"
                value={reason}
                disabled={submitting}
                maxLength={500}
                placeholder="ex. Zile suplimentare pentru vechime, conform contractului colectiv"
                onChange={(event) => {
                  setReason(event.target.value);
                  setErrors((current) => omitKey(current, "reason"));
                }}
              />
            )}
          </FormField>

          <div
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm"
            aria-live="polite"
          >
            <span className="text-muted-foreground">Sold</span>
            <span className="flex items-center gap-2">
              <DaysValue value={availableDays} />
              <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
              {preview === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <DaysValue value={preview} className="font-semibold" />
              )}
              <span className="text-muted-foreground">zile</span>
            </span>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}>
              Anulează
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {submitting ? "Se salvează..." : "Aplică ajustarea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
