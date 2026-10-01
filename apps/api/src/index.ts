import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { initializeDatabase, pool } from "./db.js";
import { canManageContent, isSafeExternalVideoUrl, normalizeEmail, type Role, validatePassword } from "./lib/auth.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "development-only-change-me";
if (process.env.NODE_ENV === "production" && jwtSecret === "development-only-change-me") throw new Error("JWT_SECRET is required in production");

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map((origin) => origin.trim());
app.use(cors({ origin: allowedOrigins, credentials: false }));
app.use(express.json({ limit: "256kb" }));
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Please wait before trying again." } });

type AuthUser = { id: string; email: string; name: string; role: Role };
type AuthedRequest = Request & { user?: AuthUser };
const asyncRoute = (fn: (req: AuthedRequest, res: Response) => Promise<void>) => (req: AuthedRequest, res: Response, next: NextFunction) => void fn(req, res).catch(next);
const tokenFor = (user: AuthUser) => jwt.sign(user, jwtSecret, { expiresIn: "8h" });

function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try { req.user = jwt.verify(token, jwtSecret) as AuthUser; next(); } catch { res.status(401).json({ error: "Invalid or expired session" }); }
}
function requireRoles(...roles: Role[]) { return (req: AuthedRequest, res: Response, next: NextFunction) => !req.user || !roles.includes(req.user.role) ? res.status(403).json({ error: "Insufficient permissions" }) : next(); }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

app.get("/api/health", asyncRoute(async (_req, res) => { await pool.query("SELECT 1"); res.json({ status: "ok" }); }));

const credentials = z.object({ name: z.string().trim().min(2).max(100).optional(), email: z.string().email(), password: z.string() });
app.post("/api/auth/register", authRateLimit, asyncRoute(async (req, res) => {
  const input = credentials.extend({ name: z.string().trim().min(2).max(100) }).parse(req.body);
  const password = validatePassword(input.password); if (!password.valid) return void res.status(400).json({ error: password.message });
  const email = normalizeEmail(input.email); const hash = await bcrypt.hash(input.password, 12);
  try {
    const { rows: [user] } = await pool.query<AuthUser>("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role", [input.name, email, hash]);
    res.status(201).json({ token: tokenFor(user), user });
  } catch (error: unknown) { if ((error as { code?: string }).code === "23505") return void res.status(409).json({ error: "Email already registered" }); throw error; }
}));
app.post("/api/auth/login", authRateLimit, asyncRoute(async (req, res) => {
  const input = credentials.pick({ email: true, password: true }).parse(req.body);
  const { rows: [record] } = await pool.query<AuthUser & { password_hash: string }>("SELECT id,name,email,role,password_hash FROM users WHERE email=$1", [normalizeEmail(input.email)]);
  if (!record || !(await bcrypt.compare(input.password, record.password_hash))) return void res.status(401).json({ error: "Invalid email or password" });
  const { password_hash, ...user } = record; res.json({ token: tokenFor(user), user });
}));
app.get("/api/auth/me", authenticate, (req: AuthedRequest, res) => res.json({ user: req.user }));

app.get("/api/courses", asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT c.*, u.name author_name, COUNT(l.id)::int lesson_count FROM courses c LEFT JOIN users u ON u.id=c.author_id LEFT JOIN lessons l ON l.course_id=c.id WHERE c.published=true GROUP BY c.id,u.name ORDER BY c.created_at DESC",
  );
  res.json({ courses: result.rows });
}));
app.get("/api/courses/:slug", asyncRoute(async (req, res) => {
  const { rows: [course] } = await pool.query(`SELECT c.*,u.name author_name FROM courses c LEFT JOIN users u ON u.id=c.author_id WHERE c.slug=$1 AND c.published=true`, [req.params.slug]);
  if (!course) return void res.status(404).json({ error: "Course not found" });
  const { rows: lessons } = await pool.query("SELECT id,title,position FROM lessons WHERE course_id=$1 ORDER BY position", [course.id]);
  res.json({ course: { ...course, lessons } });
}));

