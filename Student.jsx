import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import io from 'socket.io-client';

export default function Student({ user }) {
  const [exams, setExams] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timer, setTimer] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [palette, setPalette] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [result, setResult] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [stream, setStream] = useState(null);
  const [socket, setSocket] = useState(null);
  const [autoSubmit, setAutoSubmit] = useState(false);

  // Fetch exams
  useEffect(() => {
    api('/exams').then(setExams).catch(() => setExams([]));
  }, []);

  // Timer
  useEffect(() => {
    if (!endTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimer(left);
      if (left === 0) submitExam();
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  // Tab switch violation
  useEffect(() => {
    if (!attempt) return;
    const onBlur = () => addViolation('tab_switch');
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [attempt]);

  // Camera
  useEffect(() => {
    if (!cameraOn) return;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(s);
        // Place for face detection integration (e.g., MediaPipe/face-api.js)
      } catch {
        alert('Camera access denied!');
        setCameraOn(false);
      }
    })();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line
  }, [cameraOn]);

  // Socket.IO for signaling (for proctoring)
  useEffect(() => {
    if (!attempt) return;
    const sock = io('/', { transports: ['websocket'] });
    sock.emit('join_exam', { examId: attempt.exam_id, userId: user.id });
    setSocket(sock);
    return () => {
      sock.emit('leave_exam', { userId: user.id });
      sock.disconnect();
    };
    // eslint-disable-next-line
  }, [attempt]);

  async function startExam(exam) {
    try {
      const res = await api(`/exams/${exam.id}/start`, { method: 'POST' });
      setAttempt(res.attempt);
      setQuestions(res.questions);
      setAnswers({});
      setPalette(0);
      setViolationCount(0);
      setResult(null);
      setCameraOn(true);
      // Timer: use server time
      const started = new Date(res.attempt.started_at).getTime();
      setEndTime(started + exam.duration_min * 60 * 1000);
    } catch (e) {
      alert(e.message);
    }
  }

  async function selectAnswer(qid, idx) {
    setAnswers(a => ({ ...a, [qid]: idx }));
    try {
      await api(`/attempts/${attempt.id}/answer`, {
        method: 'POST',
        body: JSON.stringify({ question_id: qid, selected: idx }),
      });
    } catch (e) {
      alert(e.message);
    }
  }

  async function addViolation(type) {
    try {
      const res = await api(`/attempts/${attempt.id}/violation`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      setViolationCount(v => v + 1);
      if (res.auto_submitted) {
        setAutoSubmit(true);
        await fetchResult();
      }
    } catch {}
  }

  async function submitExam() {
    if (!attempt || result) return;
    try {
      await api(`/attempts/${attempt.id}/submit`, { method: 'POST' });
      await fetchResult();
    } catch (e) {
      alert(e.message);
    }
  }

  async function fetchResult() {
    try {
      const res = await api(`/attempts/${attempt.id}/result`);
      setResult(res);
      setCameraOn(false);
    } catch (e) {
      alert(e.message);
    }
  }

  if (result) return <ResultView result={result} autoSubmit={autoSubmit} />;
  if (attempt) return (
    <div className="card" style={{ maxWidth: 600, margin: '2rem auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>Exam: <b>{questions.length && questions[0].exam_title}</b></div>
        <div>Time left: <b>{timer}s</b></div>
      </div>
      <div className="timer-bar" style={{ width: `${(timer / (questions.length ? questions[0].duration_min * 60 : 1)) * 100}%` }} />
      <div className="palette">
        {questions.map((q, i) => (
          <button key={q.id} className={"palette-btn" + (palette === i ? ' selected' : '')} onClick={() => setPalette(i)}>{i + 1}</button>
        ))}
      </div>
      <QuestionView q={questions[palette]} selected={answers[questions[palette].id]} onSelect={idx => selectAnswer(questions[palette].id, idx)} />
      <div style={{ margin: '1rem 0' }}>
        <button className="button danger" onClick={submitExam}>Submit</button>
        <span className="violation" style={{ float: 'right' }}>Violations: {violationCount}/3</span>
      </div>
      <CameraPanel cameraOn={cameraOn} stream={stream} />
    </div>
  );
  return (
    <div style={{ maxWidth: 600, margin: '2rem auto' }}>
      <div className="header">Available Exams</div>
      {exams.map(exam => (
        <div className="card" key={exam.id}>
          <div style={{ fontWeight: 'bold', fontSize: 18 }}>{exam.title}</div>
          <div>Duration: {exam.duration_min} min</div>
          <button className="button" onClick={() => startExam(exam)}>Start</button>
        </div>
      ))}
    </div>
  );
}

function QuestionView({ q, selected, onSelect }) {
  if (!q) return null;
  return (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{q.text}</div>
      {q.options.map((opt, i) => (
        <div key={i}>
          <label style={{ display: 'block', margin: '0.5rem 0' }}>
            <input type="radio" name={q.id} checked={selected === i} onChange={() => onSelect(i)} />
            {opt}
          </label>
        </div>
      ))}
    </div>
  );
}

function CameraPanel({ cameraOn, stream }) {
  const ref = React.useRef();
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div style={{ margin: '1rem 0' }}>
      <div style={{ fontWeight: 'bold' }}>Camera Panel</div>
      {cameraOn ? <video ref={ref} autoPlay width={180} height={120} style={{ borderRadius: 8, border: '2px solid var(--primary)' }} /> : <div>Camera off</div>}
      {/* Face detection can be added here */}
    </div>
  );
}

function ResultView({ result, autoSubmit }) {
  return (
    <div className="card" style={{ maxWidth: 600, margin: '2rem auto' }}>
      <div className="header">Exam Result</div>
      <div>Score: <b>{result.score} / {result.total}</b></div>
      <div>Percentage: <b>{Math.round((result.score / result.total) * 100)}%</b></div>
      <div>Status: <b style={{ color: result.pass ? 'var(--success)' : 'var(--danger)' }}>{result.pass ? 'Pass' : 'Fail'}</b></div>
      <div>Violations: <b>{result.violations.length}</b></div>
      {autoSubmit && <div className="violation">Auto-submitted due to violations</div>}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 'bold' }}>Review:</div>
        {result.questions.map((q, i) => (
          <div key={q.id} style={{ margin: '0.5rem 0' }}>
            <div>{i + 1}. {q.text}</div>
            <div>Your answer: {q.options[result.answers.find(a => a.question_id === q.id)?.selected] ?? 'Not answered'}</div>
            <div>Correct answer: {q.options[q.correct_index]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
