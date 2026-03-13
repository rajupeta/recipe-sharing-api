const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const favoritesRoutes = require('./routes/favorites');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api', favoritesRoutes);

module.exports = app;
