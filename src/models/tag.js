const db = require('../db/database');

function getAllTags() {
  return db.prepare('SELECT * FROM tags').all();
}

function createTag(name) {
  try {
    const stmt = db.prepare('INSERT INTO tags (name) VALUES (?)');
    const result = stmt.run(name);
    return { id: result.lastInsertRowid, name };
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error(`Tag with name "${name}" already exists`);
    }
    throw err;
  }
}

function getTagsByRecipeId(recipeId) {
  return db.prepare(
    `SELECT t.id, t.name FROM tags t
     INNER JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = ?`
  ).all(recipeId);
}

module.exports = { getAllTags, createTag, getTagsByRecipeId };
