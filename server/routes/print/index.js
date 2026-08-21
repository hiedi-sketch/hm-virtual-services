const express = require('express');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// The print shop is Hiedi's own business, so the whole surface is admin-only.
router.use(authenticateToken, requireAdmin);

router.use('/settings', require('./settings'));
router.use('/filaments', require('./filaments'));
router.use('/materials', require('./materials'));
router.use('/catalog', require('./catalog').router);
router.use('/orders', require('./orders'));
router.use('/queue', require('./queue'));
router.use('/scan', require('./scan'));
router.use('/dashboard', require('./dashboard'));

module.exports = router;
