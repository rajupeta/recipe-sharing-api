const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const { createRecipe, updateRecipe, getRecipeById, deleteRecipe } = require('../models/recipe');

const router = express.Router();

const recipeValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required'),
  body('ingredients')
    .notEmpty().withMessage('Ingredients are required'),
  body('steps')
    .notEmpty().withMessage('Steps are required'),
  body('category_ids')
    .optional()
    .isArray().withMessage('category_ids must be an array'),
  body('category_ids.*')
    .optional()
    .isInt({ min: 1 }).withMessage('Each category_id must be a positive integer'),
  body('tag_ids')
    .optional()
    .isArray().withMessage('tag_ids must be an array'),
  body('tag_ids.*')
    .optional()
    .isInt({ min: 1 }).withMessage('Each tag_id must be a positive integer'),
];

router.post('/', authenticate, validate(recipeValidation), (req, res, next) => {
  try {
    const { title, description, ingredients, steps, cook_time, servings, category_ids, tag_ids } = req.body;
    const recipe = createRecipe({
      userId: req.user.id,
      title: title.trim(),
      description,
      ingredients,
      steps,
      cookTime: cook_time,
      servings,
      categoryIds: category_ids,
      tagIds: tag_ids,
    });
    return res.status(201).json({ recipe });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', (req, res) => {
  const recipe = getRecipeById(parseInt(req.params.id, 10));
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }
  return res.json({ recipe });
});

router.put('/:id', authenticate, validate(recipeValidation), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = getRecipeById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this recipe' });
    }

    const { title, description, ingredients, steps, cook_time, servings, category_ids, tag_ids } = req.body;
    const recipe = updateRecipe(id, {
      title: title.trim(),
      description,
      ingredients,
      steps,
      cookTime: cook_time,
      servings,
      categoryIds: category_ids,
      tagIds: tag_ids,
    });
    return res.json({ recipe });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getRecipeById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Recipe not found' });
  }
  if (existing.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to delete this recipe' });
  }
  deleteRecipe(id);
  return res.status(204).send();
});

module.exports = router;
