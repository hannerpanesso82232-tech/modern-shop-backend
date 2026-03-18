const express = require('express');
const router = express.Router();
const creditoController = require('../controllers/creditoController');

// 🔥 IMPORTAMOS EXACTAMENTE LA FUNCIÓN QUE NECESITAMOS 🔥
const { verificarToken } = require('../middlewares/authMiddleware');

// 1. Obtener la cartera del cliente logueado (DEBE IR ANTES DE LAS RUTAS CON :id)
router.get('/mi-cartera', verificarToken, creditoController.obtenerMiCredito);

// 2. SUSPENDER/ACTIVAR CRÉDITO 🔥
router.put('/usuarios/:id/toggle-credito', verificarToken, creditoController.toggleCreditoUsuario);

// 3. Obtener todos los créditos (Para el Admin)
router.get('/', creditoController.obtenerCreditos);

// 4. Crear un nuevo crédito
router.post('/', creditoController.crearCredito);

// 5. Registrar un abono a un crédito específico
router.post('/:id/abono', creditoController.registrarAbono);

// 6. Eliminar un crédito (opcional)
router.delete('/:id', creditoController.eliminarCredito);

module.exports = router;