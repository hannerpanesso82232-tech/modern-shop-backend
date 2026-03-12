const express = require('express');
const router = express.Router();
const favoritoCtrl = require('../controllers/favoritoController');
const { verificarToken } = require('../middlewares/authMiddleware');

// Todas las rutas de favoritos requieren que el usuario esté logueado
router.use(verificarToken);

// Obtener la lista de productos favoritos del usuario
// GET /api/favoritos
router.get('/', favoritoCtrl.obtenerFavoritos);

// Agregar o quitar un producto de favoritos (Toggle)
// POST /api/favoritos/toggle
router.post('/toggle', favoritoCtrl.toggleFavorito);

module.exports = router;