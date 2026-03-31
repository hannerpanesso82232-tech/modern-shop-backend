const express = require('express');
const router = express.Router();
const contabilidadController = require('../controllers/contabilidadController');
// 🔥 Importamos al nuevo guardián 🔥
const { verificarToken, verificarAdmin, verificarAdminOCajero } = require('../middlewares/authMiddleware');

// 🔥 Permisos compartidos para que la App no explote al iniciar ni al cobrar en efectivo 🔥
router.get('/resumen', verificarToken, verificarAdminOCajero, contabilidadController.obtenerResumen);
router.get('/transacciones', verificarToken, verificarAdminOCajero, contabilidadController.obtenerTransacciones);
router.post('/gasto', verificarToken, verificarAdminOCajero, contabilidadController.registrarGasto);

// 🔥 NUEVAS RUTAS PARA EDITAR Y ELIMINAR TRANSACCIONES (Solo Admin) 🔥
router.put('/transacciones/:id', verificarToken, verificarAdmin, contabilidadController.actualizarTransaccion);
router.delete('/transacciones/:id', verificarToken, verificarAdmin, contabilidadController.eliminarTransaccion);

module.exports = router;