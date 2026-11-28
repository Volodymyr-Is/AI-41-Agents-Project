import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addConstraint, deleteConstraint, getConstraintsByUserId } from '@/lib/db';
import { MemoryEntrySchema } from '@/src/memory/schema';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const constraints = getConstraintsByUserId(user.id);
  return NextResponse.json({ constraints });
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { text?: string };
    const text = body.text?.trim() ?? '';

    // Використовуємо валідацію тексту з MemoryEntrySchema (<= 200 символів + фільтр секретів та ПД)
    const parsedText = MemoryEntrySchema.shape.text.safeParse(text);
    if (!parsedText.success) {
      return NextResponse.json(
        { error: parsedText.error.issues[0]?.message ?? 'Invalid constraint text' },
        { status: 400 }
      );
    }

    const constraint = addConstraint({
      id: 'cst_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userId: user.id,
      text: parsedText.data,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, constraint }, { status: 201 });
  } catch (err: unknown) {
    console.error('Add constraint error:', err);
    return NextResponse.json({ error: 'Failed to save constraint' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Constraint id is required' }, { status: 400 });
  }

  const deleted = deleteConstraint(id, user.id);
  if (!deleted) {
    return NextResponse.json({ error: 'Constraint not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
