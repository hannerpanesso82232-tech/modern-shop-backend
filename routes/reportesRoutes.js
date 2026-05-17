const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/analiticas-pos', authMiddleware, reportesController.obtenerMetricasAnaliticas);

module.exports = router;