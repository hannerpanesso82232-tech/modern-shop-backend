const express = require('express');
const router = express.Router();
const proveedorController = require('../controllers/proveedorController');
const authMiddleware = require('../middlewares/authMiddleware');

// Protegemos las rutas para que solo administradores o personal autorizado puedan manejarlos
router.get('/', authMiddleware, proveedorController.obtenerProveedores);
router.post('/', authMiddleware, proveedorController.crearProveedor);
router.put('/:id', authMiddleware, proveedorController.actualizarProveedor);
router.delete('/:id', authMiddleware, proveedorController.eliminarProveedor);

module.exports = router;