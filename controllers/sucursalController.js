const { Sucursal, InventarioSucursal, Producto, MovimientoKardex, sequelize } = require('../models');

// 1. Crear una nueva sucursal física
exports.crearSucursal = async (req, res) => {
    try {
        const { nombre, direccion, ciudad, telefono, es_principal } = req.body;
        
        // Si se marca como principal, aseguramos que sea la única central
        if (es_principal) {
            await Sucursal.update({ es_principal: false }, { where: {} });
        }

        const nueva = await Sucursal.create({ nombre, direccion, ciudad, telefono, es_principal });
        res.status(201).json(nueva);
    } catch (error) {
        res.status(400).json({ error: "Error al crear la sucursal (¿Nombre duplicado?)" });
    }
};

// 2. Listar todas las sucursales
exports.listarSucursales = async (req, res) => {
    try {
        const sucursales = await Sucursal.findAll({ order: [['id', 'ASC']] });
        res.json(sucursales);
    } catch (error) {
        res.status(500).json({ error: "Error al listar sucursales" });
    }
};

// 3. TRANSFERENCIAS ENTRE TIENDAS (Mover inventario y trazar en Kardex)
exports.transferirInventario = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { productoId, sucursalOrigenId, sucursalDestinoId, cantidad } = req.body;
        const cantMov = parseInt(cantidad);

        if (isNaN(cantMov) || cantMov <= 0) {
            return res.status(400).json({ error: "Cantidad no válida" });
        }

        const producto = await Producto.findByPk(productoId, { transaction: t });
        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        const costoVigente = parseFloat(producto.costo_compra || 0);
        let nombreOrigen = 'Bodega Central';
        let nombreDestino = '';

        // --- MANEJO DEL ORIGEN ---
        if (sucursalOrigenId) {
            // El origen es una sucursal física
            const origenItem = await InventarioSucursal.findOne({
                where: { productoId, sucursalId: sucursalOrigenId },
                include: [{ model: Sucursal, as: 'Sucursal' }],
                transaction: t
            });

            if (!origenItem || origenItem.stock_local < cantMov) {
                await t.rollback();
                return res.status(400).json({ error: `Stock insuficiente en la sucursal de origen` });
            }

            nombreOrigen = origenItem.Sucursal?.nombre || `Sucursal #${sucursalOrigenId}`;
            await origenItem.update({ stock_local: origenItem.stock_local - cantMov }, { transaction: t });
        } else {
            // El origen es la Bodega Central (tabla de productos global)
            if (producto.stock < cantMov) {
                await t.rollback();
                return res.status(400).json({ error: "Stock insuficiente en Bodega Central" });
            }
            await producto.update({ stock: producto.stock - cantMov }, { transaction: t });
        }

        // --- MANEJO DEL DESTINO ---
        const sucursalDestino = await Sucursal.findByPk(sucursalDestinoId, { transaction: t });
        if (!sucursalDestino) {
            await t.rollback();
            return res.status(404).json({ error: "Sucursal de destino no existe" });
        }
        nombreDestino = sucursalDestino.nombre;

        // Buscamos o creamos el nodo de inventario local en la tienda destino
        const [inventarioLocal, creado] = await InventarioSucursal.findOrCreate({
            where: { productoId, sucursalId: sucursalDestinoId },
            defaults: { stock_local: 0 },
            transaction: t
        });

        const stockAnteriorDestino = inventarioLocal.stock_local;
        const nuevoStockDestino = stockAnteriorDestino + cantMov;
        await inventarioLocal.update({ stock_local: nuevoStockDestino }, { transaction: t });

        // --- REGISTRO AUDITABLE EN KARDEX VALORIZADO ---
        await MovimientoKardex.create({
            productoId,
            usuarioId: req.user?.id || null,
            tipo: 'TRASLADO',
            cantidad: cantMov,
            costo_unitario: costoVigente,
            valor_total: cantMov * costoVigente,
            stock_anterior: stockAnteriorDestino,
            costo_anterior: costoVigente,
            saldo_stock_momento: nuevoStockDestino, // Foto local del destino
            saldo_costo_promedio: costoVigente,
            sucursal_origen: nombreOrigen,
            sucursal_destino: nombreDestino,
            referencia: `Traslado Interno de Mercancía`
        }, { transaction: t });

        await t.commit();
        res.json({ mensaje: `Transferencia completada: ${cantMov} unidades movidas con éxito hacia ${nombreDestino}.` });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ error: "Error en la operación logística de traslado" });
    }
};

// 4. Obtener el inventario específico de una sucursal
exports.obtenerInventarioSucursal = async (req, res) => {
    try {
        const { id } = req.params;
        const inventario = await InventarioSucursal.findAll({
            where: { sucursalId: id },
            include: [{ model: Producto, as: 'Producto' }]
        });
        res.json(inventario);
    } catch (error) {
        res.status(500).json({ error: "Error al extraer inventario de la sucursal" });
    }
};