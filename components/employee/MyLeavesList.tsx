"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import type { LeaveRequest, LeaveStatus } from "@prisma/client";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  leaveStatusClassName,
  leaveStatusLabel,
  isApprovedStatus,
} from "@/lib/leaves/status";
import { startOfDayUTC, todayInBucharest } from "@/lib/dates";

/** Numele fișierului din `Content-Disposition: attachment; filename="..."`. */
function fileNameFrom(disposition: string | null): string | null {
  const match = disposition && /filename="([^"]+)"/.exec(disposition);
  return match ? match[1] : null;
}

/** Descarcă un Blob cu numele dat (fără să părăsească pagina). */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Unele browsere pornesc descărcarea asincron: URL-ul rămâne valid încă puțin.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function MyLeavesList({ leaves }: { leaves: LeaveRequest[] }) {
  const router = useRouter();
  const [rejectionLeave, setRejectionLeave] = useState<LeaveRequest | null>(
    null
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function onDownload(id: string) {
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/leaves/${id}/pdf`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Nu s-a putut descărca PDF-ul.");
      }
      const blob = await res.blob();
      saveBlob(
        blob,
        fileNameFrom(res.headers.get("Content-Disposition")) ?? "cerere-concediu.pdf"
      );
    } catch (error) {
      // fetch aruncă TypeError la probleme de rețea; mesajul lui e în engleză.
      toast.error(
        error instanceof TypeError || !(error instanceof Error)
          ? "Nu s-a putut descărca PDF-ul. Verifică conexiunea și reîncearcă."
          : error.message
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function onCancel(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/leaves/${id}/cancel`, { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Nu s-a putut anula cererea.");
      }
      toast.success("Cererea a fost anulată.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "A apărut o eroare."
      );
    } finally {
      setCancellingId(null);
    }
  }

  function canCancel(leave: LeaveRequest) {
    if (leave.status !== "PENDING_ADMIN") {
      return false;
    }
    // Aceeași regulă ca serverul: zile la miezul nopții UTC, „azi” în București.
    return startOfDayUTC(new Date(leave.startDate)) > todayInBucharest();
  }

  if (leaves.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nu ai depus încă nicio cerere de concediu.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {leaves.map((leave) => (
          <div
            key={leave.id}
            className="rounded-lg border p-4 md:flex md:items-center md:justify-between md:gap-4"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {format(leave.startDate, "dd.MM.yyyy", { locale: ro })} –{" "}
                  {format(leave.endDate, "dd.MM.yyyy", { locale: ro })}
                </p>
                <Badge
                  className={leaveStatusClassName(leave.status as LeaveStatus)}
                >
                  {leaveStatusLabel(leave.status as LeaveStatus)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {leave.workingDays} zile lucrătoare
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 md:mt-0">
              {isApprovedStatus(leave.status as LeaveStatus) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onDownload(leave.id)}
                  disabled={downloadingId === leave.id}
                  aria-busy={downloadingId === leave.id}
                >
                  {downloadingId === leave.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Download aria-hidden="true" />
                  )}
                  {downloadingId === leave.id ? "Se descarcă..." : "Descarcă PDF"}
                </Button>
              ) : null}
              {leave.status === "REJECTED" && leave.rejectionReason ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectionLeave(leave)}
                >
                  Vezi motiv respingere
                </Button>
              ) : null}
              {canCancel(leave) ? (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button variant="destructive" size="sm">
                        Anulează
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Anulezi cererea?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Această acțiune nu poate fi anulată. Cererea va fi marcată
                        ca anulată.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Renunță</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void onCancel(leave.id)}
                        disabled={cancellingId === leave.id}
                      >
                        Confirmă anularea
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={!!rejectionLeave}
        onOpenChange={(open) => !open && setRejectionLeave(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motiv respingere</DialogTitle>
            <DialogDescription>
              Administratorul a respins cererea cu următorul motiv:
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">{rejectionLeave?.rejectionReason}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
