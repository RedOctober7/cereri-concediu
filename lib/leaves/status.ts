import type { LeaveStatus } from "@prisma/client";

export function leaveStatusLabel(status: LeaveStatus): string {
  switch (status) {
    case "APPROVED_AUTO":
      return "Aprobat automat";
    case "APPROVED_ADMIN":
      return "Aprobat";
    case "PENDING_ADMIN":
      return "În așteptare";
    case "REJECTED":
      return "Respins";
    case "CANCELLED":
      return "Anulat";
    default:
      return status;
  }
}

export function leaveStatusClassName(status: LeaveStatus): string {
  switch (status) {
    case "APPROVED_AUTO":
    case "APPROVED_ADMIN":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "PENDING_ADMIN":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "CANCELLED":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function isApprovedStatus(status: LeaveStatus): boolean {
  return status === "APPROVED_AUTO" || status === "APPROVED_ADMIN";
}
