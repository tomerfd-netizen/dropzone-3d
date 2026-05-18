require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { stmts, updateLeaderboardEntry } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

app.use(cors({ origin: ['http://localhost:5175', 'http://127.0.0.1:5175'] }));
app.use(express.json());

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (stmts.getUserByUsername.get(username)) return res.status(409).json({ error: 'Username already taken' });
    const hash = await bcrypt.hash(password, 10);
    const result = stmts.createUser.run(username, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = stmts.getUserByUsername.get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scores', auth, (req, res) => {
  const { score, level } = req.body;
  if (score == null || level == null) return res.status(400).json({ error: 'Score and level required' });
  stmts.createScore.run(req.user.id, score, level);
  updateLeaderboardEntry(req.user.id, req.user.username, score, level);
  res.json({ success: true });
});

app.get('/api/leaderboard', (req, res) => {
  res.json(stmts.getLeaderboard.all());
});

app.get('/api/me/scores', auth, (req, res) => {
  res.json(stmts.getUserScores.all(req.user.id));
});

app.get('/api/admin/stats', (req, res) => {
  const { count: totalUsers } = stmts.countUsers.get();
  const { count: totalGames } = stmts.countGames.get();
  const top5Scores   = stmts.getTop5.all();
  const recentScores = stmts.getRecentScores.all();
  res.json({ totalUsers, totalGames, top5Scores, recentScores });
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
