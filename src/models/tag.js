const db = require('../db/database');

function getAllTags() {
  return db.prepare('SELECT * FROM tags ORDER BY name').all();
}

function createTag(name) {
  const stmt = db.prepare('INSERT INTO tags (name) VALUES (?)');
  const result = stmt.run(name);
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
}

function getTagById(id) {
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
}

module.exports = { getAllTags, createTag, getTagById };
