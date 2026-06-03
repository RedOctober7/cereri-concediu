'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  jobTitle: string;
  employer: string;
  active: boolean;
  availableDays: number;
  initialLeaveDays: number;
  workPointId: string | null;
  workPoint?: { id: string; name: string } | null;
}

interface WorkPoint {
  id: string;
  name: string;
}

export function UserDetailClient({
  user,
  workPoints,
}: {
  user: User;
  workPoints: WorkPoint[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function handleResetPassword() {
    if (newPassword.length < 10) {
      toast.error('Parola trebuie să aibă minim 10 caractere.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: newPassword,
          forcePasswordReset: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Parola a fost resetată. Angajatul va trebui să o schimbe la următorul login.');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'A apărut o eroare.');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(user.active ? 'Utilizator dezactivat.' : 'Utilizator activat.');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'A apărut o eroare.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => router.back()}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
      >
        ← Înapoi
      </button>

      <h1 className="text-2xl font-bold mb-6">
        {user.firstName} {user.lastName}
      </h1>

      <div className="border rounded-lg p-4 bg-white mb-6 space-y-2">
        <p><span className="font-medium">Email:</span> {user.email}</p>
        <p><span className="font-medium">Username:</span> {user.username}</p>
        <p><span className="font-medium">Funcție:</span> {user.jobTitle}</p>
        <p><span className="font-medium">Angajator:</span> {user.employer}</p>
        <p><span className="font-medium">Punct de lucru:</span> {user.workPoint?.name || 'Neatribuit'}</p>
        <p><span className="font-medium">Zile disponibile:</span> {user.availableDays}</p>
        <p><span className="font-medium">Status:</span> {user.active ? '✅ Activ' : '❌ Inactiv'}</p>
      </div>

      <div className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Reset parolă</h2>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Parolă nouă (minim 10 caractere)"
          className="w-full border rounded p-2 text-sm mb-3"
        />
        <button
          onClick={handleResetPassword}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50"
        >
          {loading ? 'Se procesează...' : 'Resetează parola'}
        </button>
      </div>

      <div className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">Status cont</h2>
        <button
          onClick={handleToggleActive}
          disabled={loading}
          className={`px-4 py-2 text-white rounded text-sm disabled:opacity-50 ${
            user.active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {user.active ? 'Dezactivează utilizator' : 'Activează utilizator'}
        </button>
      </div>
    </div>
  );
}