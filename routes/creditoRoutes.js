const express = require('express');
const router = express.Router();
const creditoController = require('../controllers/creditoController');
// const authMiddleware = require('../middlewares/authMiddleware'); // Opcional: proteger rutas

// Obtener todos los créditos
router.get('/', creditoController.obtenerCreditos);

// Crear un nuevo crédito
router.post('/', creditoController.crearCredito);

// Registrar un abono a un crédito específico
router.post('/:id/abono', creditoController.registrarAbono);

// Eliminar un crédito (opcional)
router.delete('/:id', creditoController.eliminarCredito);

module.exports = router;