const redis = require('redis');

// Creamos el cliente de Redis con la URL de producción o la local
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis no responde. Alcanzó el límite de reintentos.');
            return Math.min(retries * 100, 3000); // Intenta reconectar progresivamente
        }
    }
});

redisClient.on('error', (err) => console.log('❌ Error en Redis:', err.message));
redisClient.on('connect', () => console.log('⚡ Conectado a la memoria caché de Redis'));

// Conectamos de forma asíncrona
(async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.log('⚠️ Advertencia: No se pudo conectar a Redis al inicio. Reintentando en background...');
    }
})();

module.exports = redisClient;