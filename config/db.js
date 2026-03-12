const { Sequelize } = require('sequelize');
require('dotenv').config();

// Verificamos si estamos usando una URL directa (común en servidores de producción como Render o Neon)
// Si no existe DATABASE_URL, usamos las credenciales individuales como fallback (para desarrollo local)
const sequelize = process.env.DATABASE_URL 
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            // 🔥 OBLIGATORIO PARA BASES DE DATOS GRATUITAS EN LA NUBE 🔥
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        },
        pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    })
    : new Sequelize(
        process.env.DB_NAME, 
        process.env.DB_USER, 
        process.env.DB_PASS, 
        {
            host: process.env.DB_HOST,
            dialect: 'postgres',
            logging: false,
            pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
        }
    );

module.exports = sequelize;