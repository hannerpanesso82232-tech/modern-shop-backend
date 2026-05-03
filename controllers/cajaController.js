const { SesionCaja, Usuario } = require('../models');

// 1. Obtener la sesión activa del día (si existe)
exports.obtenerCajaActiva = async (req, res) => {
    try {
        const caja = await SesionCaja.findOne({
            where: { estado: 'ABIERTA' },
            include: [{ model: Usuario, as: 'Cajero', attributes: ['nombre', 'rol'] }]
        });
        res.json(caja || null); // Si no hay caja abierta, devuelve null
    } catch (error) { 
        res.status(500).json({ error: "Error al buscar caja activa" }); 
    }
};

// 2. Abrir Caja
exports.abrirCaja = async (req, res) => {
    try {
        const existe = await SesionCaja.findOne({ where: { estado: 'ABIERTA' } });
        if (existe) return res.status(400).json({ error: "Ya existe una sesión de caja abierta." });

        const nuevaCaja = await SesionCaja.create({
            usuarioId: req.body.usuarioId, 
            saldo_inicial: req.body.saldo_inicial || 0,
            estado: 'ABIERTA',
            fecha_apertura: new Date()
        });
        res.status(201).json(nuevaCaja);
    } catch (error) { 
        res.status(500).json({ error: "Error al abrir la caja" }); 
    }
};

// 3. Cerrar Caja (Arqueo y Auditoría)
exports.cerrarCaja = async (req, res) => {
    try {
        const caja = await SesionCaja.findByPk(req.params.id);
        if (!caja) return res.status(404).json({ error: "Sesión de caja no encontrada" });
        if (caja.estado === 'CERRADA') return res.status(400).json({ error: "La caja ya fue cerrada anteriormente." });

        const { 
            ingresos_efectivo, ingresos_transferencia, egresos_efectivo, 
            efectivo_esperado, efectivo_declarado, descuadre, observaciones 
        } = req.body;

        await caja.update({
            fecha_cierre: new Date(),
            ingresos_efectivo: ingresos_efectivo || 0,
            ingresos_transferencia: ingresos_transferencia || 0,
            egresos_efectivo: egresos_efectivo || 0,
            efectivo_esperado: efectivo_esperado || 0,
            efectivo_declarado: efectivo_declarado || 0,
            descuadre: descuadre || 0,
            observaciones: observaciones || '',
            estado: 'CERRADA'
        });

        res.json(caja);
    } catch (error) { 
        res.status(500).json({ error: "Error al realizar el cierre de caja" }); 
    }
};

// 4. Historial de Cierres
exports.historialCierres = async (req, res) => {
    try {
        const historial = await SesionCaja.findAll({
            order: [['fecha_apertura', 'DESC']],
            include: [{ model: Usuario, as: 'Cajero', attributes: ['nombre', 'rol'] }]
        });
        res.json(historial);
    } catch (error) { 
        res.status(500).json({ error: "Error al cargar el historial de cajas" }); 
    }
};