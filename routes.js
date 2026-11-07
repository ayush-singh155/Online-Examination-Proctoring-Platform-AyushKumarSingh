// routes.js - All REST API endpoints
import express from 'express';
import pool from './db.js';
import { signToken, hashPassword, comparePassword, requireAuth, requireAdmin } from './auth.js';

const router = express.Router();

// Helper: get user from req
const getUser = (req) => req.user;

// --- Auth ---
router.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const hash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, 'student']
    );
    res.json({ user: result.rows[0], token: signToken(result.rows[0]) });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });
  const user = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  if (!user || !(await comparePassword(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token: signToken(user) });
});

// --- Questions (admin) ---
router.get('/questions', requireAuth, requireAdmin, async (req, res) => {
  const q = await pool.query('SELECT * FROM questions ORDER BY id');
  res.json(q.rows);
});

router.post('/questions', requireAuth, requireAdmin, async (req, res) => {
  const { text, options, correct_index } = req.body;
  if (!text || !options || options.length !== 4 || correct_index == null)
    return res.status(400).json({ error: 'Invalid question data' });
  const result = await pool.query(
    'INSERT INTO questions (text, options, correct_index) VALUES ($1, $2, $3) RETURNING *',
    [text, JSON.stringify(options), correct_index]
  );
  res.json(result.rows[0]);
});

router.delete('/questions', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  await pool.query('DELETE FROM questions WHERE id=$1', [id]);
  res.json({ success: true });
});

// --- Exams ---
router.get('/exams', requireAuth, async (req, res) => {
  const exams = await pool.query('SELECT * FROM exams ORDER BY id');
  res.json(exams.rows);
});

router.post('/exams', requireAuth, requireAdmin, async (req, res) => {
  const { title, duration_min, pass_percent, question_ids } = req.body;
  if (!title || !duration_min || !pass_percent || !Array.isArray(question_ids) || !question_ids.length)
    return res.status(400).json({ error: 'Invalid exam data' });
  const exam = await pool.query(
    'INSERT INTO exams (title, duration_min, pass_percent) VALUES ($1, $2, $3) RETURNING *',
    [title, duration_min, pass_percent]
  );
  for (const qid of question_ids) {
    await pool.query('INSERT INTO exam_questions (exam_id, question_id) VALUES ($1, $2)', [exam.rows[0].id, qid]);
  }
  res.json(exam.rows[0]);
});

// --- Exam Start (student) ---
router.post('/exams/:id/start', requireAuth, async (req, res) => {
  const user = getUser(req);
  const examId = req.params.id;
  // Prevent retake: only one in_progress per user/exam
  const existing = await pool.query('SELECT * FROM attempts WHERE exam_id=$1 AND user_id=$2 AND status=$3', [examId, user.id, 'in_progress']);
  if (existing.rows.length) return res.status(400).json({ error: 'Exam already started' });
  // Get questions
  const qids = (await pool.query('SELECT question_id FROM exam_questions WHERE exam_id=$1', [examId])).rows.map(r => r.question_id);
  if (!qids.length) return res.status(400).json({ error: 'No questions in exam' });
  const attempt = await pool.query(
    'INSERT INTO attempts (exam_id, user_id, status) VALUES ($1, $2, $3) RETURNING *',
    [examId, user.id, 'in_progress']
  );
  // Pre-create answer rows
  for (const qid of qids) {
    await pool.query('INSERT INTO answers (attempt_id, question_id, selected) VALUES ($1, $2, $3)', [attempt.rows[0].id, qid, -1]);
  }
  res.json({ attempt: attempt.rows[0], questions: await getExamQuestions(qids) });
});

// Helper: get questions by ids
async function getExamQuestions(qids) {
  if (!qids.length) return [];
  const q = await pool.query('SELECT * FROM questions WHERE id = ANY($1)', [qids]);
  return q.rows.map(row => ({ ...row, options: row.options }));
}

