const { MovimientoKardex, Producto, Usuario, sequelize } = require('../models');

// Registrar un movimiento manualmente o mediante ganchos del sistema
exports.registrarMovimiento = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { productoId, tipo, cantidad, costo_unitario, sucursal_origen, sucursal_destino, referencia, usuarioId } = req.body;

        const producto = await Producto.findByPk(productoId, { transaction: t });
        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        let stockAnterior = parseInt(producto.stock);
        let costoAnterior = parseFloat(producto.costo_compra || 0);
        
        let nuevoStock = stockAnterior;
        let nuevoCostoPromedio = costoAnterior;
        const cantMov = parseInt(cantidad);
        const costUnit = parseFloat(costo_unitario || costoAnterior);

        if (tipo === 'ENTRADA' || tipo === 'DEVOLUCION') {
            const costoTotalActual = stockAnterior * costoAnterior;
            const costoTotalNuevo = cantMov * costUnit;
            nuevoStock += cantMov;
            nuevoCostoPromedio = nuevoStock > 0 ? (costoTotalActual + costoTotalNuevo) / nuevoStock : costUnit;
        } else if (tipo === 'SALIDA' || tipo === 'AJUSTE') {
            nuevoStock -= cantMov;
        }

        // Actualizamos el producto global (Bodega Central)
        await producto.update({
            stock: Math.max(0, nuevoStock),
            costo_compra: nuevoCostoPromedio
        }, { transaction: t });

        const valorTotal = cantMov * costUnit;

        const movimiento = await MovimientoKardex.create({
            productoId, usuarioId, tipo, cantidad: cantMov,
            costo_unitario: costUnit, valor_total: valorTotal,
            stock_anterior: stockAnterior, // 🔥 MEMORIA
            costo_anterior: costoAnterior, // 🔥 MEMORIA
            saldo_stock_momento: Math.max(0, nuevoStock),
            saldo_costo_promedio: nuevoCostoPromedio,
            sucursal_origen, sucursal_destino, referencia
        }, { transaction: t });

        await t.commit();
        res.status(201).json(movimiento);
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ error: "Error al procesar movimiento en Kardex" });
    }
};

// Consultar la trazabilidad completa del inventario
exports.obtenerHistorialKardex = async (req, res) => {
    try {
        const historial = await MovimientoKardex.findAll({
            order: [['createdAt', 'DESC']],
            include: [
                { model: Producto, as: 'Producto', attributes: ['nombre', 'proveedor'] },
                { model: Usuario, as: 'Usuario', attributes: ['nombre', 'rol'] }
            ]
        });
        res.json(historial);
    } catch (error) {
        res.status(500).json({ error: "Error al consultar el Kardex valorizado" });
    }
};