const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        
        // SEGURIDAD: Verificamos si la carpeta existe aquí también
        // para evitar errores de "Directory not found"
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        cb(null, dir); 
    },
    filename: (req, file, cb) => {
        // Limpiamos el nombre original: quitamos espacios y caracteres especiales
        const name = path.parse(file.originalname).name
            .replace(/\s+/g, '_')
            .replace(/[^\w-]/g, '') // Elimina símbolos extraños
            .toLowerCase();
            
        // Nombre único: timestamp-random-nombre.extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E4);
        const extension = path.extname(file.originalname).toLowerCase();
        
        cb(null, `${uniqueSuffix}-${name}${extension}`);
    }
});

// Filtro de seguridad mejorado
const fileFilter = (req, file, cb) => {
    // Definimos tipos permitidos
    const allowedMimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedMimetypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        // Creamos un error capturable por el middleware de errores global
        const error = new Error('Formato no válido. Solo se permite JPG, PNG y WEBP.');
        error.code = 'LIMIT_FILE_TYPES';
        cb(error, false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { 
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

module.exports = upload;