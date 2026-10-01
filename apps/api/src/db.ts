import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schema = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','lecturer','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', cover_url TEXT,
  level TEXT NOT NULL DEFAULT 'Pemula', published BOOLEAN NOT NULL DEFAULT false,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', video_url TEXT, position INTEGER NOT NULL DEFAULT 1,
  UNIQUE(course_id, position)
);
CREATE TABLE IF NOT EXISTS enrollments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id, course_id)
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id UUID UNIQUE NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question TEXT NOT NULL, options JSONB NOT NULL, correct_index INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, answer_index INTEGER NOT NULL, is_correct BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courses_published_idx ON courses(published);
CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons(course_id, position);
`;

export async function initializeDatabase() {
  await pool.query(schema);
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, lower($2), $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
      [process.env.ADMIN_NAME || "Akademi Admin", email, hash],
    );
  }
}
