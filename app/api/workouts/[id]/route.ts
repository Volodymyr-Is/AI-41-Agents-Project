import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteWorkout } from '@/lib/db';

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const deleted = deleteWorkout(id, user.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Workout not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Workout deleted' });
  } catch (err: unknown) {
    console.error('Delete workout error:', err);
    return NextResponse.json({ error: 'Failed to delete workout' }, { status: 500 });
  }
}
