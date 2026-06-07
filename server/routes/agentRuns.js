'use strict';

const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { runAgent } = require('../agents/runEngine');

const router = express.Router();
router.use(authenticateToken);

// POST /api/agents/run/:id
router.post('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { triggerType = 'manual', input = {} } = req.body;

  const result = await runAgent(id, triggerType, input);
  res.status(result.success ? 200 : 500).json(result);
});

module.exports = router;
