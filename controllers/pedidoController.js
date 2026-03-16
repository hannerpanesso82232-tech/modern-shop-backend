const { Pedido, DetallePedido, Producto, Usuario, Transaccion, RutaLogistica, Configuracion, Credito, sequelize } = require('../models');

// 🔥 MOTOR DE ENRUTAMIENTO DINÁMICO 🔥
const asignarRutaLogistica = async (ciudadCliente, direccion) => {
    const texto = `${ciudadCliente || ''} ${direccion || ''}`.toUpperCase();
    
    try {
        await RutaLogistica.sync(); // Asegura que la tabla exista
        const reglasRutas = await RutaLogistica.findAll();
        
        // Busca si alguna palabra clave de la base de datos coincide con la ciudad/dirección del cliente
        for (const regla of reglasRutas) {
            if (texto.includes(regla.ciudad.toUpperCase())) {
                return regla.dia_ruta; // Retorna la ruta programada por el Admin
            }
        }
    } catch (error) {
        console.error("Error al buscar ruta logística:", error);
    }
    
    return 'A CONVENIR'; // Fallback por defecto si no hay coincidencias
};

// Crear pedido
exports.crearPedido = async (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: "Sesión no válida." });

    const t = await sequelize.transaction();
    
    try {
        const { productos, direccion } = req.body; 
        const usuarioId = req.user.id; 

        if (!productos || productos.length === 0) return res.status(400).json({ error: "El carrito está vacío" });
        if (!direccion) return res.status(400).json({ error: "La dirección es obligatoria" });

        const usuario = await Usuario.findByPk(usuarioId);
        
        // Asignación de ruta esperando la Base de Datos
        const rutaAsignada = await asignarRutaLogistica(usuario?.ciudad, direccion);

        const nuevoPedido = await Pedido.create({
            usuarioId: usuarioId, 
            estado: 'Pendiente', 
            fecha: new Date(),
            total: 0,
            direccion: direccion, 
            ruta: rutaAsignada    
        }, { transaction: t });

        let totalAcumulado = 0;
        const detallesParaNotificacion = []; 

        for (const item of productos) {
            const prodId = item.producto_id || item.id;
            const producto = await Producto.findByPk(prodId);
            
            if (!producto) throw new Error(`El producto no existe.`);
            if (producto.stock < item.cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}.`);

            await DetallePedido.create({
                pedidoId: nuevoPedido.id,
                productoId: prodId,
                cantidad: item.cantidad,
                precioUnitario: producto.precio 
            }, { transaction: t });

            await producto.update({ stock: producto.stock - item.cantidad }, { transaction: t });
            totalAcumulado += parseFloat(producto.precio) * item.cantidad;
            detallesParaNotificacion.push({ nombre: producto.nombre, cantidad: item.cantidad });
        }

        await nuevoPedido.update({ total: totalAcumulado }, { transaction: t });
        await t.commit();

        const io = req.app.get('socketio') || req.io; 
        if (io) {
            io.emit('nuevo_pedido_admin', {
                pedidoId: nuevoPedido.id,
                cliente: req.user.nombre || 'Cliente',
                total: totalAcumulado,
                direccion: direccion,
                ruta: rutaAsignada,
                items: detallesParaNotificacion,
                timestamp: new Date()
            });
        }

        res.status(201).json({ mensaje: "Pedido confirmado", pedidoId: nuevoPedido.id, total: totalAcumulado, ruta: rutaAsignada });

    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ error: error.message });
    }
};

exports.obtenerMisPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.findAll({
            where: { usuarioId: req.user.id },
            include: [{
                model: DetallePedido,
                as: 'Detalles',
                include: [{ model: Producto, as: 'Producto', attributes: ['nombre', 'imagen_url', 'precio'] }]
            }],
            order: [['fecha', 'DESC']]
        });
        res.json(pedidos);
    } catch (error) { res.status(500).json({ error: "Error al cargar tu historial" }); }
};

exports.listarTodosLosPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.findAll({
            include: [
                { model: Usuario, as: 'Usuario', attributes: ['nombre', 'email', 'ciudad', 'direccion'] },
                { model: DetallePedido, as: 'Detalles', include: [{ model: Producto, as: 'Producto', attributes: ['nombre', 'descripcion', 'imagen_url', 'precio'] }] }
            ],
            order: [['fecha', 'DESC']]
        });
        res.json(pedidos);
    } catch (error) { res.status(500).json({ error: "Error interno al obtener pedidos." }); }
};

// 🔥 CORRECCIÓN: LÓGICA INTELIGENTE DE REVERSIÓN 🔥
exports.actualizarEstadoPedido = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const pedido = await Pedido.findByPk(id, { transaction: t });
        
        if (!pedido) {
            await t.rollback();
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const estadoFormateado = estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase();
        await pedido.update({ estado: estadoFormateado }, { transaction: t });

        // Si echamos el pedido para atrás (ya no está entregado)...
        if (estadoFormateado !== 'Entregado') {
            // 1. Buscamos si tenía un ingreso directo de Contado en Finanzas y lo borramos
            const transaccionExistente = await Transaccion.findOne({ where: { pedidoId: pedido.id }, transaction: t });
            if (transaccionExistente) { 
                await transaccionExistente.destroy({ transaction: t }); 
            }

            // 2. Buscamos si tenía una deuda de Crédito en Cartera y la borramos
            // Usamos un LIKE simple en la descripción para encontrarlo: `Factura Pedido #ID`
            const creditoExistente = await Credito.findOne({
                where: {
                    descripcion: `Factura Pedido #${pedido.id}`
                },
                transaction: t
            });
            if (creditoExistente) {
                // Borrar abonos que le hayan hecho a esa factura (opcional pero seguro)
                await sequelize.models.Abono.destroy({ where: { creditoId: creditoExistente.id }, transaction: t });
                // Borrar la deuda
                await creditoExistente.destroy({ transaction: t });
            }
        }

        // Si el estado SÍ ES "Entregado", no hacemos nada extra aquí porque el Modal del Frontend 
        // ya se encarga de crear el Ingreso o el Crédito de forma específica.

        await t.commit();
        res.json({ mensaje: `Estado actualizado a ${estadoFormateado}`, pedido });
    } catch (error) { 
        await t.rollback();
        console.error("Error al actualizar estado del pedido:", error);
        res.status(500).json({ error: error.message }); 
    }
};

