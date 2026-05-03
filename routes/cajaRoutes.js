const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/cajaController');

router.get('/activa', cajaController.obtenerCajaActiva);
router.post('/abrir', cajaController.abrirCaja);
router.put('/cerrar/:id', cajaController.cerrarCaja);
router.get('/historial', cajaController.historialCierres);

module.exports = router;