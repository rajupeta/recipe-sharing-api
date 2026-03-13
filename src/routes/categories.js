const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const { getAllCategories, createCategory } = require('../models/category');

const router = express.Router();

const categoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
];

router.get('/', (req, res) => {
  const categories = getAllCategories();
  res.json({ categories });
});

router.post('/', authenticate, validate(categoryValidation), (req, res, next) => {
  try {
    const { name } = req.body;
    const category = createCategory(name.trim());
    return res.status(201).json({ category });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    return next(err);
  }
});

module.exports = router;
