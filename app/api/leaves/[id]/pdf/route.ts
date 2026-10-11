import { NextResponse, after } from "next/server";
import { requireSession } from "@/lib/api-session";
import { isApprovedStatus } from "@/lib/leaves/status";
import {
  findLeaveForPdf,
  leavePdfDownloadName,
  readStoredLeavePdf,
  renderLeavePdf,
  storeLeavePdf,
} from "@/lib/pdf/leave-pdf";

// Generarea PDF-ului durează sub o secundă, dar Storage poate răspunde greu.
export const maxDuration = 30;

/**
 * PDF-ul unei cereri aprobate, pentru angajatul care a depus-o sau pentru un admin.
 * Bucket-ul rămâne privat: PDF-ul stocat trece prin această rută, nu printr-un link
 * public. Fără PDF stocat (sau fără Storage), PDF-ul se generează pe loc și se
 * încearcă stocarea lui după răspuns.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user } = auth.session;

    const leave = await findLeaveForPdf(id);
    // Cererea altui angajat arată la fel ca una care nu există.
    if (!leave || (leave.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Cererea nu există." }, { status: 404 });
    }
    if (!isApprovedStatus(leave.status)) {
      return NextResponse.json(
        { error: "PDF-ul este disponibil doar pentru cererile aprobate." },
        { status: 400 }
      );
    }

    let pdf = await readStoredLeavePdf(leave);
    if (!pdf) {
      const generated = await renderLeavePdf(leave);
      after(() => storeLeavePdf(leave, generated));
      pdf = generated;
    }

    const fileName = leavePdfDownloadName(leave);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Leaves] Eroare PDF:", error);
    return NextResponse.json(
      {
        error:
          "Nu am putut genera PDF-ul. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
