const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'game.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    score INTEGER NOT NULL,
    level INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    username TEXT NOT NULL,
    score INTEGER NOT NULL,
    level INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const stmts = {
  createUser: db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  createScore: db.prepare('INSERT INTO scores (user_id, score, level) VALUES (?, ?, ?)'),
  getUserScores: db.prepare('SELECT * FROM scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'),
  getLeaderboard: db.prepare('SELECT username, score, level, created_at FROM leaderboard ORDER BY score DESC LIMIT 10'),
  getLeaderboardEntry: db.prepare('SELECT * FROM leaderboard WHERE user_id = ?'),
  insertLeaderboard: db.prepare('INSERT INTO leaderboard (user_id, username, score, level) VALUES (?, ?, ?, ?)'),
  updateLeaderboard: db.prepare('UPDATE leaderboard SET score = ?, level = ?, created_at = CURRENT_TIMESTAMP WHERE user_id = ?'),
  countLeaderboard:  db.prepare('SELECT COUNT(*) as count FROM leaderboard'),
  countUsers:        db.prepare('SELECT COUNT(*) as count FROM users'),
  countGames:        db.prepare('SELECT COUNT(*) as count FROM scores'),
  getTop5:           db.prepare('SELECT username, score, level FROM leaderboard ORDER BY score DESC LIMIT 5'),
  getRecentScores:   db.prepare(`SELECT u.username, s.score, s.level, s.created_at as date FROM scores s JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC LIMIT 10`),
  getMinLeaderboard: db.prepare('SELECT * FROM leaderboard ORDER BY score ASC LIMIT 1'),
  deleteLeaderboardById: db.prepare('DELETE FROM leaderboard WHERE id = ?'),
};

function updateLeaderboardEntry(userId, username, score, level) {
  const existing = stmts.getLeaderboardEntry.get(userId);
  if (existing) {
    if (score > existing.score) stmts.updateLeaderboard.run(score, level, userId);
  } else {
    const { count } = stmts.countLeaderboard.get();
    if (count < 10) {
      stmts.insertLeaderboard.run(userId, username, score, level);
    } else {
      const min = stmts.getMinLeaderboard.get();
      if (min && score > min.score) {
        stmts.deleteLeaderboardById.run(min.id);
        stmts.insertLeaderboard.run(userId, username, score, level);
      }
    }
  }
}

module.exports = { stmts, updateLeaderboardEntry };