app.get("/api/member/courses", authenticate, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`SELECT c.id,c.slug,c.title,c.excerpt,c.cover_url, COUNT(l.id)::int total_lessons, COUNT(lp.lesson_id)::int completed_lessons
    FROM enrollments e JOIN courses c ON c.id=e.course_id LEFT JOIN lessons l ON l.course_id=c.id LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=$1
    WHERE e.user_id=$1 GROUP BY c.id ORDER BY e.enrolled_at DESC`, [req.user!.id]); res.json({ courses: rows });
}));
app.post("/api/member/courses/:courseId/enroll", authenticate, asyncRoute(async (req, res) => {
  const course = await pool.query("SELECT id FROM courses WHERE id=$1 AND published=true", [req.params.courseId]); if (!course.rowCount) return void res.status(404).json({ error: "Course not found" });
  await pool.query("INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [req.user!.id, req.params.courseId]); res.status(201).json({ enrolled: true });
}));
app.get("/api/member/courses/:courseId", authenticate, asyncRoute(async (req, res) => {
  const permitted = await pool.query("SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2", [req.user!.id, req.params.courseId]); if (!permitted.rowCount) return void res.status(403).json({ error: "Enroll in this course first" });
  const { rows } = await pool.query(`SELECT l.id,l.title,l.content,l.video_url,l.position,lp.completed_at,q.id quiz_id,q.question,q.options FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=$1 LEFT JOIN quizzes q ON q.lesson_id=l.id WHERE l.course_id=$2 ORDER BY l.position`, [req.user!.id, req.params.courseId]); res.json({ lessons: rows });
}));
app.post("/api/member/lessons/:lessonId/complete", authenticate, asyncRoute(async (req, res) => { await pool.query("INSERT INTO lesson_progress(user_id,lesson_id) SELECT $1,l.id FROM lessons l JOIN enrollments e ON e.course_id=l.course_id AND e.user_id=$1 WHERE l.id=$2 ON CONFLICT DO NOTHING", [req.user!.id, req.params.lessonId]); res.json({ completed: true }); }));
app.post("/api/member/quizzes/:quizId/attempt", authenticate, asyncRoute(async (req, res) => { const { answerIndex } = z.object({ answerIndex: z.number().int().min(0) }).parse(req.body); const { rows: [quiz] } = await pool.query<{ correct_index: number }>(`SELECT q.correct_index FROM quizzes q JOIN lessons l ON l.id=q.lesson_id JOIN enrollments e ON e.course_id=l.course_id WHERE q.id=$1 AND e.user_id=$2`, [req.params.quizId, req.user!.id]); if (!quiz) return void res.status(404).json({ error: "Quiz not found or course access denied" }); const correct = quiz.correct_index === answerIndex; await pool.query("INSERT INTO quiz_attempts(user_id,quiz_id,answer_index,is_correct) VALUES($1,$2,$3,$4)", [req.user!.id, req.params.quizId, answerIndex, correct]); res.json({ correct }); }));

const courseInput = z.object({ title: z.string().trim().min(3).max(180), slug: z.string().trim().optional(), excerpt: z.string().max(500).default(""), description: z.string().max(20000).default(""), coverUrl: z.string().url().nullable().optional(), level: z.string().max(50).default("Pemula"), published: z.boolean().default(false) });
app.get("/api/staff/courses", authenticate, requireRoles("lecturer", "admin"), asyncRoute(async (req, res) => { const query = req.user!.role === "admin" ? "SELECT c.*,COUNT(l.id)::int lesson_count FROM courses c LEFT JOIN lessons l ON l.course_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC" : "SELECT c.*,COUNT(l.id)::int lesson_count FROM courses c LEFT JOIN lessons l ON l.course_id=c.id WHERE c.author_id=$1 GROUP BY c.id ORDER BY c.updated_at DESC"; const { rows } = await pool.query(query, req.user!.role === "admin" ? [] : [req.user!.id]); res.json({ courses: rows }); }));
app.post("/api/staff/courses", authenticate, requireRoles("lecturer", "admin"), asyncRoute(async (req, res) => { const input = courseInput.parse(req.body); const slug = input.slug ? slugify(input.slug) : `${slugify(input.title)}-${Date.now().toString(36)}`; const { rows: [course] } = await pool.query("INSERT INTO courses(slug,title,excerpt,description,cover_url,level,published,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [slug,input.title,input.excerpt,input.description,input.coverUrl || null,input.level,input.published,req.user!.id]); res.status(201).json({ course }); }));
app.put("/api/staff/courses/:courseId", authenticate, requireRoles("lecturer", "admin"), asyncRoute(async (req, res) => { const input = courseInput.parse(req.body); const { rows: [course] } = await pool.query("UPDATE courses SET slug=$1,title=$2,excerpt=$3,description=$4,cover_url=$5,level=$6,published=$7,updated_at=now() WHERE id=$8 RETURNING *", [input.slug ? slugify(input.slug) : slugify(input.title),input.title,input.excerpt,input.description,input.coverUrl || null,input.level,input.published,req.params.courseId]); if (!course) return void res.status(404).json({ error: "Course not found" }); res.json({ course }); }));
const lessonInput = z.object({ title: z.string().trim().min(3).max(180), content: z.string().max(50000).default(""), videoUrl: z.string().url().nullable().optional(), position: z.number().int().min(1), quiz: z.object({ question: z.string().min(3), options: z.array(z.string().min(1)).min(2).max(6), correctIndex: z.number().int().min(0) }).optional() });
app.post("/api/staff/courses/:courseId/lessons", authenticate, requireRoles("lecturer", "admin"), asyncRoute(async (req, res) => { const input = lessonInput.parse(req.body); if (!isSafeExternalVideoUrl(input.videoUrl)) return void res.status(400).json({ error: "Video URL must use HTTP(S)" }); const client=await pool.connect(); try { await client.query("BEGIN"); const { rows:[lesson] }=await client.query("INSERT INTO lessons(course_id,title,content,video_url,position) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.params.courseId,input.title,input.content,input.videoUrl || null,input.position]); if(input.quiz){ if(input.quiz.correctIndex >= input.quiz.options.length) return void res.status(400).json({ error:"Quiz correctIndex is out of range" }); await client.query("INSERT INTO quizzes(lesson_id,question,options,correct_index) VALUES($1,$2,$3,$4)",[lesson.id,input.quiz.question,JSON.stringify(input.quiz.options),input.quiz.correctIndex]); } await client.query("COMMIT"); res.status(201).json({lesson}); } catch(e){ await client.query("ROLLBACK"); throw e; } finally {client.release();} }));

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.flatten() }); console.error(error); res.status(500).json({ error: "Internal server error" }); });

initializeDatabase().then(() => app.listen(port, () => console.log(`Akademi API listening on ${port}`))).catch((error) => { console.error("Database initialization failed", error); process.exit(1); });
export { app, canManageContent };
