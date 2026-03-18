const { Pedido, DetallePedido, Producto, Usuario, Transaccion, RutaLogistica, Configuracion, Credito, sequelize } = require('../models');
const { Op } = require('sequelize');

const asignarRutaLogistica = async (ciudadCliente, direccion) => {
    const texto = `${ciudadCliente || ''} ${direccion || ''}`.toUpperCase();
    try {
        await RutaLogistica.sync();
        const reglasRutas = await RutaLogistica.findAll();
        for (const regla of reglasRutas) {
            if (texto.includes(regla.ciudad.toUpperCase())) {
                return regla.dia_ruta;
            }
        }
    } catch (error) {
        console.error("Error al buscar ruta logística:", error);
    }
    return 'A CONVENIR';
};

const calcularCupoDisponible = async (usuarioId, limiteCredito) => {
    if (!limiteCredito || limiteCredito <= 0) return null; 
    const creditosActivos = await Credito.findAll({
        where: { usuarioId: usuarioId, estado: 'VIGENTE' }
    });
    const deudaActual = creditosActivos.reduce((suma, credito) => suma + parseFloat(credito.saldo || 0), 0);
    return parseFloat(limiteCredito) - deudaActual;
};

exports.crearPedido = async (req, res) => {
    if (!req.user || !req.user.id) return res.status(401).json({ error: "Sesión no válida." });

    const t = await sequelize.transaction();
    
    try {
        // 🔥 RECIBIMOS EL METODO DE PAGO 🔥
        const { productos, direccion, metodo_pago } = req.body; 
        const usuarioId = req.user.id; 

        if (!productos || productos.length === 0) return res.status(400).json({ error: "El carrito está vacío" });
        if (!direccion) return res.status(400).json({ error: "La dirección es obligatoria" });

        const usuario = await Usuario.findByPk(usuarioId);
        
        let totalAcumuladoEstimado = 0;
        for (const item of productos) {
            const prodId = item.producto_id || item.id;
            const producto = await Producto.findByPk(prodId);
            if (!producto) throw new Error(`El producto no existe.`);
            if (producto.stock < item.cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}.`);
            totalAcumuladoEstimado += parseFloat(producto.precio) * item.cantidad;
        }

        if (metodo_pago === 'CREDITO') {
            const limiteCredito = parseFloat(usuario.limite_credito || 0);
            
            if (limiteCredito === 0) {
                 throw new Error("No tienes un cupo de crédito asignado. Selecciona Pago de Contado.");
            }

            const cupoDisponible = await calcularCupoDisponible(usuarioId, limiteCredito);
            
            if (cupoDisponible !== null && totalAcumuladoEstimado > cupoDisponible) {
                throw new Error(`Tu cupo disponible ($${cupoDisponible.toLocaleString('es-CO')}) no es suficiente para este pedido ($${totalAcumuladoEstimado.toLocaleString('es-CO')}).`);
            }
        }

        const rutaAsignada = await asignarRutaLogistica(usuario?.ciudad, direccion);

        // 🔥 GUARDAMOS EL METODO DE PAGO EN EL PEDIDO 🔥
        const nuevoPedido = await Pedido.create({
            usuarioId: usuarioId, 
            estado: 'Pendiente', 
            fecha: new Date(),
            total: 0,
            direccion: direccion, 
            ruta: rutaAsignada,
            metodo_pago: metodo_pago || 'CONTADO' // <-- Guardamos la variable
        }, { transaction: t });

        let totalAcumulado = 0;
        const detallesParaNotificacion = []; 

        for (const item of productos) {
            const prodId = item.producto_id || item.id;
            const producto = await Producto.findByPk(prodId);
            
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

        if (metodo_pago === 'CREDITO') {
            const dias = parseInt(usuario.dias_credito || 30);
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + dias);
            
            await Credito.create({
                usuarioId: usuario.id,
                monto_total: totalAcumulado,
                saldo: totalAcumulado, 
                descripcion: `Factura Pedido #${nuevoPedido.id}`,
                estado: 'VIGENTE',
                fecha_vencimiento: fechaVencimiento.toISOString()
            }, { transaction: t });
        }

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
                metodo_pago: metodo_pago || 'CONTADO', // Pasamos esto a la app
                timestamp: new Date()
            });
        }

        res.status(201).json({ mensaje: "Pedido confirmado", pedidoId: nuevoPedido.id, total: totalAcumulado, ruta: rutaAsignada, metodo_pago: metodo_pago || 'CONTADO' });

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

        if (estadoFormateado !== 'Entregado') {
            await Transaccion.destroy({ where: { pedidoId: pedido.id }, transaction: t });

            const creditoExistente = await Credito.findOne({
                where: { descripcion: `Factura Pedido #${pedido.id}` },
                transaction: t
            });

            if (creditoExistente) {
                await Transaccion.destroy({
                    where: {
                        descripcion: {
                            [Op.like]: `%Crédito #${creditoExistente.id}%` 
                        }
                    },
                    transaction: t
                });

                await sequelize.models.Abono.destroy({ where: { creditoId: creditoExistente.id }, transaction: t });
                await creditoExistente.destroy({ transaction: t });
            }
        }

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
        const { id } = req.params; 
        const { productoId, cantidadDevuelta, precioUnitario } = req.body;

        const pedido = await Pedido.findByPk(id, { transaction: t });
        if (!pedido) throw new Error("Pedido no encontrado");

        const detalle = await DetallePedido.findOne({ 
            where: { pedidoId: id, productoId: productoId },
            transaction: t
        });

        if (!detalle) throw new Error("El producto no pertenece a este pedido");
        if (cantidadDevuelta > detalle.cantidad) throw new Error("No puedes devolver más de lo que se compró");

        const producto = await Producto.findByPk(productoId, { transaction: t });
        if (producto) {
            await producto.update({ stock: producto.stock + cantidadDevuelta }, { transaction: t });
        }

        const nuevaCantidad = detalle.cantidad - cantidadDevuelta;
        if (nuevaCantidad === 0) {
            await detalle.destroy({ transaction: t });
        } else {
            await detalle.update({ cantidad: nuevaCantidad }, { transaction: t });
        }

        const valorADescontar = cantidadDevuelta * precioUnitario;
        const nuevoTotal = parseFloat(pedido.total) - valorADescontar;
        await pedido.update({ total: nuevoTotal }, { transaction: t });

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

