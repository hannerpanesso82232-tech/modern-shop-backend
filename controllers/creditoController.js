const { Credito, Abono, Usuario, Transaccion, sequelize } = require('../models');

// 1. Obtener toda la cartera (Créditos y sus abonos) - ADMIN
exports.obtenerCreditos = async (req, res) => {
    try {
        const creditos = await Credito.findAll({
            include: [
                { model: Usuario, as: 'Usuario', attributes: ['nombre', 'cedula', 'telefono'] },
                { model: Abono, as: 'Abonos' }
            ],
            order: [['estado', 'DESC'], ['createdAt', 'DESC']]
        });
        res.json(creditos);
    } catch (error) {
        console.error("❌ Error en obtenerCreditos:", error);
        res.status(500).json({ error: "Error al obtener la cartera" });
    }
};

// 2. Crear un nuevo crédito manualmente (Fiar)
exports.crearCredito = async (req, res) => {
    try {
        const { usuarioId, monto_total, descripcion, fecha_vencimiento } = req.body;
        if (!usuarioId || !monto_total) return res.status(400).json({ error: "Faltan datos obligatorios" });

        const nuevoCredito = await Credito.create({
            usuarioId,
            monto_total: parseFloat(monto_total),
            saldo: parseFloat(monto_total),
            descripcion: descripcion || 'Crédito de tienda',
            fecha_vencimiento: fecha_vencimiento || new Date(new Date().setDate(new Date().getDate() + 30))
        });

        const creditoCompleto = await Credito.findByPk(nuevoCredito.id, {
            include: [{ model: Usuario, as: 'Usuario', attributes: ['nombre', 'cedula', 'telefono'] }]
        });
        res.status(201).json(creditoCompleto);
    } catch (error) {
        console.error("❌ Error en crearCredito:", error);
        res.status(500).json({ error: "Error al registrar el crédito" });
    }
};

// 3. Registrar un Abono
exports.registrarAbono = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { monto, nota } = req.body;
        const montoAbono = parseFloat(monto);

        const credito = await Credito.findByPk(id, { include: [{ model: Usuario, as: 'Usuario' }] });
        if (!credito) throw new Error("Crédito no encontrado");
        if (credito.estado === 'PAGADO') throw new Error("Este crédito ya está pagado");
        if (montoAbono > credito.saldo) throw new Error(`El abono supera la deuda ($${credito.saldo})`);

        const nuevoAbono = await Abono.create({ creditoId: credito.id, monto: montoAbono, nota: nota || 'Abono a deuda' }, { transaction: t });
        const nuevoSaldo = parseFloat(credito.saldo) - montoAbono;
        const estadoFinal = nuevoSaldo <= 0 ? 'PAGADO' : 'VIGENTE';
        
        await credito.update({ saldo: nuevoSaldo, estado: estadoFinal }, { transaction: t });
        
        await Transaccion.create({
            tipo: 'INGRESO', monto: montoAbono,
            descripcion: `Abono Cartera: ${credito.Usuario.nombre} (Crédito #${credito.id})`,
            categoria: 'Cartera', fecha: new Date()
        }, { transaction: t });

        await t.commit();
        res.json({ mensaje: "Abono registrado", saldo_restante: nuevoSaldo, estado: estadoFinal, abono: nuevoAbono });
    } catch (error) {
        await t.rollback();
        console.error("❌ Error en registrarAbono:", error.message);
        res.status(400).json({ error: error.message || "Error al procesar el abono" });
    }
};

// 4. Eliminar un crédito
exports.eliminarCredito = async (req, res) => {
    try {
        const { id } = req.params;
        const credito = await Credito.findByPk(id);
        if (!credito) return res.status(404).json({ error: "Crédito no encontrado" });
        await Abono.destroy({ where: { creditoId: id } });
        await credito.destroy();
        res.json({ mensaje: "Crédito eliminado del sistema" });
    } catch (error) {
        console.error("❌ Error en eliminarCredito:", error);
        res.status(500).json({ error: "Error al eliminar el crédito" });
    }
};

// 🔥 LA FUNCIÓN DEL CANDADO (Esta es la que faltaba para la ruta /toggle-credito) 🔥
exports.toggleCreditoUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const usuario = await Usuario.findByPk(id);
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        const nuevoEstado = usuario.credito_activo === false ? true : false;
        await usuario.update({ credito_activo: nuevoEstado });

        res.json({ 
            mensaje: `Crédito ${nuevoEstado ? 'Activado (Desbloqueado)' : 'Suspendido (Bloqueado)'} para ${usuario.nombre}`, 
            credito_activo: nuevoEstado 
        });
    } catch (error) { 
        console.error("❌ Error al modificar crédito:", error);
        res.status(500).json({ error: "Error al modificar el estado de crédito" }); 
    }
};

// 5. 🔥 OBTENER MI CRÉDITO Y MI HISTORIAL DE PAGOS (CLIENTE) 🔥
exports.obtenerMiCredito = async (req, res) => {
    try {
        const usuarioId = req.user.id;

        // 1. Buscamos al usuario de forma segura
        const usuario = await Usuario.findByPk(usuarioId);
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        // 2. Buscamos los créditos con sus abonos
        const creditos = await Credito.findAll({
            where: { usuarioId: usuarioId },
            include: [{ model: Abono, as: 'Abonos' }],
            order: [['createdAt', 'DESC']]
        });

        // 3. Calculamos la deuda total
        const deudaTotal = creditos
            .filter(c => c.estado === 'VIGENTE')
            .reduce((suma, c) => suma + parseFloat(c.saldo || 0), 0);

        // 4. 🔥 CREAMOS EL HISTORIAL GLOBAL DE PAGOS 🔥
        let historialPagos = [];
        creditos.forEach(cred => {
            if (cred.Abonos && cred.Abonos.length > 0) {
                cred.Abonos.forEach(abono => {
                    historialPagos.push({
                        id: abono.id,
                        monto: abono.monto,
                        nota: abono.nota,
                        fecha: abono.createdAt,
                        credito_descripcion: cred.descripcion
                    });
                });
            }
        });

        // Ordenamos los pagos del más reciente al más antiguo
        historialPagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // 5. Devolvemos todo estructurado al Perfil del Frontend
        res.json({
            limite_credito: parseFloat(usuario.limite_credito || 0),
            dias_credito: parseInt(usuario.dias_credito || 30),
            credito_activo: usuario.credito_activo !== false, // 🔥 Enviamos el estado de la cerradura 🔥
            deuda_total: deudaTotal,
            historial_creditos: creditos,
            historial_pagos: historialPagos // 🔥 AQUÍ ENVIAMOS EL HISTORIAL 🔥
        });

    } catch (error) {
        console.error("❌ Error en obtenerMiCredito:", error);
        res.status(500).json({ error: "Error interno al obtener crédito" });
    }
};