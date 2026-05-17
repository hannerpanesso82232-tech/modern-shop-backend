const { Pedido, DetallePedido, Producto, Usuario, Transaccion, RutaLogistica, Configuracion, Credito, MovimientoKardex, InventarioSucursal, sequelize } = require('../models');
const { Op } = require('sequelize');

// Caché
let redis;
try { redis = require('../config/redis'); } catch (e) { redis = null; }

// Helper del Kardex
const registrarTrazaKardex = async (productoId, tipo, cantidad, costo_unitario, valor_total, saldo_stock, saldo_costo, referencia, usuarioId = null, tx = null, stock_anterior = 0, costo_anterior = 0) => {
    try {
        await MovimientoKardex.create({
            productoId, usuarioId, tipo, cantidad, costo_unitario, valor_total,
            stock_anterior, costo_anterior,
            saldo_stock_momento: saldo_stock, saldo_costo_promedio: saldo_costo,
            sucursal_origen: 'Sistema', sucursal_destino: 'Sistema', referencia
        }, { transaction: tx });
    } catch (error) { console.error("⚠️ Error interno al registrar en Kardex:", error); }
};

const asignarRutaLogistica = async (ciudadCliente, direccion) => {
    const texto = `${ciudadCliente || ''} ${direccion || ''}`.toUpperCase();
    try {
        await RutaLogistica.sync();
        const reglasRutas = await RutaLogistica.findAll();
        for (const regla of reglasRutas) { if (texto.includes(regla.ciudad.toUpperCase())) return regla.dia_ruta; }
    } catch (error) { console.error("Error al buscar ruta logística:", error); }
    return 'A CONVENIR';
};

const calcularCupoDisponible = async (usuarioId, limiteCredito) => {
    if (!limiteCredito || limiteCredito <= 0) return null; 
    const creditosActivos = await Credito.findAll({ where: { usuarioId: usuarioId, estado: 'VIGENTE' } });
    const deudaActual = creditosActivos.reduce((suma, credito) => suma + parseFloat(credito.saldo || 0), 0);
    return parseFloat(limiteCredito) - deudaActual;
};

