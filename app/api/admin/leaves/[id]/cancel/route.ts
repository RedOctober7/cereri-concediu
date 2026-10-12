import { NextRequest, NextResponse } from 'next/server';
import { LeaveStatus } from '@prisma/client';
import { requireAdminSession } from '@/lib/api-auth';
import { createAuditLog } from '@/lib/audit/log';
import { cancelLeave } from '@/lib/leaves/cancel';

/**
 * Adminul anulează un concediu aprobat care nu a început (ex. aprobat din greșeală sau
 * renunțat de angajat): zilele se întorc în sold. O cerere în așteptare se respinge.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdminSession();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const result = await cancelLeave(id, {
      statuses: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN],
      notCancellableMessage: 'Doar concediile aprobate pot fi anulate. O cerere în așteptare se respinge.',
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await createAuditLog({
      userId: auth.session.user.id,
      action: 'LEAVE_ADMIN_CANCELLED',
      entityType: 'LeaveRequest',
      entityId: id,
      details: {
        previousStatus: result.previousStatus,
        refundedDays: result.refundedDays,
        before: result.availableDaysBefore,
        after: result.availableDaysAfter,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Cancel Leave]', error);
    return NextResponse.json({ error: 'A apărut o eroare. Reîncearcă.' }, { status: 500 });
  }
}
