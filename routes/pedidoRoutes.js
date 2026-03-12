const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
const { verificarToken, verificarAdmin } = require('../middlewares/authMiddleware');

router.post('/', verificarToken, pedidoController.crearPedido);
router.get('/mis-pedidos', verificarToken, pedidoController.obtenerMisPedidos);
router.put('/:id/cancelar', verificarToken, pedidoController.cancelarPedidoCliente);

router.get('/admin/todos', verificarToken, verificarAdmin, pedidoController.listarTodosLosPedidos);
router.put('/:id/estado', verificarToken, verificarAdmin, pedidoController.actualizarEstadoPedido);
router.put('/:id/ruta', verificarToken, verificarAdmin, pedidoController.actualizarRutaPedido);
router.put('/:id/devolucion', verificarToken, verificarAdmin, pedidoController.procesarDevolucion);

//RUTAS DE CONFIGURACIÓN LOGÍSTICA
router.get('/config/rutas', verificarToken, pedidoController.obtenerRutasLogistica);
router.post('/config/rutas', verificarToken, verificarAdmin, pedidoController.agregarRutaLogistica);
router.delete('/config/rutas/:id', verificarToken, verificarAdmin, pedidoController.eliminarRutaLogistica);
router.get('/config/horalimite', pedidoController.obtenerHoraLimite);
router.put('/config/horalimite', verificarToken, verificarAdmin, pedidoController.actualizarHoraLimite);

module.exports = router;