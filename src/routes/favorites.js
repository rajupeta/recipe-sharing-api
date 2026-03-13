const express = require('express');
const authenticate = require('../middleware/auth');
const { getRecipeById } = require('../models/recipe');
const { addFavorite, removeFavorite, getUserFavorites } = require('../models/favorite');

const router = express.Router();

// POST /api/recipes/:id/favorite
router.post('/recipes/:id/favorite', authenticate, (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    try {
      addFavorite(req.user.id, recipeId);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Recipe already in favorites' });
      }
      throw err;
    }

    return res.status(201).json({ message: 'Recipe added to favorites' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/recipes/:id/favorite
router.delete('/recipes/:id/favorite', authenticate, (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const removed = removeFavorite(req.user.id, recipeId);
    if (!removed) {
      return res.status(404).json({ error: 'Recipe not in favorites' });
    }
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/users/favorites
router.get('/users/favorites', authenticate, (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = getUserFavorites(req.user.id, { page, limit });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