// --- Answer (student) ---
router.post('/attempts/:id/answer', requireAuth, async (req, res) => {
  const user = getUser(req);
  const attemptId = req.params.id;
  const { question_id, selected } = req.body;
  // Check attempt ownership and status
  const attempt = (await pool.query('SELECT * FROM attempts WHERE id=$1', [attemptId])).rows[0];
  if (!attempt || attempt.user_id !== user.id) return res.status(403).json({ error: 'Not your attempt' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Attempt not active' });
  // Check time
  const exam = (await pool.query('SELECT * FROM exams WHERE id=$1', [attempt.exam_id])).rows[0];
  const end = new Date(attempt.started_at);
  end.setMinutes(end.getMinutes() + exam.duration_min);
  if (new Date() > end) return res.status(400).json({ error: 'Time up' });
  // Save answer
  await pool.query('UPDATE answers SET selected=$1 WHERE attempt_id=$2 AND question_id=$3', [selected, attemptId, question_id]);
  res.json({ success: true });
});

// --- Violation (student) ---
router.post('/attempts/:id/violation', requireAuth, async (req, res) => {
  const user = getUser(req);
  const attemptId = req.params.id;
  const { type } = req.body;
  const attempt = (await pool.query('SELECT * FROM attempts WHERE id=$1', [attemptId])).rows[0];
  if (!attempt || attempt.user_id !== user.id) return res.status(403).json({ error: 'Not your attempt' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Attempt not active' });
  await pool.query('INSERT INTO violations (attempt_id, type) VALUES ($1, $2)', [attemptId, type]);
  // Count violations
  const count = (await pool.query('SELECT COUNT(*) FROM violations WHERE attempt_id=$1', [attemptId])).rows[0].count;
  if (count >= 3) {
    await evaluateAttempt(attemptId);
    await pool.query('UPDATE attempts SET status=$1, submitted_at=NOW() WHERE id=$2', ['auto_submitted', attemptId]);
    return res.json({ auto_submitted: true });
  }
  res.json({ success: true });
});

// --- Submit (student) ---
router.post('/attempts/:id/submit', requireAuth, async (req, res) => {
  const user = getUser(req);
  const attemptId = req.params.id;
  const attempt = (await pool.query('SELECT * FROM attempts WHERE id=$1', [attemptId])).rows[0];
  if (!attempt || attempt.user_id !== user.id) return res.status(403).json({ error: 'Not your attempt' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Already submitted' });
  await evaluateAttempt(attemptId);
  await pool.query('UPDATE attempts SET status=$1, submitted_at=NOW() WHERE id=$2', ['submitted', attemptId]);
  res.json({ success: true });
});

// --- Result (student) ---
router.get('/attempts/:id/result', requireAuth, async (req, res) => {
  const user = getUser(req);
  const attemptId = req.params.id;
  const attempt = (await pool.query('SELECT * FROM attempts WHERE id=$1', [attemptId])).rows[0];
  if (!attempt || attempt.user_id !== user.id) return res.status(403).json({ error: 'Not your attempt' });
  // Always re-evaluate for idempotency
  await evaluateAttempt(attemptId);
  // Get answers, questions, violations
  const answers = (await pool.query('SELECT * FROM answers WHERE attempt_id=$1', [attemptId])).rows;
  const questions = await getExamQuestions(answers.map(a => a.question_id));
  const violations = (await pool.query('SELECT * FROM violations WHERE attempt_id=$1', [attemptId])).rows;
  res.json({
    attempt,
    answers,
    questions,
    violations,
    score: attempt.score,
    total: attempt.total,
    pass: attempt.score >= Math.ceil(attempt.total * (await getPassPercent(attempt.exam_id)) / 100),
  });
});

// --- Analytics (admin) ---
router.get('/admin/analytics', requireAuth, requireAdmin, async (req, res) => {
  // Cards
  const totalAttempts = (await pool.query('SELECT COUNT(*) FROM attempts')).rows[0].count;
  const avgScore = (await pool.query('SELECT AVG(score) FROM attempts WHERE status != $1', ['in_progress'])).rows[0].avg || 0;
  const passRate = (await pool.query('SELECT COUNT(*) FILTER (WHERE score >= total * (SELECT pass_percent FROM exams WHERE id=exam_id)/100) * 100.0 / NULLIF(COUNT(*),0) as pass_rate FROM attempts WHERE status != $1', ['in_progress'])).rows[0].pass_rate || 0;
  const totalViolations = (await pool.query('SELECT COUNT(*) FROM violations')).rows[0].count;
  // Score distribution
  const dist = (await pool.query(`SELECT
    CASE
      WHEN score < 40 THEN '0-39'
      WHEN score < 60 THEN '40-59'
      WHEN score < 80 THEN '60-79'
      ELSE '80-100'
    END as range, COUNT(*) FROM attempts WHERE status != 'in_progress' GROUP BY range ORDER BY range`)).rows;
  // Leaderboard
  const leaderboard = (await pool.query(`SELECT u.name, e.title, a.score, a.total, (SELECT COUNT(*) FROM violations v WHERE v.attempt_id=a.id) as violations
    FROM attempts a
    JOIN users u ON a.user_id=u.id
    JOIN exams e ON a.exam_id=e.id
    WHERE a.status != 'in_progress'
    ORDER BY a.score DESC LIMIT 10`)).rows;
  res.json({ totalAttempts, avgScore, passRate, totalViolations, dist, leaderboard });
});

// --- Helpers ---
async function evaluateAttempt(attemptId) {
  // Idempotent: always recompute
  const attempt = (await pool.query('SELECT * FROM attempts WHERE id=$1', [attemptId])).rows[0];
  if (!attempt) return;
  const answers = (await pool.query('SELECT * FROM answers WHERE attempt_id=$1', [attemptId])).rows;
  const questions = await getExamQuestions(answers.map(a => a.question_id));
  let score = 0;
  for (const ans of answers) {
    const q = questions.find(q => q.id === ans.question_id);
    if (q && ans.selected === q.correct_index) score++;
  }
  await pool.query('UPDATE attempts SET score=$1, total=$2 WHERE id=$3', [score, questions.length, attemptId]);
}

async function getPassPercent(examId) {
  const exam = (await pool.query('SELECT * FROM exams WHERE id=$1', [examId])).rows[0];
  return exam ? exam.pass_percent : 40;
}

export default router;
