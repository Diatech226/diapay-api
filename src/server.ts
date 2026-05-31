import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { apiRouter } from './routes';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.get('/health', (_req, res) => res.json({ service: 'diapay-api', status: 'ok' }));
app.use('/api/v1', apiRouter);

const port = Number(process.env.PORT ?? 5100);
app.listen(port, () => console.log(`Diapay API running on :${port}`));
