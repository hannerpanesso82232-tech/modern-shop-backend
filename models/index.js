const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// --- 1. MODELO DE USUARIOS ---
const Usuario = sequelize.define('Usuario', {
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    cedula: { type: DataTypes.STRING(20), unique: true, allowNull: true }, 
    email: { type: DataTypes.STRING(150), allowNull: true },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    rol: { type: DataTypes.ENUM('ADMIN', 'COMPRAS', 'CLIENTE'), defaultValue: 'CLIENTE' },
    telefono: { type: DataTypes.STRING(20) },
    fechaNacimiento: { type: DataTypes.DATEONLY, field: 'fecha_nacimiento' },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    ciudad: { type: DataTypes.STRING(100), allowNull: true }
}, { tableName: 'usuarios', timestamps: false });

// --- 2. MODELO DE CATEGORÍAS ---
const Categoria = sequelize.define('Categoria', {
    nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true }
}, { tableName: 'categorias', timestamps: false });

// --- 3. MODELO DE PRODUCTOS ---
const Producto = sequelize.define('Productos', {
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    descripcion: DataTypes.TEXT,
    precio: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    costo_compra: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }, 
    margen_ganancia: { type: DataTypes.INTEGER, defaultValue: 0 }, 
    stock: { type: DataTypes.INTEGER, defaultValue: 0 },
    tope_stock: { type: DataTypes.INTEGER, defaultValue: 10 }, 
    imagen_url: { type: DataTypes.STRING(255) },
    proveedor: { type: DataTypes.STRING(150), defaultValue: 'No especificado' },
    categoriaId: { type: DataTypes.INTEGER, field: 'categoria_id', allowNull: true }
}, { tableName: 'productos', timestamps: false });

// --- 4. MODELO DE FAVORITOS ---
const Favorito = sequelize.define('Favorito', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    producto_id: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'favoritos', timestamps: false });

// --- 5. MODELO DE PEDIDOS ---
const Pedido = sequelize.define('Pedido', {
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'fecha_pedido' },
    estado: { type: DataTypes.ENUM('Pendiente', 'Aprobado', 'Cancelado', 'Enviado', 'Entregado'), defaultValue: 'Pendiente' },
    total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    ruta: { type: DataTypes.STRING(100), allowNull: true }
}, { tableName: 'pedidos', timestamps: false }); 

// --- 6. MODELO DETALLEPEDIDO ---
const DetallePedido = sequelize.define('DetallePedido', {
    pedidoId: { type: DataTypes.INTEGER, field: 'pedido_id' },
    productoId: { type: DataTypes.INTEGER, field: 'producto_id' },
    cantidad: { type: DataTypes.INTEGER, allowNull: false },
    precioUnitario: { type: DataTypes.DECIMAL(10, 2), field: 'precio_unitario' }
}, { tableName: 'detalles_pedido', timestamps: false });

// --- 7. MODELO DIRECCIONES ---
const Direccion = sequelize.define('Direccion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    etiqueta: { type: DataTypes.STRING(50), allowNull: false }, 
    direccion: { type: DataTypes.TEXT, allowNull: false },
    ciudad: { type: DataTypes.STRING(100), allowNull: false },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' }
}, { tableName: 'direcciones', timestamps: true });

// --- 8. MODELO DE CONFIGURACIONES (WHATSAPP) ---
const Configuracion = sequelize.define('Configuracion', {
    clave: { type: DataTypes.STRING, primaryKey: true },
    valor: { type: DataTypes.STRING }
}, { tableName: 'configuraciones', timestamps: false });

// --- 9. MODELO: CONTABILIDAD (TRANSACCIONES) ---
const Transaccion = sequelize.define('Transaccion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tipo: { type: DataTypes.ENUM('INGRESO', 'EGRESO'), allowNull: false },
    monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: false },
    categoria: { type: DataTypes.STRING(50), defaultValue: 'General' },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    pedidoId: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'transacciones', timestamps: true });

// --- 10. MODELO: RUTAS DINÁMICAS ---
const RutaLogistica = sequelize.define('RutaLogistica', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ciudad: { type: DataTypes.STRING(100), allowNull: false }, 
    dia_ruta: { type: DataTypes.STRING(50), allowNull: false } 
}, { tableName: 'rutas_logisticas', timestamps: false });

// --- 11. 🔥 NUEVO MODELO: CRÉDITO (CARTERA) 🔥 ---
const Credito = sequelize.define('Credito', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    monto_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    saldo: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, // Lo que falta por pagar
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
    estado: { type: DataTypes.ENUM('VIGENTE', 'PAGADO'), defaultValue: 'VIGENTE' },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'creditos', timestamps: true });

// --- 12. 🔥 NUEVO MODELO: ABONOS (PAGOS) 🔥 ---
const Abono = sequelize.define('Abono', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    creditoId: { type: DataTypes.INTEGER, allowNull: false, field: 'credito_id' },
    monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    nota: { type: DataTypes.STRING(255), allowNull: true },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'abonos', timestamps: true });


// --- RELACIONES ---
Usuario.hasMany(Direccion, { foreignKey: 'usuarioId', as: 'Direcciones' });
Direccion.belongsTo(Usuario, { foreignKey: 'usuarioId' });

Categoria.hasMany(Producto, { foreignKey: 'categoriaId', as: 'Productos' });
Producto.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'Categoria' });

Usuario.belongsToMany(Producto, { through: Favorito, foreignKey: 'usuario_id' });
Producto.belongsToMany(Usuario, { through: Favorito, foreignKey: 'producto_id' });
Favorito.belongsTo(Usuario, { foreignKey: 'usuario_id' });
Favorito.belongsTo(Producto, { foreignKey: 'producto_id', as: 'Producto' });
Producto.hasMany(Favorito, { foreignKey: 'producto_id' });

Usuario.hasMany(Pedido, { foreignKey: 'usuarioId', as: 'Pedidos' });
Pedido.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'Usuario' });

Pedido.hasMany(DetallePedido, { foreignKey: 'pedidoId', as: 'Detalles' });
DetallePedido.belongsTo(Pedido, { foreignKey: 'pedidoId' });

Producto.hasMany(DetallePedido, { foreignKey: 'productoId' });
DetallePedido.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });

Pedido.hasOne(Transaccion, { foreignKey: 'pedidoId', as: 'TransaccionContable' });
Transaccion.belongsTo(Pedido, { foreignKey: 'pedidoId' });

// 🔥 RELACIONES DE CARTERA 🔥
Usuario.hasMany(Credito, { foreignKey: 'usuarioId', as: 'Creditos' });
Credito.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'Usuario' });

Credito.hasMany(Abono, { foreignKey: 'creditoId', as: 'Abonos' });
Abono.belongsTo(Credito, { foreignKey: 'creditoId', as: 'Credito' });

module.exports = { 
    sequelize, Usuario, Producto, Pedido, DetallePedido, 
    Categoria, Favorito, Direccion, Configuracion, Transaccion, 
    RutaLogistica, Credito, Abono 
};