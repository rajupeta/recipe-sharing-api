const db = require('../db/database');

function addFavorite(userId, recipeId) {
  const stmt = db.prepare(
    'INSERT INTO favorites (user_id, recipe_id) VALUES (?, ?)'
  );
  return stmt.run(userId, recipeId);
}

function removeFavorite(userId, recipeId) {
  const stmt = db.prepare(
    'DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?'
  );
  const result = stmt.run(userId, recipeId);
  return result.changes > 0;
}

function getUserFavorites(userId, { page = 1, limit = 10 } = {}) {
  const offset = (page - 1) * limit;

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?'
  ).get(userId).count;

  const recipes = db.prepare(`
    SELECT r.* FROM recipes r
    INNER JOIN favorites f ON f.recipe_id = r.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  return {
    recipes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = { addFavorite, removeFavorite, getUserFavorites };
