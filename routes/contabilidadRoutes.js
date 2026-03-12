const express = require('express');
const router = express.Router();
const contabilidadController = require('../controllers/contabilidadController');
const { verificarToken, verificarAdmin } = require('../middlewares/authMiddleware');

// Todas las rutas contables son estrictamente para el Administrador
router.get('/resumen', verificarToken, verificarAdmin, contabilidadController.obtenerResumen);
router.get('/transacciones', verificarToken, verificarAdmin, contabilidadController.obtenerTransacciones);
router.post('/gasto', verificarToken, verificarAdmin, contabilidadController.registrarGasto);

// 🔥 NUEVAS RUTAS PARA EDITAR Y ELIMINAR TRANSACCIONES 🔥
router.put('/transacciones/:id', verificarToken, verificarAdmin, contabilidadController.actualizarTransaccion);
router.delete('/transacciones/:id', verificarToken, verificarAdmin, contabilidadController.eliminarTransaccion);

module.exports = router;