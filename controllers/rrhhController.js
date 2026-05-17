const { Empleado, Asistencia } = require('../models');

// Gestión de personal
exports.obtenerEmpleados = async (req, res) => {
    try {
        const empleados = await Empleado.findAll({ order: [['nombre', 'ASC']] });
        res.json(empleados);
    } catch (error) { res.status(500).json({ error: "Error al obtener planilla" }); }
};

exports.crearEmpleado = async (req, res) => {
    try {
        const nuevo = await Empleado.create(req.body);
        res.status(201).json(nuevo);
    } catch (error) { res.status(400).json({ error: "Error al registrar empleado (¿Documento duplicado?)" }); }
};

// Control de reloj marcador (Entradas y Salidas)
exports.registrarAsistencia = async (req, res) => {
    try {
        const { empleadoId, tipo, novedad } = req.body;
        const hoy = new Date().toISOString().split('T')[0];
        const horaActual = new Date().toLocaleTimeString('en-US', { hour12: false });

        if (tipo === 'ENTRADA') {
            const existe = await Asistencia.findOne({ where: { empleadoId, fecha: hoy } });
            if (existe) return res.status(400).json({ error: "El empleado ya registró entrada hoy" });

            const registro = await Asistencia.create({ empleadoId, fecha: hoy, hora_entrada: horaActual, novedad });
            return res.status(201).json(registro);
        } else if (tipo === 'SALIDA') {
            const asistencia = await Asistencia.findOne({ where: { empleadoId, fecha: hoy, hora_salida: null } });
            if (!asistencia) return res.status(404).json({ error: "No se encontró registro de entrada activo para hoy" });

            // Calcular horas aproximadas trabajadas
            const [he, me] = asistencia.hora_entrada.split(':').map(Number);
            const [hs, ms] = horaActual.split(':').map(Number);
            const calculoHoras = (hs + ms/60) - (he + me/60);

            await asistencia.update({ hora_salida: horaActual, horas_trabajadas: Math.max(0, calculoHoras).toFixed(2) });
            return res.json(asistencia);
        }
    } catch (error) {
        res.status(500).json({ error: "Error en el reloj biométrico" });
    }
};

exports.obtenerAsistencias = async (req, res) => {
    try {
        const registros = await Asistencia.findAll({
            order: [['fecha', 'DESC'], ['hora_entrada', 'DESC']],
            include: [{ model: Empleado, as: 'Empleado', attributes: ['nombre', 'cargo'] }]
        });
        res.json(registros);
    } catch (error) { res.status(500).json({ error: "Error al extraer asistencias" }); }
};