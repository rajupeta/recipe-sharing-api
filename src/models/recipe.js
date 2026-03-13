const db = require('../db/database');

function getRecipeById(id) {
  return db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
}

module.exports = { getRecipeById };
