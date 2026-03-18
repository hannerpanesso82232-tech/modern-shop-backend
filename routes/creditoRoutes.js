const express = require('express');
const router = express.Router();
const creditoController = require('../controllers/creditoController');
const authMiddleware = require('../middlewares/authMiddleware'); // 🔥 DESCOMENTADO: Necesario para saber quién está logueado

// 🔥 NUEVO: Obtener la cartera del cliente logueado (DEBE IR ANTES DE LAS RUTAS CON :id) 🔥
router.get('/mi-cartera', authMiddleware, creditoController.obtenerMiCredito);

// Obtener todos los créditos (Para el Admin)
router.get('/', creditoController.obtenerCreditos);

// Crear un nuevo crédito
router.post('/', creditoController.crearCredito);

// Registrar un abono a un crédito específico
router.post('/:id/abono', creditoController.registrarAbono);

// Eliminar un crédito (opcional)
router.delete('/:id', creditoController.eliminarCredito);

module.exports = router;