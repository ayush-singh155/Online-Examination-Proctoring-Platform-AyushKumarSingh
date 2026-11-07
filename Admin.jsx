import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import io from 'socket.io-client';

export default function Admin({ user }) {
  const [tab, setTab] = useState('questions');
  return (
    <div style={{ maxWidth: 900, margin: '2rem auto' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <button className={"button" + (tab === 'questions' ? ' success' : '')} onClick={() => setTab('questions')}>Question Bank</button>
        <button className={"button" + (tab === 'analytics' ? ' success' : '')} onClick={() => setTab('analytics')}>Result Analytics</button>
        <button className={"button" + (tab === 'proctor' ? ' success' : '')} onClick={() => setTab('proctor')}>Live Proctoring</button>
      </div>
      {tab === 'questions' && <QuestionBank />}
      {tab === 'analytics' && <Analytics />}
      {tab === 'proctor' && <LiveProctor />}
    </div>
  );
}

function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState({ text: '', options: ['', '', '', ''], correct_index: 0 });
  const [err, setErr] = useState('');
  useEffect(() => { fetchQuestions(); }, []);
  async function fetchQuestions() {
    try { setQuestions(await api('/questions')); } catch {}
  }
  async function addQuestion(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/questions', { method: 'POST', body: JSON.stringify(form) });
      setForm({ text: '', options: ['', '', '', ''], correct_index: 0 });
      fetchQuestions();
    } catch (e) { setErr(e.message); }
  }
  async function delQuestion(id) {
    if (!window.confirm('Delete this question?')) return;
    await api('/questions', { method: 'DELETE', body: JSON.stringify({ id }) });
    fetchQuestions();
  }
  return (
    <div className="card">
      <div style={{ fontWeight: 'bold', fontSize: 18 }}>Add Question</div>
      <form onSubmit={addQuestion} style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Question text" required value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
        {form.options.map((opt, i) => (
          <input key={i} className="input" placeholder={`Option ${i + 1}`} required value={opt} onChange={e => setForm(f => ({ ...f, options: f.options.map((o, j) => j === i ? e.target.value : o) }))} />
        ))}
        <select className="input" value={form.correct_index} onChange={e => setForm(f => ({ ...f, correct_index: +e.target.value }))}>
          {[0, 1, 2, 3].map(i => <option key={i} value={i}>Correct: Option {i + 1}</option>)}
        </select>
        <button className="button" type="submit">Add</button>
        {err && <div className="violation">{err}</div>}
      </form>
      <div style={{ fontWeight: 'bold', fontSize: 18 }}>Questions</div>
      {questions.map(q => (
        <div key={q.id} className="card" style={{ background: '#f3f4f6', margin: '0.5rem 0' }}>
          <div>{q.text}</div>
          <ol>{q.options.map((o, i) => <li key={i}>{o}{i === q.correct_index && <b> (correct)</b>}</li>)}</ol>
          <button className="button danger" onClick={() => delQuestion(q.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

function Analytics() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/admin/analytics').then(setData); }, []);
  if (!data) return <div className="card">Loading...</div>;
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card title="Total Attempts" value={data.totalAttempts} />
        <Card title="Avg. Score" value={Math.round(data.avgScore)} />
        <Card title="Pass Rate" value={Math.round(data.passRate) + '%'} />
        <Card title="Violations" value={data.totalViolations} />
      </div>
      <div style={{ margin: '2rem 0' }}>
        <div style={{ fontWeight: 'bold' }}>Score Distribution</div>
        <BarChart dist={data.dist} />
      </div>
      <div>
        <div style={{ fontWeight: 'bold' }}>Leaderboard</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th>Name</th><th>Exam</th><th>Score</th><th>Violations</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((row, i) => (
              <tr key={i} style={{ textAlign: 'center' }}>
                <td>{row.name}</td>
                <td>{row.title}</td>
                <td>{row.score} / {row.total}</td>
                <td>{row.violations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Card({ title, value }) {
  return <div className="card" style={{ minWidth: 120, textAlign: 'center' }}><div style={{ fontWeight: 'bold' }}>{title}</div><div style={{ fontSize: 24 }}>{value}</div></div>;
}
function BarChart({ dist }) {
  const ranges = ['0-39', '40-59', '60-79', '80-100'];
  const counts = ranges.map(r => dist.find(d => d.range === r)?.count || 0);
  const max = Math.max(...counts, 1);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
      {counts.map((c, i) => (
        <div key={i} style={{ width: 40, height: (c / max) * 70, background: 'var(--primary)', borderRadius: 8, textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 12 }}>{ranges[i]}</div>
          <div style={{ fontSize: 14 }}>{c}</div>
        </div>
      ))}
    </div>
  );
}

function LiveProctor() {
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peer, setPeer] = useState(null);
  useEffect(() => {
    const sock = io('/', { transports: ['websocket'] });
    sock.on('live_students', setStudents);
    return () => sock.disconnect();
  }, []);
  async function watchStudent(studentId) {
    setSelected(studentId);
    // WebRTC peer connection
    const pc = new window.RTCPeerConnection();
    setPeer(pc);
    const sock = io('/', { transports: ['websocket'] });
    sock.emit('signal', { to: studentId, type: 'watch_request' });
    sock.on('signal', async (data) => {
      if (data.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sock.emit('signal', { to: studentId, type: 'answer', answer });
      }
      if (data.type === 'ice') {
        await pc.addIceCandidate(data.candidate);
      }
    });
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) sock.emit('signal', { to: studentId, type: 'ice', candidate: e.candidate });
    };
  }
  return (
    <div className="card">
      <div style={{ fontWeight: 'bold', fontSize: 18 }}>Live Proctoring</div>
      <div>Students in exam:</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {students.map(sid => (
          <button key={sid} className="button" onClick={() => watchStudent(sid)}>Watch {sid}</button>
        ))}
      </div>
      {remoteStream && <video autoPlay controls width={320} height={240} srcObject={remoteStream} style={{ borderRadius: 8, border: '2px solid var(--primary)', marginTop: 16 }} />}
    </div>
  );
}
