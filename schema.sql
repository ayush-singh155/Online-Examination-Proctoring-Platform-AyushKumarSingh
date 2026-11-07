-- ExamGuard SQL schema
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'admin'))
);

CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_index INT NOT NULL CHECK (correct_index BETWEEN 0 AND 3)
);

CREATE TABLE IF NOT EXISTS exams (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    duration_min INT NOT NULL,
    pass_percent INT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_questions (
    exam_id INT REFERENCES exams(id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS attempts (
    id SERIAL PRIMARY KEY,
    exam_id INT REFERENCES exams(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMP,
    score INT,
    total INT,
    status TEXT NOT NULL DEFAULT 'in_progress'
);

CREATE TABLE IF NOT EXISTS answers (
    attempt_id INT REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    selected INT NOT NULL CHECK (selected BETWEEN 0 AND 3),
    PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    attempt_id INT REFERENCES attempts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
