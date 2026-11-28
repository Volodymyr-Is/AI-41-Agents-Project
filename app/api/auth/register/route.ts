import { NextResponse } from 'next/server';
import { getUserByUsername, createUser } from '@/lib/db';
import { hashPassword, generateToken, COOKIE_NAME } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (username.trim().length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters long' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters long' },
        { status: 400 }
      );
    }

    const existing = getUserByUsername(username);
    if (existing) {
      return NextResponse.json(
        { error: 'A user with this username already exists' },
        { status: 409 }
      );
    }

    const newUser = {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      username: username.trim(),
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    createUser(newUser);

    const token = generateToken(newUser);

    const res = NextResponse.json(
      {
        message: 'Account created successfully',
        user: { id: newUser.id, username: newUser.username },
      },
      { status: 201 }
    );

    res.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err: unknown) {
    console.error('Registration error:', err);
    return NextResponse.json(
      { error: 'Internal server error during registration' },
      { status: 500 }
    );
  }
}
