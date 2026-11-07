// signaling.js - Socket.IO for WebRTC signaling
import { Server } from 'socket.io';

export function setupSignaling(server) {
  const io = new Server(server, { cors: { origin: '*' } });
  // Map: examId -> { studentId: socketId }
  const liveStudents = new Map();

  io.on('connection', (socket) => {
    socket.on('join_exam', ({ examId, userId }) => {
      socket.join(`exam_${examId}`);
      liveStudents.set(userId, socket.id);
      io.emit('live_students', Array.from(liveStudents.keys()));
    });
    socket.on('leave_exam', ({ userId }) => {
      liveStudents.delete(userId);
      io.emit('live_students', Array.from(liveStudents.keys()));
    });
    // Relay signaling messages
    socket.on('signal', (data) => {
      const { to } = data;
      if (to && liveStudents.has(to)) {
        io.to(liveStudents.get(to)).emit('signal', data);
      }
    });
    socket.on('disconnect', () => {
      for (const [userId, sid] of liveStudents.entries()) {
        if (sid === socket.id) liveStudents.delete(userId);
      }
      io.emit('live_students', Array.from(liveStudents.keys()));
    });
  });
}
