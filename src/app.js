const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const auth = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

app.get('/api/me', auth, (req, res) => {
  res.status(200).json({ user: req.user });
});

module.exports = app;
