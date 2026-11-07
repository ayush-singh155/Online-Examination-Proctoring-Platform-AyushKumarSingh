# ExamGuard - Online Examination & Proctoring Platform

## Features
- Secure online exams with live webcam proctoring
- Admin: manage questions, exams, analytics, live proctoring
- Student: take timed exams, see results
- Real-time video via WebRTC, signaling via Socket.IO
- PostgreSQL database, JWT auth, bcryptjs password hashing

## Quick Start

1. **Clone and setup**
   ```sh
   git clone <repo-url>
   cd exam-platform
   cp backend/.env.example backend/.env
   # (edit .env if needed)
   ```
2. **Run with Docker Compose**
   ```sh
   docker-compose up --build
   ```
   - Backend: http://localhost:4000
   - Frontend: http://localhost:5173

3. **Seed demo data**
   In a new terminal:
   ```sh
   docker-compose exec backend node src/seed.js
   ```

4. **Test WebRTC proctoring**
   - Open two browser windows:
     - Login as student (student@exam.com / student123), start an exam.
     - Login as admin (admin@exam.com / admin123), go to Live Proctoring, select the student to watch.

## Next Steps
- Add face detection (MediaPipe/face-api.js) in camera panel
- Use a TURN server for WebRTC in production
- Enable HTTPS for secure camera streaming
- Add option to disable exam retakes

---

**.env.example** and **schema.sql** are provided. See backend/README.md for API details.
