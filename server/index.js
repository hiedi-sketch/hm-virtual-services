require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createSchema } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL
    : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadPath = path.resolve(process.env.UPLOAD_PATH || '../uploads');
app.use('/uploads', express.static(uploadPath));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/time-entries', require('./routes/time-entries'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/agents/run', require('./routes/agentRuns'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/integrations/asana', require('./routes/integrations/asana'));
app.use('/api/integrations/clickup', require('./routes/integrations/clickup'));
app.use('/api/integrations/qbo', require('./routes/integrations/qbo'));

if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  await createSchema();

  const server = app.listen(PORT, () => {
    console.log(`HM Virtual Services API running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌  Port ${PORT} is already in use.\n`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
