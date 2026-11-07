// seed.js - Demo data: admin, student, questions, exam
import pool from './db.js';
import { hashPassword } from './auth.js';

async function seed() {
  // Clear tables
  await pool.query('DELETE FROM violations');
  await pool.query('DELETE FROM answers');
  await pool.query('DELETE FROM attempts');
  await pool.query('DELETE FROM exam_questions');
  await pool.query('DELETE FROM exams');
  await pool.query('DELETE FROM questions');
  await pool.query('DELETE FROM users');

  // Users
  const adminHash = await hashPassword('admin123');
  const studentHash = await hashPassword('student123');
  const admin = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@exam.com', $1, 'admin') RETURNING id`,
    [adminHash]
  );
  const student = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Student', 'student@exam.com', $1, 'student') RETURNING id`,
    [studentHash]
  );

  // Questions
  const questions = [
    {
      text: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correct_index: 1,
    },
    {
      text: 'Capital of France?',
      options: ['Berlin', 'London', 'Paris', 'Rome'],
      correct_index: 2,
    },
    {
      text: 'Sun rises in the?',
      options: ['West', 'East', 'North', 'South'],
      correct_index: 1,
    },
    {
      text: '5 x 5 = ?',
      options: ['10', '20', '25', '30'],
      correct_index: 2,
    },
    {
      text: 'Water chemical formula?',
      options: ['CO2', 'H2O', 'O2', 'NaCl'],
      correct_index: 1,
    },
  ];
  const qids = [];
  for (const q of questions) {
    const res = await pool.query(
      'INSERT INTO questions (text, options, correct_index) VALUES ($1, $2, $3) RETURNING id',
      [q.text, JSON.stringify(q.options), q.correct_index]
    );
    qids.push(res.rows[0].id);
  }

  // Exam
  const exam = await pool.query(
    `INSERT INTO exams (title, duration_min, pass_percent) VALUES ('Demo Exam', 10, 40) RETURNING id`,
  );
  for (const qid of qids) {
    await pool.query('INSERT INTO exam_questions (exam_id, question_id) VALUES ($1, $2)', [exam.rows[0].id, qid]);
  }

  console.log('Seeded demo admin, student, 5 questions, 1 exam.');
  process.exit(0);
}

seed();
