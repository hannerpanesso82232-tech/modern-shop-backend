const express = require('express');
const router = express.Router();
const sucursalController = require('../controllers/sucursalController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, sucursalController.crearSucursal);
router.get('/', authMiddleware, sucursalController.listarSucursales);
router.post('/transferir', authMiddleware, sucursalController.transferirInventario);
router.get('/:id/inventario', authMiddleware, sucursalController.obtenerInventarioSucursal);

module.exports = router;