exports.actualizarRutaPedido = async (req, res) => {
    try {
        const { id } = req.params;
        const { ruta } = req.body;
        const pedido = await Pedido.findByPk(id);
        if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });

        await pedido.update({ ruta: ruta });
        res.json({ mensaje: `Ruta actualizada a ${ruta}`, pedido });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

// 🔥 GESTIÓN DE RUTAS DINÁMICAS 🔥
exports.obtenerRutasLogistica = async (req, res) => {
    try {
        await RutaLogistica.sync();
        const rutas = await RutaLogistica.findAll();
        res.json(rutas);
    } catch (error) { res.status(500).json({ error: "Error al obtener rutas" }); }
};

exports.agregarRutaLogistica = async (req, res) => {
    try {
        const { ciudad, dia_ruta } = req.body;
        if(!ciudad || !dia_ruta) return res.status(400).json({ error: "Faltan datos" });
        
        await RutaLogistica.sync();
        const nuevaRuta = await RutaLogistica.create({ ciudad: ciudad.toUpperCase(), dia_ruta });
        res.status(201).json(nuevaRuta);
    } catch (error) { res.status(500).json({ error: "Error al guardar ruta" }); }
};

exports.eliminarRutaLogistica = async (req, res) => {
    try {
        await RutaLogistica.destroy({ where: { id: req.params.id } });
        res.json({ mensaje: "Ruta eliminada" });
    } catch (error) { res.status(500).json({ error: "Error al eliminar ruta" }); }
};

