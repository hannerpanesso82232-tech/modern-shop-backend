const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// --- 1. MODELO DE USUARIOS ---
const Usuario = sequelize.define('Usuario', {
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    cedula: { type: DataTypes.STRING(20), unique: true, allowNull: true }, 
    email: { type: DataTypes.STRING(150), allowNull: true },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    rol: { type: DataTypes.ENUM('ADMIN', 'COMPRAS', 'CLIENTE','CAJERO'), defaultValue: 'CLIENTE' },
    telefono: { type: DataTypes.STRING(20) },
    fechaNacimiento: { type: DataTypes.DATEONLY, field: 'fecha_nacimiento' },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    ciudad: { type: DataTypes.STRING(100), allowNull: true },
    limite_credito: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }, 
    dias_credito: { type: DataTypes.INTEGER, defaultValue: 30 },
    credito_activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: true } // 🔥 NUEVO: Para saber a qué sucursal pertenece un Cajero
}, { tableName: 'usuarios', timestamps: false });

// --- 2. MODELO DE CATEGORÍAS ---
const Categoria = sequelize.define('Categoria', {
    nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true }
}, { tableName: 'categorias', timestamps: false });

// --- 3. MODELO DE PRODUCTOS (Este será el inventario GLOBAL/Central) ---
const Producto = sequelize.define('Productos', {
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    descripcion: DataTypes.TEXT,
    precio: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, 
    costo_compra: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }, 
    margen_ganancia: { type: DataTypes.INTEGER, defaultValue: 0 }, 
    stock: { type: DataTypes.INTEGER, defaultValue: 0 }, // Stock Total de la empresa
    tope_stock: { type: DataTypes.INTEGER, defaultValue: 10 }, 
    imagen_url: { type: DataTypes.STRING(255) },
    proveedor: { type: DataTypes.STRING(150), defaultValue: 'No especificado' },
    categoriaId: { type: DataTypes.INTEGER, field: 'categoria_id', allowNull: true },
    precio_mayor: { type: DataTypes.DECIMAL(10, 2), allowNull: true }, 
    cantidad_mayor: { type: DataTypes.INTEGER, defaultValue: 0 }, 
    codigo_barras: { type: DataTypes.TEXT, allowNull: true } 
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
    ruta: { type: DataTypes.STRING(100), allowNull: true },
    metodo_pago: { type: DataTypes.STRING(50), defaultValue: 'CONTADO' },
    cancelado_por: { type: DataTypes.STRING(20), allowNull: true }
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

// --- 8. MODELO DE CONFIGURACIONES ---
const Configuracion = sequelize.define('Configuracion', {
    clave: { type: DataTypes.STRING, primaryKey: true },
    valor: { type: DataTypes.STRING }
}, { tableName: 'configuraciones', timestamps: false });

// --- 9. MODELO: CONTABILIDAD ---
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

// --- 11. MODELO: CRÉDITO (CARTERA) ---
const Credito = sequelize.define('Credito', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    monto_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    saldo: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    descripcion: { type: DataTypes.STRING(255), allowNull: true },
    estado: { type: DataTypes.ENUM('VIGENTE', 'PAGADO'), defaultValue: 'VIGENTE' },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fecha_vencimiento: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'creditos', timestamps: true });

// --- 12. MODELO: ABONOS (PAGOS) ---
const Abono = sequelize.define('Abono', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    creditoId: { type: DataTypes.INTEGER, allowNull: false, field: 'credito_id' },
    monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    nota: { type: DataTypes.STRING(255), allowNull: true },
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'abonos', timestamps: true });

// --- 13. MODELO: PROVEEDORES ---
const Proveedor = sequelize.define('Proveedor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    contacto: { type: DataTypes.STRING(150), allowNull: true },
    telefono: { type: DataTypes.STRING(50), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    direccion: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'proveedores', timestamps: true });