// 🔥 1. CREAR PEDIDO (CON INTELIGENCIA MULTIALMACÉN) 🔥
exports.crearPedido = async (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: "Sesión no válida." });
    const t = await sequelize.transaction();
    
    try {
        const { productos, direccion, metodo_pago, total_forzado } = req.body; 
        const usuarioId = req.user.id; 

        if (!productos || productos.length === 0) return res.status(400).json({ error: "El carrito está vacío" });
        if (!direccion) return res.status(400).json({ error: "La dirección es obligatoria" });

        // Identificar si el vendedor pertenece a una sucursal física
        const usuarioVendedor = await Usuario.findByPk(usuarioId, { include: ['SucursalAsignada'] });
        const sucursalIdDb = usuarioVendedor?.sucursalId || null;
        const nombreSucursal = sucursalIdDb ? usuarioVendedor.SucursalAsignada?.nombre : 'Bodega Central';

        const usuarioCliente = await Usuario.findByPk(usuarioId);
        
        let totalAcumuladoEstimado = 0;
        for (const item of productos) {
            const prodId = item.producto_id || item.id;
            const producto = await Producto.findByPk(prodId);
            if (!producto) throw new Error(`El producto no existe.`);
            
            // 🔥 Validación de Stock Local vs Central 🔥
            if (sucursalIdDb) {
                const invLocal = await InventarioSucursal.findOne({ where: { productoId: prodId, sucursalId: sucursalIdDb } });
                if (!invLocal || invLocal.stock_local < item.cantidad) throw new Error(`Stock insuficiente en ${nombreSucursal} para ${producto.nombre}.`);
            } else {
                if (producto.stock < item.cantidad) throw new Error(`Stock insuficiente en Bodega Central para ${producto.nombre}.`);
            }
            
            const precioUsar = item.precio !== undefined ? parseFloat(item.precio) : parseFloat(producto.precio);
            totalAcumuladoEstimado += precioUsar * item.cantidad;
        }

        if (metodo_pago === 'CREDITO') {
            const limiteCredito = parseFloat(usuarioCliente.limite_credito || 0);
            if (usuarioCliente.credito_activo === false) throw new Error("Tu cuenta tiene el crédito suspendido.");
            if (limiteCredito === 0) throw new Error("No tienes un cupo de crédito asignado.");
            const cupoDisponible = await calcularCupoDisponible(usuarioId, limiteCredito);
            if (cupoDisponible !== null && totalAcumuladoEstimado > cupoDisponible) throw new Error(`Tu cupo disponible no es suficiente.`);
        }

        const rutaAsignada = await asignarRutaLogistica(usuarioCliente?.ciudad, direccion);

        const nuevoPedido = await Pedido.create({
            usuarioId: usuarioId, estado: 'Pendiente', fecha: new Date(),
            total: total_forzado !== undefined ? parseFloat(total_forzado) : totalAcumuladoEstimado, 
            direccion: direccion, ruta: rutaAsignada, metodo_pago: metodo_pago || 'CONTADO',
            sucursalId: sucursalIdDb // Guardamos a qué tienda pertenece la venta
        }, { transaction: t });

        let totalAcumuladoReal = 0;
        const detallesParaNotificacion = []; 
        const cambiosDeStock = []; 

        for (const item of productos) {
            const prodId = item.producto_id || item.id;
            const producto = await Producto.findByPk(prodId);
            const precioGuardar = item.precio !== undefined ? parseFloat(item.precio) : parseFloat(producto.precio);
            const costoVigente = parseFloat(producto.costo_compra || 0);

            await DetallePedido.create({ pedidoId: nuevoPedido.id, productoId: prodId, cantidad: item.cantidad, precioUnitario: precioGuardar }, { transaction: t });

            let stockAnterior = 0;
            let nuevoStockFisico = 0;

            // 🔥 Descuento Físico Multialmacén 🔥
            if (sucursalIdDb) {
                const invLocal = await InventarioSucursal.findOne({ where: { productoId: prodId, sucursalId: sucursalIdDb }, transaction: t });
                stockAnterior = invLocal.stock_local;
                nuevoStockFisico = stockAnterior - item.cantidad;
                await invLocal.update({ stock_local: nuevoStockFisico }, { transaction: t });
            } else {
                stockAnterior = producto.stock;
                nuevoStockFisico = stockAnterior - item.cantidad;
                await producto.update({ stock: nuevoStockFisico }, { transaction: t });
            }
            
            await registrarTrazaKardex(
                producto.id, 'SALIDA', item.cantidad, costoVigente, (item.cantidad * costoVigente), 
                nuevoStockFisico, costoVigente, `Venta - ${nombreSucursal} (Orden #${nuevoPedido.id})`, req.user.id, t, stockAnterior, costoVigente
            );

            cambiosDeStock.push({ id: producto.id, nuevoStock: nuevoStockFisico });
            totalAcumuladoReal += precioGuardar * item.cantidad;
            detallesParaNotificacion.push({ nombre: producto.nombre, cantidad: item.cantidad });
        }

        if (total_forzado === undefined) await nuevoPedido.update({ total: totalAcumuladoReal }, { transaction: t });

        if (metodo_pago === 'CREDITO') {
            const dias = parseInt(usuarioCliente.dias_credito || 30);
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + dias);
            const montoCredito = total_forzado !== undefined ? parseFloat(total_forzado) : totalAcumuladoReal;
            await Credito.create({ usuarioId: usuarioCliente.id, monto_total: montoCredito, saldo: montoCredito, descripcion: `Factura Pedido #${nuevoPedido.id}`, estado: 'VIGENTE', fecha_vencimiento: fechaVencimiento.toISOString() }, { transaction: t });
        }

        await t.commit();
        if (redis && typeof redis.del === 'function') await redis.del('productos');

        const socketIO = req.app.get('socketio') || req.io; 
        if (socketIO) {
            socketIO.emit('nuevo_pedido_admin', { pedidoId: nuevoPedido.id, cliente: req.user.nombre || 'Cliente', total: total_forzado !== undefined ? parseFloat(total_forzado) : totalAcumuladoReal, direccion: direccion, ruta: rutaAsignada, items: detallesParaNotificacion, metodo_pago: metodo_pago || 'CONTADO', timestamp: new Date() });
            cambiosDeStock.forEach(cambio => socketIO.emit('stockActualizado', cambio));
            socketIO.emit('pedido_actualizado', { usuarioId: usuarioId });
        }

        res.status(201).json({ mensaje: "Pedido confirmado", pedidoId: nuevoPedido.id, total: total_forzado !== undefined ? parseFloat(total_forzado) : totalAcumuladoReal, ruta: rutaAsignada, metodo_pago: metodo_pago || 'CONTADO' });

    } catch (error) {
        if (t) await t.rollback(); res.status(400).json({ error: error.message });
    }
};

