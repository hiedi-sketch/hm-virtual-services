const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use('/auth', require('./auth'));

// Everything past this point needs a signed-in shop account.
router.use(authenticateToken);
router.use('/settings', require('./settings'));
router.use('/filaments', require('./filaments'));
router.use('/materials', require('./materials'));
router.use('/catalog', require('./catalog').router);
router.use('/orders', require('./orders'));
router.use('/queue', require('./queue'));
router.use('/scan', require('./scan'));
router.use('/dashboard', require('./dashboard'));
router.use('/backup', require('./backup'));

module.exports = router;
