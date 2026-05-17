require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

['uploads', 'uploads/csv', 'uploads/reports'].forEach(d =>
  fs.mkdirSync(path.join(__dirname, d), { recursive: true })
);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth',     require('./routes/auth.routes'));
app.use('/api/advanced', require('./routes/advanced.routes'));

app.get('/health', (_, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message });
});

const { initDB } = require('./db/connection');
initDB()
  .then(() => app.listen(PORT, () => console.log(`✅ ReviewMind running on port ${PORT}`)))
  .catch(err => {
    console.error('[DB] Init failed:', err.message);
    app.listen(PORT, () => console.log(`⚠️  ReviewMind on port ${PORT} (DB offline - resume Azure SQL)`));
  });

module.exports = app;