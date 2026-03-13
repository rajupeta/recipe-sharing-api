const db = require('../db/database');

function addFavorite(userId, recipeId) {
  const stmt = db.prepare(
    'INSERT INTO favorites (user_id, recipe_id) VALUES (?, ?)'
  );
  const result = stmt.run(userId, recipeId);
  return db.prepare('SELECT * FROM favorites WHERE id = ?').get(result.lastInsertRowid);
}

function removeFavorite(userId, recipeId) {
  const result = db.prepare(
    'DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?'
  ).run(userId, recipeId);
  return result.changes > 0;
}

function getUserFavorites(userId, { page = 1, limit = 10 } = {}) {
  const offset = (page - 1) * limit;

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?'
  ).get(userId).count;

  const favorites = db.prepare(`
    SELECT f.id, f.user_id, f.recipe_id, f.created_at,
           r.title, r.description, r.ingredients, r.steps,
           r.cook_time, r.servings, r.created_at as recipe_created_at
    FROM favorites f
    JOIN recipes r ON f.recipe_id = r.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  return { favorites, total };
}

function isFavorited(userId, recipeId) {
  const row = db.prepare(
    'SELECT 1 FROM favorites WHERE user_id = ? AND recipe_id = ?'
  ).get(userId, recipeId);
  return !!row;
}

module.exports = { addFavorite, removeFavorite, getUserFavorites, isFavorited };