exports.obtenerMisPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.findAll({
            where: { usuarioId: req.user.id },
            include: [{ model: DetallePedido, as: 'Detalles', include: [{ model: Producto, as: 'Producto', attributes: ['nombre', 'imagen_url', 'precio'] }] }],
            order: [['fecha', 'DESC']]
        });
        res.json(pedidos);
    } catch (error) { res.status(500).json({ error: "Error al cargar tu historial" }); }
};

exports.listarTodosLosPedidos = async (req, res) => {
    try {
        const filtroRol = req.user.rol === 'CAJERO' ? { metodo_pago: 'POS_LOCAL' } : {};
        const pedidos = await Pedido.findAll({
            where: filtroRol, 
            include: [
                { model: Usuario, as: 'Usuario', attributes: ['nombre', 'email', 'ciudad', 'direccion'] },
                { model: DetallePedido, as: 'Detalles', include: [{ model: Producto, as: 'Producto', attributes: ['nombre', 'descripcion', 'imagen_url', 'precio'] }] }
            ],
            order: [['fecha', 'DESC']]
        });
        res.json(pedidos);
    } catch (error) { res.status(500).json({ error: "Error interno al obtener pedidos." }); }
};

// 🔥 2. ACTUALIZAR ESTADO DE PEDIDO (DEVOLVER AL INVENTARIO CORRECTO) 🔥
exports.actualizarEstadoPedido = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        const pedido = await Pedido.findByPk(id, { include: [{ model: DetallePedido, as: 'Detalles' }], transaction: t });
        if (!pedido) { await t.rollback(); return res.status(404).json({ error: "Pedido no encontrado" }); }
        if (pedido.estado === 'Cancelado' && pedido.cancelado_por === 'CLIENTE') { await t.rollback(); return res.status(403).json({ error: "Cancelado por cliente. Acción denegada." }); }

        const estadoFormateado = estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase();
        const estadoAnterior = pedido.estado;
        const cambiosDeStock = []; 

        // CANCELAR Y DEVOLVER STOCK
        if (estadoAnterior !== 'Cancelado' && estadoFormateado === 'Cancelado') {
            for (const item of pedido.Detalles) {
                const producto = await Producto.findByPk(item.productoId, { transaction: t });
                if (producto) {
                    const costoVigente = parseFloat(producto.costo_compra || 0);
                    let stockAnterior = 0, nuevoStockFisico = 0;

                    if (pedido.sucursalId) {
                        const invLocal = await InventarioSucursal.findOne({ where: { productoId: producto.id, sucursalId: pedido.sucursalId }, transaction: t });
                        if (invLocal) {
                            stockAnterior = invLocal.stock_local;
                            nuevoStockFisico = stockAnterior + item.cantidad;
                            await invLocal.update({ stock_local: nuevoStockFisico }, { transaction: t });
                        }
                    } else {
                        stockAnterior = producto.stock;
                        nuevoStockFisico = stockAnterior + item.cantidad;
                        await producto.update({ stock: nuevoStockFisico }, { transaction: t });
                    }
                    
                    await registrarTrazaKardex(producto.id, 'ENTRADA', item.cantidad, costoVigente, (item.cantidad * costoVigente), nuevoStockFisico, costoVigente, `Anulación - Orden #${pedido.id}`, req.user?.id, t, stockAnterior, costoVigente);
                    cambiosDeStock.push({ id: producto.id, nuevoStock: nuevoStockFisico });
                }
            }
        } 
        // REACTIVAR Y QUITAR STOCK
        else if (estadoAnterior === 'Cancelado' && estadoFormateado !== 'Cancelado') {
            for (const item of pedido.Detalles) {
                const producto = await Producto.findByPk(item.productoId, { transaction: t });
                if (producto) {
                    const costoVigente = parseFloat(producto.costo_compra || 0);
                    let stockAnterior = 0, nuevoStockFisico = 0;

                    if (pedido.sucursalId) {
                        const invLocal = await InventarioSucursal.findOne({ where: { productoId: producto.id, sucursalId: pedido.sucursalId }, transaction: t });
                        if (!invLocal || invLocal.stock_local < item.cantidad) throw new Error(`Stock local insuficiente para reactivar ${producto.nombre}.`);
                        stockAnterior = invLocal.stock_local;
                        nuevoStockFisico = stockAnterior - item.cantidad;
                        await invLocal.update({ stock_local: nuevoStockFisico }, { transaction: t });
                    } else {
                        if (producto.stock < item.cantidad) throw new Error(`Stock global insuficiente para reactivar ${producto.nombre}.`);
                        stockAnterior = producto.stock;
                        nuevoStockFisico = stockAnterior - item.cantidad;
                        await producto.update({ stock: nuevoStockFisico }, { transaction: t });
                    }

                    await registrarTrazaKardex(producto.id, 'SALIDA', item.cantidad, costoVigente, (item.cantidad * costoVigente), nuevoStockFisico, costoVigente, `Reactivación - Orden #${pedido.id}`, req.user?.id, t, stockAnterior, costoVigente);
                    cambiosDeStock.push({ id: producto.id, nuevoStock: nuevoStockFisico });
                }
            }
        }

        let canceladoPor = pedido.cancelado_por;
        if (estadoFormateado === 'Cancelado' && estadoAnterior !== 'Cancelado') canceladoPor = 'ADMIN';
        else if (estadoFormateado !== 'Cancelado') canceladoPor = null; 

        await pedido.update({ estado: estadoFormateado, cancelado_por: canceladoPor }, { transaction: t });

        if (estadoFormateado !== 'Entregado') {
            await Transaccion.destroy({ where: { pedidoId: pedido.id }, transaction: t });
            const creditoExistente = await Credito.findOne({ where: { descripcion: `Factura Pedido #${pedido.id}` }, transaction: t });
            if (creditoExistente) {
                await Transaccion.destroy({ where: { descripcion: { [Op.like]: `%Crédito #${creditoExistente.id}%` } }, transaction: t });
                await sequelize.models.Abono.destroy({ where: { creditoId: creditoExistente.id }, transaction: t });
                await creditoExistente.destroy({ transaction: t });
            }
        }

        await t.commit();
        if (redis && typeof redis.del === 'function') await redis.del('productos');

        const socketIO = req.app.get('socketio') || req.io; 
        if (socketIO) {
            socketIO.emit('pedido_actualizado', { usuarioId: pedido.usuarioId });
            socketIO.emit('cartera_actualizada', { usuarioId: pedido.usuarioId });
            cambiosDeStock.forEach(cambio => socketIO.emit('stockActualizado', cambio));
        }
        res.json({ mensaje: `Estado actualizado a ${estadoFormateado}`, pedido });
    } catch (error) { 
        await t.rollback(); res.status(500).json({ error: error.message || "Ocurrió un error." }); 
    }
};

