const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ mensaje: "Token requerido o formato inválido" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (error) {
        console.error("Error al verificar token:", error.message);
        return res.status(401).json({ mensaje: "Token inválido o expirado" });
    }
};

const permitirRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.rol)) {
            return res.status(403).json({ mensaje: "Acceso denegado: Permisos insuficientes" });
        }
        next();
    };
};

const verificarAdmin = (req, res, next) => {
    if (!req.user || req.user.rol !== 'ADMIN') {
        return res.status(403).json({ error: "Acceso denegado. Se requieren permisos de Administrador." });
    }
    next();
};

// 🔥 LA SOLUCIÓN DEFINITIVA A LOS CRASHEOS DE RENDER 🔥
// Exportamos la función principal para que no se rompan las rutas viejas
module.exports = verificarToken;
// Y adjuntamos las propiedades para que las rutas nuevas (como la de créditos) funcionen perfecto
module.exports.verificarToken = verificarToken;
module.exports.permitirRoles = permitirRoles;
module.exports.verificarAdmin = verificarAdmin;