const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
// 🔥 Importamos al nuevo guardián 🔥
const { verificarToken, verificarAdmin, verificarAdminOCajero } = require('../middlewares/authMiddleware');

router.post('/', verificarToken, pedidoController.crearPedido);
router.get('/mis-pedidos', verificarToken, pedidoController.obtenerMisPedidos);
router.put('/:id/cancelar', verificarToken, pedidoController.cancelarPedidoCliente);

// 🔥 El cajero necesita cargar los pedidos al abrir el panel y actualizarlos a 'Entregado' 🔥
router.get('/admin/todos', verificarToken, verificarAdminOCajero, pedidoController.listarTodosLosPedidos);
router.put('/:id/estado', verificarToken, verificarAdminOCajero, pedidoController.actualizarEstadoPedido);

router.put('/:id/ruta', verificarToken, verificarAdmin, pedidoController.actualizarRutaPedido);
router.put('/:id/devolucion', verificarToken, verificarAdmin, pedidoController.procesarDevolucion);

//RUTAS DE CONFIGURACIÓN LOGÍSTICA
router.get('/config/rutas', verificarToken, pedidoController.obtenerRutasLogistica);
router.post('/config/rutas', verificarToken, verificarAdmin, pedidoController.agregarRutaLogistica);
router.delete('/config/rutas/:id', verificarToken, verificarAdmin, pedidoController.eliminarRutaLogistica);
router.get('/config/horalimite', pedidoController.obtenerHoraLimite);
router.put('/config/horalimite', verificarToken, verificarAdmin, pedidoController.actualizarHoraLimite);

module.exports = router;