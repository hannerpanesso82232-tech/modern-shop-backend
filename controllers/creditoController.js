const { Credito, Abono, Usuario, Transaccion, sequelize } = require('../models');

// 1. Obtener toda la cartera (Créditos y sus abonos) - SOLO PARA ADMIN
exports.obtenerCreditos = async (req, res) => {
    try {
        const creditos = await Credito.findAll({
            include: [
                { model: Usuario, as: 'Usuario', attributes: ['nombre', 'cedula', 'telefono'] },
                { model: Abono, as: 'Abonos' }
            ],
            order: [
                ['estado', 'DESC'], // VIGENTE primero, PAGADO después
                ['createdAt', 'DESC']
            ]
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

        if (!usuarioId || !monto_total) {
            return res.status(400).json({ error: "Faltan datos obligatorios (Usuario o Monto)" });
        }

        const nuevoCredito = await Credito.create({
            usuarioId,
            monto_total: parseFloat(monto_total),
            saldo: parseFloat(monto_total),
            descripcion: descripcion || 'Crédito de tienda',
            // 🔥 Guardamos la fecha de vencimiento 🔥
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

// 3. 🔥 Registrar un Abono (La Magia Financiera) 🔥
exports.registrarAbono = async (req, res) => {
    // Usamos una transacción para asegurar que el Abono y el Ingreso Contable se guarden juntos
    const t = await sequelize.transaction();

    try {
        const { id } = req.params; // ID del crédito
        const { monto, nota } = req.body;
        const montoAbono = parseFloat(monto);

        const credito = await Credito.findByPk(id, { include: [{ model: Usuario, as: 'Usuario' }] });

        if (!credito) throw new Error("Crédito no encontrado");
        if (credito.estado === 'PAGADO') throw new Error("Este crédito ya está pagado en su totalidad");
        if (montoAbono > credito.saldo) throw new Error(`El abono supera la deuda actual ($${credito.saldo})`);

        // 1. Registrar el Abono
        const nuevoAbono = await Abono.create({
            creditoId: credito.id,
            monto: montoAbono,
            nota: nota || 'Abono a deuda'
        }, { transaction: t });

        // 2. Actualizar el saldo del Crédito
        const nuevoSaldo = parseFloat(credito.saldo) - montoAbono;
        const estadoFinal = nuevoSaldo <= 0 ? 'PAGADO' : 'VIGENTE';
        
        await credito.update({ 
            saldo: nuevoSaldo, 
            estado: estadoFinal 
        }, { transaction: t });

        // 3. Registrar el ingreso en el Libro Mayor (Contabilidad)
        await Transaccion.create({
            tipo: 'INGRESO',
            monto: montoAbono,
            descripcion: `Abono Cartera: ${credito.Usuario.nombre} (Crédito #${credito.id})`,
            categoria: 'Cartera', // Nueva categoría para identificar pagos de deudas
            fecha: new Date()
        }, { transaction: t });

        // Si todo salió bien, confirmamos la transacción en la Base de Datos
        await t.commit();

        res.json({ 
            mensaje: "Abono registrado correctamente", 
            saldo_restante: nuevoSaldo, 
            estado: estadoFinal,
            abono: nuevoAbono
        });

    } catch (error) {
        // Si algo falla, revertimos todo para no crear dinero fantasma
        await t.rollback();
        console.error("❌ Error en registrarAbono:", error.message);
        res.status(400).json({ error: error.message || "Error al procesar el abono" });
    }
};

// 4. Eliminar un crédito (Solo si fue un error)
exports.eliminarCredito = async (req, res) => {
    try {
        const { id } = req.params;
        const credito = await Credito.findByPk(id);
        
        if (!credito) return res.status(404).json({ error: "Crédito no encontrado" });
        
        // Al borrar el crédito, se borrarán los abonos por cascada (si lo configuraste, si no, es bueno hacerlo manual)
        await Abono.destroy({ where: { creditoId: id } });
        await credito.destroy();

        res.json({ mensaje: "Crédito eliminado del sistema" });
    } catch (error) {
        console.error("❌ Error en eliminarCredito:", error);
        res.status(500).json({ error: "Error al eliminar el crédito" });
    }
};

// 5. 🔥 NUEVO: Obtener Mi Crédito (Para el Cliente) 🔥
exports.obtenerMiCredito = async (req, res) => {
    try {
        const usuarioId = req.user.id;

        // Buscar todos los créditos asociados a este usuario
        const creditos = await Credito.findAll({
            where: { usuarioId: usuarioId },
            include: [
                { 
                    model: Abono, 
                    as: 'Abonos',
                    order: [['createdAt', 'DESC']] // Abonos más recientes primero
                }
            ],
            order: [['createdAt', 'DESC']] // Créditos más recientes primero
        });

        // Obtener el límite de crédito del usuario
        const usuario = await Usuario.findByPk(usuarioId, { attributes: ['limite_credito', 'dias_credito'] });

        // Calcular la deuda total actual (Solo créditos VIGENTES)
        const deudaTotal = creditos
            .filter(c => c.estado === 'VIGENTE')
            .reduce((suma, c) => suma + parseFloat(c.saldo), 0);

        res.json({
            limite_credito: parseFloat(usuario.limite_credito || 0),
            dias_credito: parseInt(usuario.dias_credito || 30),
            deuda_total: deudaTotal,
            historial_creditos: creditos
        });
    } catch (error) {
        console.error("❌ Error en obtenerMiCredito:", error);
        res.status(500).json({ error: "Error al obtener la información de crédito." });
    }
};