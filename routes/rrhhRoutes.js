const express = require('express');
const router = express.Router();
const rrhhController = require('../controllers/rrhhController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/empleados', authMiddleware, rrhhController.obtenerEmpleados);
router.post('/empleados', authMiddleware, rrhhController.crearEmpleado);
router.post('/reloj', authMiddleware, rrhhController.registrarAsistencia);
router.get('/asistencias', authMiddleware, rrhhController.obtenerAsistencias);

module.exports = router;