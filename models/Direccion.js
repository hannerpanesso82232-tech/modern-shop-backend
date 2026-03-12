const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Tu conexión a la DB

const Direccion = sequelize.define('Direccion', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    etiqueta: {
        type: DataTypes.STRING, // "Casa", "Oficina", etc.
        allowNull: false
    },
    direccion: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ciudad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Usuarios', // Nombre de tu tabla de usuarios
            key: 'id'
        }
    }
}, {
    tableName: 'direcciones',
    timestamps: true
});

module.exports = Direccion;