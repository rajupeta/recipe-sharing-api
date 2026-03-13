const db = require('../db/database');

function createUser({ username, email, passwordHash }) {
  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, email, passwordHash);

  return db.prepare(
    'SELECT id, username, email, bio, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);
}

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findById(id) {
  return db.prepare(
    'SELECT id, username, email, bio, created_at FROM users WHERE id = ?'
  ).get(id);
}

module.exports = { createUser, findByEmail, findByUsername, findById };