exports.actualizarRutaPedido = async (req, res) => {
    try {
        const { id } = req.params; const { ruta } = req.body;
        const pedido = await Pedido.findByPk(id);
        if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
        await pedido.update({ ruta: ruta });
        const socketIO = req.app.get('socketio') || req.io; 
        if (socketIO) socketIO.emit('pedido_actualizado', { usuarioId: pedido.usuarioId });
        res.json({ mensaje: `Ruta actualizada a ${ruta}`, pedido });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.obtenerRutasLogistica = async (req, res) => {
    try { await RutaLogistica.sync(); const rutas = await RutaLogistica.findAll(); res.json(rutas); } catch (error) { res.status(500).json({ error: "Error" }); }
};

exports.agregarRutaLogistica = async (req, res) => {
    try {
        const { ciudad, dia_ruta } = req.body;
        if(!ciudad || !dia_ruta) return res.status(400).json({ error: "Faltan datos" });
        await RutaLogistica.sync();
        const nuevaRuta = await RutaLogistica.create({ ciudad: ciudad.toUpperCase(), dia_ruta });
        res.status(201).json(nuevaRuta);
    } catch (error) { res.status(500).json({ error: "Error" }); }
};

exports.eliminarRutaLogistica = async (req, res) => {
    try { await RutaLogistica.destroy({ where: { id: req.params.id } }); res.json({ mensaje: "Ruta eliminada" }); } catch (error) { res.status(500).json({ error: "Error" }); }
};

// 🔥 3. PROCESAR DEVOLUCIÓN PARCIAL (MULTIALMACÉN) 🔥
exports.procesarDevolucion = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params; const { productoId, cantidadDevuelta, precioUnitario } = req.body;

        const pedido = await Pedido.findByPk(id, { transaction: t });
        if (!pedido) throw new Error("Pedido no encontrado");

        const detalle = await DetallePedido.findOne({ where: { pedidoId: id, productoId: productoId }, transaction: t });
        if (!detalle) throw new Error("El producto no pertenece a este pedido");
        if (cantidadDevuelta > detalle.cantidad) throw new Error("No puedes devolver más de lo que se compró");

        const producto = await Producto.findByPk(productoId, { transaction: t });
        let nuevoStockFisico = 0;
        if (producto) {
            const costoVigente = parseFloat(producto.costo_compra || 0);
            let stockAnterior = 0;

            if (pedido.sucursalId) {
                const invLocal = await InventarioSucursal.findOne({ where: { productoId: producto.id, sucursalId: pedido.sucursalId }, transaction: t });
                if (invLocal) {
                    stockAnterior = invLocal.stock_local;
                    nuevoStockFisico = stockAnterior + cantidadDevuelta;
                    await invLocal.update({ stock_local: nuevoStockFisico }, { transaction: t });
                }
            } else {
                stockAnterior = producto.stock;
                nuevoStockFisico = stockAnterior + cantidadDevuelta;
                await producto.update({ stock: nuevoStockFisico }, { transaction: t });
            }

            await registrarTrazaKardex(producto.id, 'DEVOLUCION', cantidadDevuelta, costoVigente, (cantidadDevuelta * costoVigente), nuevoStockFisico, costoVigente, `Devolución Parcial - Orden #${pedido.id}`, req.user?.id, t, stockAnterior, costoVigente);
        }

        const nuevaCantidad = detalle.cantidad - cantidadDevuelta;
        if (nuevaCantidad === 0) await detalle.destroy({ transaction: t });
        else await detalle.update({ cantidad: nuevaCantidad }, { transaction: t });

        const valorADescontar = cantidadDevuelta * precioUnitario;
        await pedido.update({ total: parseFloat(pedido.total) - valorADescontar }, { transaction: t });

        if (pedido.estado === 'Entregado') {
            const txOriginal = await Transaccion.findOne({ where: { pedidoId: pedido.id, tipo: 'INGRESO' }, transaction: t });
            let metodoReembolso = 'EFECTIVO'; 
            if (txOriginal && txOriginal.descripcion && txOriginal.descripcion.toUpperCase().includes('TRANSFERENCIA')) metodoReembolso = 'TRANSFERENCIA';
            await Transaccion.create({ tipo: 'EGRESO', monto: valorADescontar, descripcion: `Reembolso Cliente - Orden #${pedido.id} [${metodoReembolso}]`, categoria: 'Devoluciones', pedidoId: pedido.id }, { transaction: t });
        }

        await t.commit();
        if (redis && typeof redis.del === 'function') await redis.del('productos');

        const socketIO = req.app.get('socketio') || req.io; 
        if (socketIO) {
            socketIO.emit('pedido_actualizado', { usuarioId: pedido.usuarioId });
            if (producto) socketIO.emit('stockActualizado', { id: producto.id, nuevoStock: nuevoStockFisico });
        }
        res.json({ mensaje: "Devolución procesada con éxito" });
    } catch (error) {
        await t.rollback(); res.status(500).json({ error: error.message });
    }
};

