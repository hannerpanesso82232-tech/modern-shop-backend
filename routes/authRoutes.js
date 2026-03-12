const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verificarToken, verificarAdmin } = require('../middlewares/authMiddleware');

// --- RUTAS PÚBLICAS ---
router.post('/login', authController.login);
router.post('/recuperar-password', authController.recuperarPassword);
router.get('/config/whatsapp', authController.getWhatsapp);

// --- RUTAS DE GESTIÓN (SOLO ADMINISTRADOR) ---
router.post('/registro', authController.registrar);
router.get('/admin/usuarios', verificarToken, verificarAdmin, authController.getUsuarios);
router.put('/admin/usuarios/:id', verificarToken, verificarAdmin, authController.actualizarUsuarioPorAdmin); // 🔥 NUEVA RUTA PARA EDITAR TODA LA INFO
router.put('/admin/usuarios/:id/password', verificarToken, verificarAdmin, authController.resetPassword);
router.delete('/admin/usuarios/:id', verificarToken, verificarAdmin, authController.eliminarUsuario);
router.put('/config/whatsapp', verificarToken, verificarAdmin, authController.updateWhatsapp);

// --- RUTAS DE CLIENTE LOGUEADO ---
router.put('/perfil', verificarToken, authController.actualizarPerfil);
router.get('/direcciones', verificarToken, authController.getDirecciones);
router.post('/direcciones', verificarToken, authController.addDireccion);
router.delete('/direcciones/:id', verificarToken, authController.deleteDireccion);

module.exports = router;