// --- 14. MODELO: SESIONES DE CAJA 🔥 ---
const SesionCaja = sequelize.define('SesionCaja', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' }, // El Cajero
    fecha_apertura: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fecha_cierre: { type: DataTypes.DATE, allowNull: true },
    saldo_inicial: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    ingresos_efectivo: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    ingresos_transferencia: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    egresos_efectivo: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    efectivo_esperado: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }, // Lo que calculó el sistema
    efectivo_declarado: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, // Lo que contó el cajero físico
    descuadre: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, // Diferencia (Sobrante o Faltante)
    observaciones: { type: DataTypes.TEXT, allowNull: true },
    estado: { type: DataTypes.ENUM('ABIERTA', 'CERRADA'), defaultValue: 'ABIERTA' }
}, { tableName: 'sesiones_caja', timestamps: true });

// 🔥 15. MODELO KARDEX VALORIZADO MULTISUCURSAL (ACTUALIZADO) 🔥
const MovimientoKardex = sequelize.define('MovimientoKardex', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productoId: { type: DataTypes.INTEGER, allowNull: false, field: 'producto_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: true, field: 'usuario_id' },
    tipo: { type: DataTypes.ENUM('ENTRADA', 'SALIDA', 'TRASLADO', 'AJUSTE', 'DEVOLUCION'), allowNull: false },
    cantidad: { type: DataTypes.INTEGER, allowNull: false }, 
    costo_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, // Costo real de la factura
    valor_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    stock_anterior: { type: DataTypes.INTEGER, defaultValue: 0 }, // 🔥 NUEVO: Memoria del stock antes del mov.
    costo_anterior: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }, // 🔥 NUEVO: Memoria del costo antes del mov.
    saldo_stock_momento: { type: DataTypes.INTEGER, allowNull: false }, 
    saldo_costo_promedio: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, 
    sucursal_origen: { type: DataTypes.STRING(100), defaultValue: 'Principal' },
    sucursal_destino: { type: DataTypes.STRING(100), defaultValue: 'Principal' },
    referencia: { type: DataTypes.STRING(255), allowNull: true }, 
    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'movimientos_kardex', timestamps: true });

// --- 16. MODELO RRHH: EMPLEADOS (NUEVO) 🔥 ---
const Empleado = sequelize.define('Empleado', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    documento: { type: DataTypes.STRING(50), unique: true, allowNull: false },
    cargo: { type: DataTypes.STRING(100), allowNull: false },
    salario_base: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    tipo_contrato: { type: DataTypes.STRING(50), defaultValue: 'Fijo' },
    fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: true },
    telefono: { type: DataTypes.STRING(50), allowNull: true },
    estado: { type: DataTypes.ENUM('ACTIVO', 'INACTIVO', 'VACACIONES', 'PERMISO'), defaultValue: 'ACTIVO' }
}, { tableName: 'empleados', timestamps: true });

// --- 17. MODELO RRHH: ASISTENCIAS (NUEVO) 🔥 ---
const Asistencia = sequelize.define('Asistencia', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    empleadoId: { type: DataTypes.INTEGER, allowNull: false, field: 'empleado_id' },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    hora_entrada: { type: DataTypes.TIME, allowNull: true },
    hora_salida: { type: DataTypes.TIME, allowNull: true },
    horas_trabajadas: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    novedad: { type: DataTypes.STRING(255), allowNull: true } // Ej: "Llegó tarde", "Falta injustificada"
}, { tableName: 'asistencias', timestamps: true });

// 🔥 18. MODELO: SUCURSALES (TIENDAS) 🔥
const Sucursal = sequelize.define('Sucursal', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    direccion: { type: DataTypes.STRING(255), allowNull: true },
    ciudad: { type: DataTypes.STRING(100), allowNull: true },
    telefono: { type: DataTypes.STRING(50), allowNull: true },
    es_principal: { type: DataTypes.BOOLEAN, defaultValue: false } // Para identificar la Bodega Central
}, { tableName: 'sucursales', timestamps: true });

// 🔥 19. MODELO: INVENTARIO POR SUCURSAL (NODO) 🔥
const InventarioSucursal = sequelize.define('InventarioSucursal', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productoId: { type: DataTypes.INTEGER, allowNull: false, field: 'producto_id' },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    stock_local: { type: DataTypes.INTEGER, defaultValue: 0 }, // El stock específico de esta tienda
    tope_minimo_local: { type: DataTypes.INTEGER, defaultValue: 5 }
}, { 
    tableName: 'inventarios_sucursales', 
    timestamps: true,
    indexes: [ { unique: true, fields: ['producto_id', 'sucursal_id'] } ] // Un producto solo puede tener 1 registro por sucursal
});


