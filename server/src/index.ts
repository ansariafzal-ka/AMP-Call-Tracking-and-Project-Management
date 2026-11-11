import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import callsRouter from './routes/calls';
import contactsRouter from './routes/contacts';
import usersRouter from './routes/users';
import followUpsRouter from './routes/followUps';
import adminUsersRouter from './routes/adminUsers';
import adminContactsRouter from './routes/adminContacts';
import adminDashboardRouter from './routes/adminDashboard';
import adminProjectsRouter from './routes/adminProjects';
import adminCallsRouter from './routes/adminCalls';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Enable CORS for all origins (development only)
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);

app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

app.use('/calls', callsRouter);
app.use('/api/calls', callsRouter);

app.use('/contacts', contactsRouter);
app.use('/api/contacts', contactsRouter);

app.use('/users', usersRouter);
app.use('/api/users', usersRouter);

app.use('/follow-ups', followUpsRouter);
app.use('/api/follow-ups', followUpsRouter);

app.use('/admin/users', adminUsersRouter);
app.use('/api/admin/users', adminUsersRouter);

app.use('/admin/contacts', adminContactsRouter);
app.use('/api/admin/contacts', adminContactsRouter);

app.use('/admin/dashboard', adminDashboardRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);

app.use('/admin/projects', adminProjectsRouter);
app.use('/api/admin/projects', adminProjectsRouter);

app.use('/admin/calls', adminCallsRouter);
app.use('/api/admin/calls', adminCallsRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
