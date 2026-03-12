const db = require('../db/database');

function getAllCategories() {
  return db.prepare('SELECT * FROM categories').all();
}

function createCategory(name) {
  try {
    const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const result = stmt.run(name);
    return { id: result.lastInsertRowid, name };
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error(`Category with name "${name}" already exists`);
    }
    throw err;
  }
}

function getCategoriesByRecipeId(recipeId) {
  return db.prepare(
    `SELECT c.id, c.name FROM categories c
     INNER JOIN recipe_categories rc ON rc.category_id = c.id
     WHERE rc.recipe_id = ?`
  ).all(recipeId);
}

module.exports = { getAllCategories, createCategory, getCategoriesByRecipeId };
