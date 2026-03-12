const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validate = require('../middleware/validate');
const { createUser, findByEmail, findByUsername } = require('../models/user');

const router = express.Router();

const registerValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters')
    .isAlphanumeric().withMessage('Username must contain only letters and numbers'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

router.post('/register', validate(registerValidation), async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const existingEmail = findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const existingUsername = findByUsername(username);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    try {
      user = createUser({ username, email, passwordHash });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        if (err.message.includes('users.email')) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        if (err.message.includes('users.username')) {
          return res.status(409).json({ error: 'Username already taken' });
        }
      }
      throw err;
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '7d',
    });

    return res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
