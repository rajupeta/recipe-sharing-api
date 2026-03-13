const db = require('../db/database');

function createRecipe({ userId, title, description, ingredients, steps, cookTime, servings, categoryIds, tagIds }) {
  const insertRecipe = db.prepare(
    `INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const insertRecipeCategory = db.prepare(
    'INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)'
  );

  const insertRecipeTag = db.prepare(
    'INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)'
  );

  const transaction = db.transaction(() => {
    const result = insertRecipe.run(
      userId, title, description || '', ingredients, steps, cookTime || null, servings || null
    );
    const recipeId = result.lastInsertRowid;

    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        insertRecipeCategory.run(recipeId, categoryId);
      }
    }

    if (tagIds && tagIds.length > 0) {
      for (const tagId of tagIds) {
        insertRecipeTag.run(recipeId, tagId);
      }
    }

    return recipeId;
  });

  const recipeId = transaction();
  return getRecipeById(recipeId);
}

function updateRecipe(id, { title, description, ingredients, steps, cookTime, servings, categoryIds, tagIds }) {
  const updateStmt = db.prepare(
    `UPDATE recipes SET title = ?, description = ?, ingredients = ?, steps = ?,
     cook_time = ?, servings = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  const deleteCats = db.prepare('DELETE FROM recipe_categories WHERE recipe_id = ?');
  const deleteTags = db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?');
  const insertCat = db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)');
  const insertTag = db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');

  const transaction = db.transaction(() => {
    updateStmt.run(title, description || '', ingredients, steps, cookTime || null, servings || null, id);

    if (categoryIds !== undefined) {
      deleteCats.run(id);
      if (categoryIds && categoryIds.length > 0) {
        for (const catId of categoryIds) {
          insertCat.run(id, catId);
        }
      }
    }

    if (tagIds !== undefined) {
      deleteTags.run(id);
      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          insertTag.run(id, tagId);
        }
      }
    }
  });

  transaction();
  return getRecipeById(id);
}

function getRecipeById(id) {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!recipe) return null;

  const categories = db.prepare(
    `SELECT c.* FROM categories c
     INNER JOIN recipe_categories rc ON rc.category_id = c.id
     WHERE rc.recipe_id = ?`
  ).all(id);

  const tags = db.prepare(
    `SELECT t.* FROM tags t
     INNER JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = ?`
  ).all(id);

  return { ...recipe, categories, tags };
}

function getRecipesByUserId(userId) {
  return db.prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function deleteRecipe(id) {
  return db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
}

module.exports = { createRecipe, updateRecipe, getRecipeById, getRecipesByUserId, deleteRecipe };
