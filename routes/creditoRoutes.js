const express = require('express');
const router = express.Router();
const creditoController = require('../controllers/creditoController');

// 🔥 IMPORTAMOS EXACTAMENTE LA FUNCIÓN QUE NECESITAMOS 🔥
const { verificarToken } = require('../middlewares/authMiddleware');

// 1. Obtener la cartera del cliente logueado (DEBE IR ANTES DE LAS RUTAS CON :id)
router.get('/mi-cartera', verificarToken, creditoController.obtenerMiCredito);

// 2. Obtener todos los créditos (Para el Admin)
router.get('/', creditoController.obtenerCreditos);

// 3. Crear un nuevo crédito
router.post('/', creditoController.crearCredito);

// 4. Registrar un abono a un crédito específico
router.post('/:id/abono', creditoController.registrarAbono);

// 5. Eliminar un crédito (opcional)
router.delete('/:id', creditoController.eliminarCredito);

module.exports = router;