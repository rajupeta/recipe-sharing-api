const db = require('../db/database');

function createReview({ userId, recipeId, rating, comment = '' }) {
  const stmt = db.prepare(
    'INSERT INTO reviews (user_id, recipe_id, rating, comment) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(userId, recipeId, rating, comment);
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);
}

function getRecipeReviews(recipeId, { page = 1, limit = 10 } = {}) {
  const offset = (page - 1) * limit;

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM reviews WHERE recipe_id = ?'
  ).get(recipeId).count;

  const reviews = db.prepare(`
    SELECT r.id, r.user_id, r.recipe_id, r.rating, r.comment, r.created_at,
           u.username
    FROM reviews r
    JOIN users u ON r.user_id = u.id
    WHERE r.recipe_id = ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(recipeId, limit, offset);

  return { reviews, total };
}

function getAverageRating(recipeId) {
  const row = db.prepare(
    'SELECT AVG(rating) as avg_rating FROM reviews WHERE recipe_id = ?'
  ).get(recipeId);
  return row.avg_rating !== null ? Number(row.avg_rating) : null;
}

module.exports = { createReview, getRecipeReviews, getAverageRating };