// --- RELACIONES ACTUALIZADAS ---
Usuario.hasMany(Direccion, { foreignKey: 'usuarioId', as: 'Direcciones' }); Direccion.belongsTo(Usuario, { foreignKey: 'usuarioId' });
Categoria.hasMany(Producto, { foreignKey: 'categoriaId', as: 'Productos' }); Producto.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'Categoria' });
Usuario.belongsToMany(Producto, { through: Favorito, foreignKey: 'usuario_id' }); Producto.belongsToMany(Usuario, { through: Favorito, foreignKey: 'producto_id' });
Favorito.belongsTo(Usuario, { foreignKey: 'usuario_id' }); Favorito.belongsTo(Producto, { foreignKey: 'producto_id', as: 'Producto' }); Producto.hasMany(Favorito, { foreignKey: 'producto_id' });
Usuario.hasMany(Pedido, { foreignKey: 'usuarioId', as: 'Pedidos' }); Pedido.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'Usuario' });
Pedido.hasMany(DetallePedido, { foreignKey: 'pedidoId', as: 'Detalles' }); DetallePedido.belongsTo(Pedido, { foreignKey: 'pedidoId' });
Producto.hasMany(DetallePedido, { foreignKey: 'productoId' }); DetallePedido.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });
Pedido.hasOne(Transaccion, { foreignKey: 'pedidoId', as: 'TransaccionContable' }); Transaccion.belongsTo(Pedido, { foreignKey: 'pedidoId' });
Usuario.hasMany(Credito, { foreignKey: 'usuarioId', as: 'Creditos' }); Credito.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'Usuario' });
Credito.hasMany(Abono, { foreignKey: 'creditoId', as: 'Abonos' }); Abono.belongsTo(Credito, { foreignKey: 'creditoId', as: 'Credito' });
Usuario.hasMany(SesionCaja, { foreignKey: 'usuarioId', as: 'SesionesCaja' }); SesionCaja.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'Cajero' });
Producto.hasMany(MovimientoKardex, { foreignKey: 'productoId', as: 'HistorialKardex' }); MovimientoKardex.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });
Usuario.hasMany(MovimientoKardex, { foreignKey: 'usuarioId', as: 'MovimientosRealizados' }); MovimientoKardex.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'Usuario' });
Empleado.hasMany(Asistencia, { foreignKey: 'empleadoId', as: 'Asistencias' }); Asistencia.belongsTo(Empleado, { foreignKey: 'empleadoId', as: 'Empleado' });

// 🔥 RELACIONES OMNICANAL / MULTISUCURSAL 🔥
Sucursal.hasMany(InventarioSucursal, { foreignKey: 'sucursalId', as: 'Inventarios' });
InventarioSucursal.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'Sucursal' });

Producto.hasMany(InventarioSucursal, { foreignKey: 'productoId', as: 'StockPorSucursal' });
InventarioSucursal.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });

Sucursal.hasMany(Usuario, { foreignKey: 'sucursalId', as: 'Empleados' });
Usuario.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'SucursalAsignada' });

Sucursal.hasMany(Pedido, { foreignKey: 'sucursalId', as: 'VentasLocales' });
Pedido.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'SucursalOrigen' });

Sucursal.hasMany(Transaccion, { foreignKey: 'sucursalId', as: 'TransaccionesCaja' });
Transaccion.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'Sucursal' });

Sucursal.hasMany(SesionCaja, { foreignKey: 'sucursalId', as: 'TurnosCaja' });
SesionCaja.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'Sucursal' });

module.exports = { 
    sequelize, Usuario, Producto, Pedido, DetallePedido, 
    Categoria, Favorito, Direccion, Configuracion, Transaccion, 
    RutaLogistica, Credito, Abono, Proveedor, SesionCaja,
    MovimientoKardex, Empleado, Asistencia,
    Sucursal, InventarioSucursal // 🔥 Exportamos la arquitectura Multialmacén
};