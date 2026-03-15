require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http'); 
const { Server } = require('socket.io'); 
const { sequelize } = require('./models');
const multer = require('multer');

const app = express();

const uploadsDir = path.join(__dirname, 'uploads'); 
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Carpeta /uploads creada con éxito en:', uploadsDir);
}

// CORS Configurado para aceptar conexiones desde cualquier Frontend en la web
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
})); 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app); 
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Guardar socket en request y en app para que cualquier controlador pueda usarlo
app.set('socketio', io);
app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/uploads', express.static(uploadsDir));

app.get('/', (req, res) => {
    res.json({ mensaje: "API de Modern Shop funcionando correctamente con Sockets 🚀" });
});

// --- RUTAS DE LA API (Actualizadas para coincidir con tu Frontend) ---
app.use('/auth', require('./routes/authRoutes'));
app.use('/productos', require('./routes/productoRoutes'));
app.use('/pedidos', require('./routes/pedidoRoutes'));
app.use('/categorias', require('./routes/categoriaRoutes'));
app.use('/favoritos', require('./routes/favoritoRoutes'));
app.use('/contabilidad', require('./routes/contabilidadRoutes'));
app.use('/creditos', require('./routes/creditoRoutes'));

// Manejo de errores global
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "El archivo es demasiado grande. Máximo 5MB." });
        }
        return res.status(400).json({ error: err.message });
    }
    
    if (err.message === 'Formato no válido. Solo se permite JPG, PNG y WEBP.') {
        return res.status(400).json({ error: err.message });
    }

    if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ error: "El registro ya existe en la base de datos." });
    }

    console.error("❌ Error interno:", err.stack);
    res.status(500).json({ error: "Error interno del servidor" });
});

// Ruta 404
app.use((req, res) => {
    res.status(404).json({ mensaje: "La ruta solicitada no existe" });
});

// Eventos de Sockets
io.on('connection', (socket) => {
    console.log('🟢 Nuevo cliente conectado al socket:', socket.id);
    socket.on('disconnect', () => {
        console.log('🔴 Cliente desconectado:', socket.id);
    });
});

// 🔥 EL PUERTO DEBE SER DINÁMICO PARA LA NUBE 🔥
const PORT = process.env.PORT || 3000; 

// Iniciar Base de Datos y Servidor
sequelize.sync({ alter: true }) 
    .then(() => {
        console.log('✅ PostgreSQL Conectado y Sincronizado.');
        server.listen(PORT, () => {
            console.log(`🚀 Servidor HTTP y Socket.io corriendo en el puerto: ${PORT}`);
            console.log(`📂 Imágenes sirviéndose desde: ${uploadsDir}`); 
        });
    })
    .catch(err => {
        console.error('❌ Error crítico en la Base de Datos:', err);
        process.exit(1); 
    });