exports.procesarDevolucion = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params; // ID del Pedido
        const { productoId, cantidadDevuelta, precioUnitario } = req.body;

        const pedido = await Pedido.findByPk(id, { transaction: t });
        if (!pedido) throw new Error("Pedido no encontrado");

        const detalle = await DetallePedido.findOne({ 
            where: { pedidoId: id, productoId: productoId },
            transaction: t
        });

        if (!detalle) throw new Error("El producto no pertenece a este pedido");
        if (cantidadDevuelta > detalle.cantidad) throw new Error("No puedes devolver más de lo que se compró");

        // 1. Restaurar el Stock
        const producto = await Producto.findByPk(productoId, { transaction: t });
        if (producto) {
            await producto.update({ stock: producto.stock + cantidadDevuelta }, { transaction: t });
        }

        // 2. Modificar el Detalle
        const nuevaCantidad = detalle.cantidad - cantidadDevuelta;
        if (nuevaCantidad === 0) {
            await detalle.destroy({ transaction: t });
        } else {
            await detalle.update({ cantidad: nuevaCantidad }, { transaction: t });
        }

        // 3. Restar el valor del total del pedido
        const valorADescontar = cantidadDevuelta * precioUnitario;
        const nuevoTotal = parseFloat(pedido.total) - valorADescontar;
        await pedido.update({ total: nuevoTotal }, { transaction: t });

        // 4. Contabilidad (Si ya estaba entregado, generamos un Egreso por reembolso)
        if (pedido.estado === 'Entregado') {
            await Transaccion.create({
                tipo: 'EGRESO',
                monto: valorADescontar,
                descripcion: `Reembolso Cliente - Orden #${pedido.id}`,
                categoria: 'Devoluciones',
                pedidoId: pedido.id
            }, { transaction: t });
        }

        await t.commit();
        res.json({ mensaje: "Devolución procesada con éxito" });

    } catch (error) {
        await t.rollback();
        res.status(500).json({ error: error.message });
    }
};

// 🔥 CANCELAR PEDIDO POR EL CLIENTE 🔥
exports.cancelarPedidoCliente = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const usuarioId = req.user.id;

        // 1. Buscar el pedido asegurando que le pertenece al cliente
        const pedido = await Pedido.findOne({
            where: { id: id, usuarioId: usuarioId },
            include: [{ model: DetallePedido, as: 'Detalles' }],
            transaction: t
        });

        if (!pedido) {
            await t.rollback();
            return res.status(404).json({ error: "Pedido no encontrado o no te pertenece." });
        }

        // 2. Verificar que esté en estado "Pendiente"
        if (pedido.estado !== 'Pendiente') {
            await t.rollback();
            return res.status(400).json({ error: "Solo puedes cancelar pedidos que están Pendientes." });
        }

        // 3. Cambiar el estado a Cancelado
        await pedido.update({ estado: 'Cancelado' }, { transaction: t });

        // 4. Devolver el stock de los productos al inventario
        if (pedido.Detalles && pedido.Detalles.length > 0) {
            for (const item of pedido.Detalles) {
                const producto = await Producto.findByPk(item.productoId, { transaction: t });
                if (producto) {
                    await producto.update({ stock: producto.stock + item.cantidad }, { transaction: t });
                }
            }
        }

        await t.commit();
        res.json({ mensaje: "Pedido cancelado correctamente y stock devuelto." });

    } catch (error) {
        await t.rollback();
        console.error("Error al cancelar pedido:", error);
        res.status(500).json({ error: "Error interno al cancelar el pedido." });
    }
}; 

// 🔥 GESTIÓN DE HORA LÍMITE DE PEDIDOS 🔥
exports.obtenerHoraLimite = async (req, res) => {
    try {
        await Configuracion.sync();
        const config = await Configuracion.findByPk('hora_limite');
        // Si no hay hora configurada, por defecto serán las 8:00 PM (20:00)
        res.json({ hora: config ? config.valor : '20:00' });
    } catch (error) { 
        res.status(500).json({ error: "Error al obtener hora límite" }); 
    }
};

exports.actualizarHoraLimite = async (req, res) => {
    try {
        const { hora } = req.body;
        await Configuracion.sync();
        const [config, created] = await Configuracion.findOrCreate({
            where: { clave: 'hora_limite' },
            defaults: { valor: hora }
        });
        if (!created) {
            await config.update({ valor: hora });
        }
        res.json({ mensaje: "Hora límite actualizada", hora });
    } catch (error) { 
        res.status(500).json({ error: "Error al actualizar hora límite" }); 
    }
};