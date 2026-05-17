const express = require('express');
const router = express.Router();
const kardexController = require('../controllers/kardexController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/movimiento', authMiddleware, kardexController.registrarMovimiento);
router.get('/historial', authMiddleware, kardexController.obtenerHistorialKardex);

module.exports = router;