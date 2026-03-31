const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 🔥 1. IMPORTAMOS AL NUEVO GUARDIÁN 🔥
const { verificarToken, verificarAdmin, verificarAdminOCajero } = require('../middlewares/authMiddleware');

// --- RUTAS PÚBLICAS ---
router.post('/login', authController.login);
router.post('/recuperar-password', authController.recuperarPassword);
router.get('/config/whatsapp', authController.getWhatsapp);

// --- RUTAS DE GESTIÓN ---
router.post('/registro', verificarToken, verificarAdmin, authController.registrar);

// 🔥 2. PERMITIMOS QUE EL CAJERO LEA LA LISTA DE CLIENTES PARA PODER FIAR 🔥
router.get('/admin/usuarios', verificarToken, verificarAdminOCajero, authController.getUsuarios);

// Las siguientes acciones críticas siguen siendo estrictamente para el ADMIN
router.put('/admin/usuarios/:id', verificarToken, verificarAdmin, authController.actualizarUsuarioPorAdmin); 
router.put('/admin/usuarios/:id/password', verificarToken, verificarAdmin, authController.resetPassword);
router.delete('/admin/usuarios/:id', verificarToken, verificarAdmin, authController.eliminarUsuario);
router.put('/config/whatsapp', verificarToken, verificarAdmin, authController.updateWhatsapp);

// --- RUTAS DE CLIENTE LOGUEADO ---
router.put('/perfil', verificarToken, authController.actualizarPerfil);
router.get('/direcciones', verificarToken, authController.getDirecciones);
router.post('/direcciones', verificarToken, authController.addDireccion);
router.delete('/direcciones/:id', verificarToken, authController.deleteDireccion);

module.exports = router;