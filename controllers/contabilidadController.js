const { Transaccion, Producto, Pedido } = require('../models');

// 1. Obtener Resumen Financiero (KPIs)
exports.obtenerResumen = async (req, res) => {
    try {
        // Aseguramos que la tabla exista
        await Transaccion.sync(); 

        // Ingresos totales (convertidos a Número de forma segura)
        const sumaIngresos = await Transaccion.sum('monto', { where: { tipo: 'INGRESO' } });
        const ingresos = Number(sumaIngresos) || 0;
        
        // Egresos totales
        const sumaEgresos = await Transaccion.sum('monto', { where: { tipo: 'EGRESO' } });
        const egresos = Number(sumaEgresos) || 0;
        
        // Ganancia Neta
        const balance = ingresos - egresos;

        // Valor del Inventario actual (Stock * Costo de Compra)
        const productos = await Producto.findAll();
        let valorInventario = 0;
        productos.forEach(p => {
            const stock = Number(p.stock) || 0;
            const costo = Number(p.costo_compra) || 0;
            valorInventario += (stock * costo);
        });

        res.json({
            ingresos,
            egresos,
            balance,
            valorInventario
        });
    } catch (error) {
        console.error("❌ Error al obtener resumen contable:", error);
        res.status(500).json({ error: "Error al calcular finanzas" });
    }
};

// 2. Obtener Historial de Transacciones (Libro Mayor)
exports.obtenerTransacciones = async (req, res) => {
    try {
        await Transaccion.sync();
        const transacciones = await Transaccion.findAll({
            order: [['fecha', 'DESC']],
            limit: 100 // Traemos las últimas 100 para no saturar
        });
        res.json(transacciones);
    } catch (error) {
        console.error("❌ Error al obtener transacciones:", error);
        res.status(500).json({ error: "Error al obtener transacciones" });
    }
};

// 3. Registrar un Movimiento Manual (Ingreso o Egreso)
exports.registrarGasto = async (req, res) => {
    try {
        // 🔥 AHORA LEEMOS EL 'TIPO' Y LA 'FECHA' DESDE REACT 🔥
        const { monto, descripcion, categoria, tipo, fecha } = req.body;
        
        if (!monto || !descripcion) {
            return res.status(400).json({ error: "Monto y descripción son obligatorios" });
        }

        await Transaccion.sync();
        const nuevaTransaccion = await Transaccion.create({
            tipo: tipo || 'EGRESO', // Si no envían nada, asume que es un gasto
            monto: parseFloat(monto),
            descripcion,
            categoria: categoria || 'General',
            fecha: fecha ? new Date(fecha) : new Date() // Guarda la fecha enviada o la actual
        });

        res.status(201).json({ mensaje: "Movimiento registrado en contabilidad", transaccion: nuevaTransaccion });
    } catch (error) {
        console.error("❌ Error al registrar movimiento:", error);
        res.status(500).json({ error: "Error al registrar el movimiento" });
    }
};

// 4. 🔥 NUEVO: ACTUALIZAR UNA TRANSACCIÓN 🔥
exports.actualizarTransaccion = async (req, res) => {
    try {
        const { id } = req.params;
        const transaccion = await Transaccion.findByPk(id);
        
        if (!transaccion) {
            return res.status(404).json({ error: 'Transacción no encontrada' });
        }
        
        // Actualiza la información en la base de datos
        await transaccion.update(req.body);
        
        res.json({ mensaje: 'Transacción actualizada', transaccion });
    } catch (error) {
        console.error("❌ Error al actualizar transacción:", error);
        res.status(500).json({ error: 'Error al actualizar la transacción' });
    }
};

// 5. 🔥 NUEVO: ELIMINAR UNA TRANSACCIÓN 🔥
exports.eliminarTransaccion = async (req, res) => {
    try {
        const { id } = req.params;
        const transaccion = await Transaccion.findByPk(id);
        
        if (!transaccion) {
            return res.status(404).json({ error: 'Transacción no encontrada' });
        }

        await transaccion.destroy();
        res.json({ mensaje: 'Transacción eliminada correctamente' });
    } catch (error) {
        console.error("❌ Error al eliminar transacción:", error);
        res.status(500).json({ error: 'Error al eliminar la transacción' });
    }
};