// 🔥 CANCELAR PEDIDO CLIENTE (MULTIALMACÉN) 🔥
exports.cancelarPedidoCliente = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params; const usuarioId = req.user.id;
        const pedido = await Pedido.findOne({ where: { id: id, usuarioId: usuarioId }, include: [{ model: DetallePedido, as: 'Detalles' }], transaction: t });

        if (!pedido) { await t.rollback(); return res.status(404).json({ error: "Pedido no encontrado o no te pertenece." }); }
        if (pedido.estado !== 'Pendiente') { await t.rollback(); return res.status(400).json({ error: "Solo puedes cancelar pedidos Pendientes." }); }

        await pedido.update({ estado: 'Cancelado', cancelado_por: 'CLIENTE' }, { transaction: t });

        const cambiosDeStock = []; 
        if (pedido.Detalles && pedido.Detalles.length > 0) {
            for (const item of pedido.Detalles) {
                const producto = await Producto.findByPk(item.productoId, { transaction: t });
                if (producto) {
                    const costoVigente = parseFloat(producto.costo_compra || 0);
                    let stockAnterior = 0, nuevoStockFisico = 0;

                    if (pedido.sucursalId) {
                        const invLocal = await InventarioSucursal.findOne({ where: { productoId: producto.id, sucursalId: pedido.sucursalId }, transaction: t });
                        if (invLocal) {
                            stockAnterior = invLocal.stock_local;
                            nuevoStockFisico = stockAnterior + item.cantidad;
                            await invLocal.update({ stock_local: nuevoStockFisico }, { transaction: t });
                        }
                    } else {
                        stockAnterior = producto.stock;
                        nuevoStockFisico = stockAnterior + item.cantidad;
                        await producto.update({ stock: nuevoStockFisico }, { transaction: t });
                    }

                    await registrarTrazaKardex(producto.id, 'ENTRADA', item.cantidad, costoVigente, (item.cantidad * costoVigente), nuevoStockFisico, costoVigente, `Cancelación App Cliente - Orden #${pedido.id}`, usuarioId, t, stockAnterior, costoVigente);
                    cambiosDeStock.push({ id: producto.id, nuevoStock: nuevoStockFisico });
                }
            }
        }
        
        const creditoExistente = await Credito.findOne({ where: { descripcion: `Factura Pedido #${pedido.id}`, usuarioId: usuarioId }, transaction: t });
        if(creditoExistente) await creditoExistente.destroy({ transaction: t });

        await t.commit();
        if (redis && typeof redis.del === 'function') await redis.del('productos');

        const socketIO = req.app.get('socketio') || req.io; 
        if (socketIO) {
            socketIO.emit('pedido_actualizado', { usuarioId: usuarioId });
            socketIO.emit('cartera_actualizada', { usuarioId: usuarioId });
            cambiosDeStock.forEach(cambio => socketIO.emit('stockActualizado', cambio));
        }
        res.json({ mensaje: "Pedido cancelado correctamente y stock devuelto." });
    } catch (error) {
        await t.rollback(); res.status(500).json({ error: "Error interno al cancelar el pedido." });
    }
}; 

exports.obtenerHoraLimite = async (req, res) => { try { await Configuracion.sync(); const config = await Configuracion.findByPk('hora_limite'); res.json({ hora: config ? config.valor : '20:00' }); } catch (error) { res.status(500).json({ error: "Error" }); } };
exports.actualizarHoraLimite = async (req, res) => { try { const { hora } = req.body; await Configuracion.sync(); const [config, created] = await Configuracion.findOrCreate({ where: { clave: 'hora_limite' }, defaults: { valor: hora } }); if (!created) await config.update({ valor: hora }); res.json({ mensaje: "Hora límite", hora }); } catch (error) { res.status(500).json({ error: "Error" }); } };