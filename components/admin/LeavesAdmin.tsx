'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'sonner';

interface LeaveRequest {
  id: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  status: string;
  violationReasons: string[];
  rejectionReason?: string | null;
  pdfUrl?: string | null;
  createdAt: Date;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string;
    workPoint?: { name: string } | null;
  };
}

function formatDate(date: Date) {
  return format(new Date(date), 'dd.MM.yyyy', { locale: ro });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    APPROVED_AUTO: { label: 'Aprobat automat', color: 'bg-green-100 text-green-800' },
    APPROVED_ADMIN: { label: 'Aprobat de admin', color: 'bg-green-100 text-green-800' },
    PENDING_ADMIN: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-800' },
    REJECTED: { label: 'Respins', color: 'bg-red-100 text-red-800' },
    CANCELLED: { label: 'Anulat', color: 'bg-gray-100 text-gray-800' },
  };
  const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

export function LeavesAdmin({ cereri }: { cereri: LeaveRequest[] }) {
  const [list, setList] = useState(cereri);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setLoading(id);
    try {
      const res = await fetch(`/api/admin/leaves/${id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setList((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'APPROVED_ADMIN' } : r))
      );
      toast.success('Cererea a fost aprobată și emailul trimis.');
    } catch (err: any) {
      toast.error(err.message || 'A apărut o eroare.');
    } finally {
      setLoading(null);
    }
  }

  async function handleReject(id: string) {
    if (rejectReason.length < 10) {
      toast.error('Motivul trebuie să aibă minim 10 caractere.');
      return;
    }
    setLoading(id);
    try {
      const res = await fetch(`/api/admin/leaves/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: rejectReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setList((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'REJECTED' } : r))
      );
      setRejectId(null);
      setRejectReason('');
      toast.success('Cererea a fost respinsă.');
    } catch (err: any) {
      toast.error(err.message || 'A apărut o eroare.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Cereri de concediu</h1>

      {list.length === 0 ? (
        <p className="text-gray-500">Nu există cereri de concediu.</p>
      ) : (
        <div className="space-y-4">
          {list.map((cerere) => (
            <div key={cerere.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <p className="font-semibold">
                    {cerere.user.firstName} {cerere.user.lastName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {cerere.user.jobTitle}
                    {cerere.user.workPoint ? ` · ${cerere.user.workPoint.name}` : ''}
                  </p>
                  <p className="text-sm mt-1">
                    {formatDate(cerere.startDate)} – {formatDate(cerere.endDate)} ({cerere.workingDays} zile)
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Depusă: {formatDate(cerere.createdAt)}
                  </p>
                </div>
                <StatusBadge status={cerere.status} />
              </div>

              {cerere.violationReasons.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-50 rounded border-l-4 border-yellow-400">
                  <p className="text-sm font-medium text-yellow-800 mb-1">Motive aprobare manuală:</p>
                  {cerere.violationReasons.map((r, i) => (
                    <p key={i} className="text-sm text-yellow-700">• {r}</p>
                  ))}
                </div>
              )}

              {cerere.rejectionReason && (
                <div className="mt-3 p-3 bg-red-50 rounded border-l-4 border-red-400">
                  <p className="text-sm font-medium text-red-800">Motiv respingere:</p>
                  <p className="text-sm text-red-700">{cerere.rejectionReason}</p>
                </div>
              )}

              {cerere.status === 'PENDING_ADMIN' && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleApprove(cerere.id)}
                    disabled={loading === cerere.id}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
                  >
                    {loading === cerere.id ? 'Se procesează...' : 'Aprobă'}
                  </button>
                  <button
                    onClick={() => setRejectId(cerere.id)}
                    disabled={loading === cerere.id}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm disabled:opacity-50"
                  >
                    Respinge
                  </button>
                </div>
              )}

              {rejectId === cerere.id && (
                <div className="mt-3">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motivul respingerii (minim 10 caractere)..."
                    className="w-full border rounded p-2 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleReject(cerere.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      Confirmă respingerea
                    </button>
                    <button
                      onClick={() => { setRejectId(null); setRejectReason(''); }}
                      className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                    >
                      Anulează
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}