exports.cancelarPedidoCliente = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const usuarioId = req.user.id;

        const pedido = await Pedido.findOne({
            where: { id: id, usuarioId: usuarioId },
            include: [{ model: DetallePedido, as: 'Detalles' }],
            transaction: t
        });

        if (!pedido) {
            await t.rollback();
            return res.status(404).json({ error: "Pedido no encontrado o no te pertenece." });
        }

        if (pedido.estado !== 'Pendiente') {
            await t.rollback();
            return res.status(400).json({ error: "Solo puedes cancelar pedidos que están Pendientes." });
        }

        await pedido.update({ estado: 'Cancelado' }, { transaction: t });

        if (pedido.Detalles && pedido.Detalles.length > 0) {
            for (const item of pedido.Detalles) {
                const producto = await Producto.findByPk(item.productoId, { transaction: t });
                if (producto) {
                    await producto.update({ stock: producto.stock + item.cantidad }, { transaction: t });
                }
            }
        }
        
        const creditoExistente = await Credito.findOne({
            where: { descripcion: `Factura Pedido #${pedido.id}`, usuarioId: usuarioId },
            transaction: t
        });
        
        if(creditoExistente){
             await creditoExistente.destroy({ transaction: t });
        }

        await t.commit();
        res.json({ mensaje: "Pedido cancelado correctamente y stock devuelto." });

    } catch (error) {
        await t.rollback();
        console.error("Error al cancelar pedido:", error);
        res.status(500).json({ error: "Error interno al cancelar el pedido." });
    }
}; 

exports.obtenerHoraLimite = async (req, res) => {
    try {
        await Configuracion.sync();
        const config = await Configuracion.findByPk('hora_limite');
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