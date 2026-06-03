import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { UserDetailClient } from '@/components/admin/UserDetailClient';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, workPoints] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { workPoint: true },
    }),
    prisma.workPoint.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!user) notFound();

  return <UserDetailClient user={user} workPoints={workPoints} />;
}