const { Transaccion, Producto, Pedido, Credito, Abono, sequelize } = require('../models');
const { Op } = require('sequelize');

// 1. Obtener Resumen Financiero (KPIs)
exports.obtenerResumen = async (req, res) => {
    try {
        await Transaccion.sync(); 

        const sumaIngresos = await Transaccion.sum('monto', { where: { tipo: 'INGRESO' } });
        const ingresos = Number(sumaIngresos) || 0;
        
        const sumaEgresos = await Transaccion.sum('monto', { where: { tipo: 'EGRESO' } });
        const egresos = Number(sumaEgresos) || 0;
        
        const balance = ingresos - egresos;

        const productos = await Producto.findAll();
        let valorInventario = 0;
        productos.forEach(p => {
            const stock = Number(p.stock) || 0;
            const costo = Number(p.costo_compra) || 0;
            valorInventario += (stock * costo);
        });

        res.json({ ingresos, egresos, balance, valorInventario });
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
            limit: 100 
        });
        res.json(transacciones);
    } catch (error) {
        console.error("❌ Error al obtener transacciones:", error);
        res.status(500).json({ error: "Error al obtener transacciones" });
    }
};

// 3. Registrar un Movimiento Manual
exports.registrarGasto = async (req, res) => {
    try {
        const { monto, descripcion, categoria, tipo, fecha } = req.body;
        
        if (!monto || !descripcion) {
            return res.status(400).json({ error: "Monto y descripción son obligatorios" });
        }

        await Transaccion.sync();
        const nuevaTransaccion = await Transaccion.create({
            tipo: tipo || 'EGRESO', 
            monto: parseFloat(monto),
            descripcion,
            categoria: categoria || 'General',
            fecha: fecha ? new Date(fecha) : new Date() 
        });

        res.status(201).json({ mensaje: "Movimiento registrado en contabilidad", transaccion: nuevaTransaccion });
    } catch (error) {
        console.error("❌ Error al registrar movimiento:", error);
        res.status(500).json({ error: "Error al registrar el movimiento" });
    }
};

// 4. 🔥 ACTUALIZAR UNA TRANSACCIÓN Y AJUSTAR CARTERA 🔥
exports.actualizarTransaccion = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { monto, descripcion, categoria, tipo, fecha } = req.body;
        
        const transaccion = await Transaccion.findByPk(id, { transaction: t });
        
        if (!transaccion) {
            await t.rollback();
            return res.status(404).json({ error: 'Transacción no encontrada' });
        }

        const nuevoMonto = parseFloat(monto);
        const montoAntiguo = parseFloat(transaccion.monto);
        const diferenciaMonto = nuevoMonto - montoAntiguo;

        // 🔥 LÓGICA INTELIGENTE: ¿Es un Abono a Cartera editado? 🔥
        const esAbono = transaccion.descripcion && transaccion.descripcion.includes('(Crédito #');
        
        if (esAbono && diferenciaMonto !== 0) {
            const match = transaccion.descripcion.match(/\(Crédito #(\d+)\)/);
            if (match && match[1]) {
                const creditoId = parseInt(match[1]);
                const credito = await Credito.findByPk(creditoId, { transaction: t });
                
                if (credito) {
                    // 1. Buscar el Abono original para actualizarle el monto
                    const fechaInicio = new Date(transaccion.fecha);
                    fechaInicio.setHours(0,0,0,0);
                    const fechaFin = new Date(transaccion.fecha);
                    fechaFin.setHours(23,59,59,999);

                    const abonoRelacionado = await Abono.findOne({
                        where: {
                            creditoId: credito.id,
                            monto: montoAntiguo,
                            createdAt: { [Op.between]: [fechaInicio, fechaFin] }
                        },
                        transaction: t
                    });

                    if (abonoRelacionado) {
                        await abonoRelacionado.update({ monto: nuevoMonto }, { transaction: t });
                    }

                    // 2. Ajustar la deuda del cliente con la diferencia matemática
                    // Si antes pagó 500 y ahora editas a 200 (Diferencia = -300) -> Su deuda SUBE 300.
                    // Si antes pagó 200 y ahora editas a 500 (Diferencia = +300) -> Su deuda BAJA 300.
                    const nuevoSaldoCredito = parseFloat(credito.saldo) - diferenciaMonto;
                    
                    await credito.update({
                        saldo: nuevoSaldoCredito,
                        estado: nuevoSaldoCredito <= 0 ? 'PAGADO' : 'VIGENTE'
                    }, { transaction: t });
                }
            }
        }

        // Finalmente, actualizamos la información en el Libro Mayor
        await transaccion.update({
            monto: nuevoMonto,
            descripcion: descripcion || transaccion.descripcion,
            categoria: categoria || transaccion.categoria,
            tipo: tipo || transaccion.tipo,
            fecha: fecha ? new Date(fecha) : transaccion.fecha
        }, { transaction: t });
        
        await t.commit();
        res.json({ mensaje: 'Transacción y cartera actualizadas correctamente', transaccion });
    } catch (error) {
        await t.rollback();
        console.error("❌ Error al actualizar transacción:", error);
        res.status(500).json({ error: 'Error al actualizar la transacción' });
    }
};

// 5. ELIMINAR UNA TRANSACCIÓN Y REVERTIR ABONOS DE CARTERA
exports.eliminarTransaccion = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;
        const transaccion = await Transaccion.findByPk(id, { transaction: t });
        
        if (!transaccion) {
            await t.rollback();
            return res.status(404).json({ error: 'Transacción no encontrada' });
        }

        const esAbono = transaccion.descripcion && transaccion.descripcion.includes('(Crédito #');
        
        if (esAbono) {
            const match = transaccion.descripcion.match(/\(Crédito #(\d+)\)/);
            if (match && match[1]) {
                const creditoId = parseInt(match[1]);
                const credito = await Credito.findByPk(creditoId, { transaction: t });
                
                if (credito) {
                    const fechaInicio = new Date(transaccion.fecha);
                    fechaInicio.setHours(0,0,0,0);
                    const fechaFin = new Date(transaccion.fecha);
                    fechaFin.setHours(23,59,59,999);

                    const abonoParaRevertir = await Abono.findOne({
                        where: {
                            creditoId: credito.id,
                            monto: transaccion.monto,
                            createdAt: { [Op.between]: [fechaInicio, fechaFin] }
                        },
                        transaction: t
                    });

                    if (abonoParaRevertir) {
                        await abonoParaRevertir.destroy({ transaction: t });
                    }

                    const nuevoSaldo = parseFloat(credito.saldo) + parseFloat(transaccion.monto);
                    
                    await credito.update({
                        saldo: nuevoSaldo,
                        estado: nuevoSaldo > 0 ? 'VIGENTE' : 'PAGADO'
                    }, { transaction: t });
                }
            }
        }

        await transaccion.destroy({ transaction: t });
        await t.commit();
        res.json({ mensaje: 'Transacción eliminada y cartera revertida correctamente' });
    } catch (error) {
        await t.rollback();
        console.error("❌ Error al eliminar transacción:", error);
        res.status(500).json({ error: 'Error al eliminar la transacción y revertir' });
    }
};