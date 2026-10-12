"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { formatDays } from "@/components/admin/format";
import { LeaveCalendar } from "@/components/calendar/LeaveCalendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ValidationPreview = {
  violations: string[];
  workingDays: number;
  availableDays: number;
};

type PreviewError = {
  message: string;
  /**
   * 400 de la /api/leaves/validate: POST aplică aceleași reguli și ar respinge
   * cererea. Alte erori (401, 500, rețea) nu spun nimic despre perioadă.
   */
  blocksSubmit: boolean;
};

const PREVIEW_FAILED_MESSAGE =
  "Nu s-a putut verifica perioada. Reîncearcă în câteva momente.";

export function LeaveRequestForm({
  initialAvailableDays,
}: {
  initialAvailableDays: number;
}) {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [range, setRange] = useState<DateRange | undefined>();
  const [preview, setPreview] = useState<ValidationPreview | null>(null);
  const [previewError, setPreviewError] = useState<PreviewError | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasCompleteRange = Boolean(range?.from && range?.to);

  function onRangeSelect(next: DateRange | undefined) {
    setRange(next);
    // Rezultatul anterior era pentru altă perioadă; nu-l mai afișăm cât timp
    // se verifică perioada nouă.
    setPreview(null);
    setPreviewError(null);
  }

  useEffect(() => {
    if (!range?.from || !range?.to) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const params = new URLSearchParams({
          startDate: format(range.from!, "yyyy-MM-dd"),
          endDate: format(range.to!, "yyyy-MM-dd"),
        });
        const res = await fetch(`/api/leaves/validate?${params}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as {
          data?: ValidationPreview;
          error?: string;
        };
        if (controller.signal.aborted) {
          return;
        }
        if (res.ok && body.data) {
          setPreview(body.data);
          setPreviewError(null);
        } else if (res.status === 400) {
          setPreview(null);
          setPreviewError({
            message: body.error ?? "Perioada selectată nu este validă.",
            blocksSubmit: true,
          });
        } else {
          setPreview(null);
          setPreviewError({
            message: PREVIEW_FAILED_MESSAGE,
            blocksSubmit: false,
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setPreview(null);
          setPreviewError({
            message: PREVIEW_FAILED_MESSAGE,
            blocksSubmit: false,
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPreview(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
      // Cererea anulată nu mai ajunge în finally cu setLoadingPreview(false).
      setLoadingPreview(false);
    };
  }, [range?.from, range?.to]);

  async function onSubmit() {
    if (!range?.from || !range?.to) {
      toast.error("Selectează un interval de date.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: format(range.from, "yyyy-MM-dd"),
          endDate: format(range.to, "yyyy-MM-dd"),
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Nu s-a putut trimite cererea.");
      }
      toast.success(body.message ?? "Cererea a fost trimisă.");
      router.push("/cereri");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "A apărut o eroare."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Selectează perioada</CardTitle>
          <CardDescription>
            Alege intervalul de concediu în calendar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveCalendar
            selected={range}
            onSelect={onRangeSelect}
            year={year}
            onYearChange={setYear}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Previzualizare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {range?.from && range?.to ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Perioadă: </span>
                {format(range.from, "dd.MM.yyyy", { locale: ro })} –{" "}
                {format(range.to, "dd.MM.yyyy", { locale: ro })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selectează data de început și de sfârșit.
              </p>
            )}

            <p className="text-sm">
              <span className="text-muted-foreground">Zile disponibile: </span>
              <strong>
                {formatDays(preview?.availableDays ?? initialAvailableDays)}
              </strong>
            </p>

            {loadingPreview ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Se verifică regulile...
              </div>
            ) : null}

            {hasCompleteRange && previewError ? (
              <Alert
                variant={previewError.blocksSubmit ? "destructive" : "default"}
              >
                <AlertCircle className="size-4" />
                <AlertTitle>
                  {previewError.blocksSubmit
                    ? "Cererea nu poate fi trimisă"
                    : "Verificarea nu este disponibilă"}
                </AlertTitle>
                <AlertDescription>{previewError.message}</AlertDescription>
              </Alert>
            ) : null}

            {hasCompleteRange && preview ? (
              <>
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    Zile lucrătoare:{" "}
                  </span>
                  <strong>{preview.workingDays}</strong>
                </p>
                {preview.violations.length > 0 ? (
                  <Alert>
                    <AlertCircle className="size-4" />
                    <AlertTitle>Administratorul va vedea și aceste atenționări</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {preview.violations.map((v) => (
                          <li key={v}>{v}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <AlertTitle className="text-emerald-800 dark:text-emerald-300">
                      Respectă toate regulile
                    </AlertTitle>
                    <AlertDescription>
                      Cererea va fi trimisă administratorului spre aprobare.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Button
          className="h-12 w-full text-base"
          disabled={
            !hasCompleteRange ||
            submitting ||
            loadingPreview ||
            // Verificarea perioadei încă nu a răspuns (debounce sau cerere în curs).
            (!preview && !previewError) ||
            previewError?.blocksSubmit === true
          }
          onClick={() => void onSubmit()}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              Se trimite...
            </>
          ) : (
            "Trimite cererea"
          )}
        </Button>

        <Button
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          Înapoi la panou
        </Button>
      </div>
    </div>
  );
}
