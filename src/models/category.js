const db = require('../db/database');

function getAllCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY name').all();
}

function createCategory(name) {
  const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
  const result = stmt.run(name);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
}

function getCategoryById(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

module.exports = { getAllCategories, createCategory, getCategoryById };
