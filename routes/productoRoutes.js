const express = require('express');
const router = express.Router();
const productoController = require('../controllers/productoController');
const upload = require('../middlewares/uploadMiddleware');
const { verificarToken, permitirRoles } = require('../middlewares/authMiddleware');

/**
 * @route   GET /api/productos
 * @desc    Obtener todos los productos (Catálogo)
 * @access  Público
 */
router.get('/', productoController.obtenerProductos);

/**
 * @route   POST /api/productos
 * @desc    Crear un nuevo producto con imagen
 * @access  Privado (Solo ADMIN)
 */
router.post('/', 
    verificarToken, 
    permitirRoles('ADMIN'), 
    upload.single('imagen'), 
    productoController.crearProducto 
);

/**
 * @route   PUT /api/productos/:id/stock
 * @desc    Actualizar SOLO el stock (Usado para el Manifiesto de Carga)
 * @access  Privado (Solo ADMIN)
 */
router.put('/:id/stock',
    verificarToken,
    permitirRoles('ADMIN'),
    productoController.actualizarStockManualmente
);

/**
 * @route   PUT /api/productos/:id
 * @desc    Actualizar información, stock o imagen de un producto
 * @access  Privado (Solo ADMIN)
 */
router.put('/:id', 
    verificarToken, 
    permitirRoles('ADMIN'), 
    upload.single('imagen'), 
    productoController.actualizarProducto
);

/**
 * @route   DELETE /api/productos/:id
 * @desc    Eliminar un producto y su archivo de imagen
 * @access  Privado (Solo ADMIN)
 */
router.delete('/:id', 
    verificarToken, 
    permitirRoles('ADMIN'), 
    productoController.eliminarProducto
);

module.exports = router;