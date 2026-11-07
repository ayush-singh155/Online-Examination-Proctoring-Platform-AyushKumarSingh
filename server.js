// server.js - Main Express app
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes.js';
import { setupSignaling } from './signaling.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', router);

const server = http.createServer(app);
setupSignaling(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`ExamGuard backend running on port ${PORT}`);
});
