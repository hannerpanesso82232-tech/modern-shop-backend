const express = require('express');
const router = express.Router();
const categoriaController = require('../controllers/categoriaController');
const { verificarToken, permitirRoles } = require('../middlewares/authMiddleware');

// @route   GET /api/categorias
// @desc    Obtener todas las categorías (Público para el catálogo)
router.get('/', categoriaController.obtenerCategorias);

// @route   POST /api/categorias
// @desc    Crear una nueva categoría (Solo ADMIN)
router.post('/', 
    verificarToken, 
    permitirRoles('ADMIN'), 
    categoriaController.crearCategoria
);

// @route   PUT /api/categorias/:id
// @desc    Actualizar nombre de categoría (Solo ADMIN)
router.put('/:id', 
    verificarToken, 
    permitirRoles('ADMIN'), 
    categoriaController.actualizarCategoria
);

// @route   DELETE /api/categorias/:id
// @desc    Eliminar categoría (Solo ADMIN)
router.delete('/:id', 
    verificarToken, 
    permitirRoles('ADMIN'), 
    categoriaController.eliminarCategoria
);

module.exports = router;