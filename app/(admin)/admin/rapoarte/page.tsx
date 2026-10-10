'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export default function RapoartePage() {
  const [loading, setLoading] = useState(false);

  async function downloadLeaveBalance() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reports/leave-balance');
      if (!res.ok) throw new Error('Eroare la generare raport');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Numele vine de la server (anul curent în România), cu un nume de rezervă.
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      a.download = match?.[1] ?? 'situatie-zile.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Raport descărcat cu succes!');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'A apărut o eroare.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Rapoarte</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border rounded-lg p-6 bg-white shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Situație zile concediu</h2>
          <p className="text-sm text-gray-500 mb-4">
            Export Excel cu situația zilelor de concediu pentru toți angajații activi 
            (zile inițiale, acumulate, luate, disponibile).
          </p>
          <button
            onClick={downloadLeaveBalance}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50"
          >
            {loading ? 'Se generează...' : '⬇ Descarcă Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}