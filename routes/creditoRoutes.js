const express = require('express');
const router = express.Router();
const creditoController = require('../controllers/creditoController');
const authMiddleware = require('../middlewares/authMiddleware'); // Traemos el verificador de sesión

// 🔥 1. LA RUTA DEL CLIENTE DEBE IR PRIMERO 🔥
router.get('/mi-cartera', authMiddleware, creditoController.obtenerMiCredito);

// 2. Obtener todos los créditos (Para el Admin)
router.get('/', creditoController.obtenerCreditos);

// 3. Crear un nuevo crédito
router.post('/', creditoController.crearCredito);

// 4. Registrar un abono a un crédito específico
router.post('/:id/abono', creditoController.registrarAbono);

// 5. Eliminar un crédito
router.delete('/:id', creditoController.eliminarCredito);

module.exports = router;