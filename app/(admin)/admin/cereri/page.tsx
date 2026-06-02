import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { LeavesAdmin } from '@/components/admin/LeavesAdmin';

export default async function AdminCereriPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    redirect('/login');
  }

  const cereri = await prisma.leaveRequest.findMany({
    include: {
      user: {
        include: { workPoint: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return <LeavesAdmin cereri={cereri} />;
}