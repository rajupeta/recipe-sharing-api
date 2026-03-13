const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const { getAllTags, createTag } = require('../models/tag');

const router = express.Router();

const tagValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 30 }).withMessage('Name must be between 2 and 30 characters'),
];

router.get('/', (req, res) => {
  const tags = getAllTags();
  res.json({ tags });
});

router.post('/', authenticate, validate(tagValidation), (req, res, next) => {
  try {
    const { name } = req.body;
    const tag = createTag(name.trim());
    return res.status(201).json({ tag });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Tag name already exists' });
    }
    return next(err);
  }
});

module.exports = router;
