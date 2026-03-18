const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // 1. Verificar si existe el header y si empieza con "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ mensaje: "Token requerido o formato inválido" });
    }

    // 2. Extraer el token
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // CORRECCIÓN CLAVE: 
        // Cambiamos 'req.usuario' a 'req.user' para que coincida con tu pedidocontroller.js
        req.user = decoded; 
        
        next();
    } catch (error) {
        console.error("Error al verificar token:", error.message);
        return res.status(401).json({ mensaje: "Token inválido o expirado" });
    }
};

const permitirRoles = (...roles) => {
    return (req, res, next) => {
        // Verificamos req.user (antes era usuario)
        if (!req.user || !roles.includes(req.user.rol)) {
            return res.status(403).json({ mensaje: "Acceso denegado: Permisos insuficientes" });
        }
        next();
    };
};

// 🔥 NUEVO: Función específica para verificar si es Admin 🔥
const verificarAdmin = (req, res, next) => {
    if (!req.user || req.user.rol !== 'ADMIN') {
        return res.status(403).json({ error: "Acceso denegado. Se requieren permisos de Administrador." });
    }
    next();
};

// 🔥 TRUCO MAGISTRAL DE EXPORTACIÓN 🔥
// Exportamos verificarToken como la función por defecto. Así, si usas "authMiddleware" directo, funciona.
module.exports = verificarToken;
// Y adjuntamos las otras por si en alguna ruta necesitas destructurar { verificarAdmin }
module.exports.permitirRoles = permitirRoles;
module.exports.verificarAdmin = verificarAdmin;