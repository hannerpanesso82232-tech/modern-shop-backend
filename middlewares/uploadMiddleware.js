const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'proyecto_catalogo', // Cloudinary creará esta carpeta automáticamente
        allowed_formats: ['jpeg', 'jpg', 'png', 'webp'],
        // Opcional: Puedes forzar un tamaño máximo de imagen aquí si quieres
        // transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
});

module.exports = upload;