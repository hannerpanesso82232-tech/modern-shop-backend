const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Usuario, Direccion, Configuracion } = require('../models');

// --- REGISTRO ---
exports.registrar = async (req, res) => {
    try {
        const { nombre, cedula, email, password, rol, telefono, fecha_nacimiento, ciudad, direccion } = req.body;
        if (!cedula) return res.status(400).json({ error: "La cédula es obligatoria" });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const nuevoUsuario = await Usuario.create({
            nombre, cedula, email, password_hash: passwordHash, 
            rol: rol || 'CLIENTE', telefono, fechaNacimiento: fecha_nacimiento,
            ciudad, direccion   
        });

        res.status(201).json({ mensaje: "Usuario creado con éxito", id: nuevoUsuario.id });
    } catch (error) {
        console.error("Error en Registro:", error);
        res.status(400).json({ error: "La cédula ya existe o datos inválidos" });
    }
};

// --- LOGIN ---
exports.login = async (req, res) => {
    try {
        const { cedula, password } = req.body;
        if (!cedula) return res.status(400).json({ mensaje: "Debes ingresar tu cédula" });

        const usuario = await Usuario.findOne({ where: { cedula } });

        if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
            return res.status(401).json({ mensaje: "Cédula o contraseña incorrectas" });
        }

        const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.json({ 
            token, 
            usuario: {
                id: usuario.id, nombre: usuario.nombre, cedula: usuario.cedula,
                email: usuario.email, rol: usuario.rol, telefono: usuario.telefono,
                fecha_nacimiento: usuario.fechaNacimiento, ciudad: usuario.ciudad, direccion: usuario.direccion  
            }
        });
    } catch (error) {
        console.error("Error en Login:", error);
        res.status(500).json({ error: "Error interno" });
    }
};

// --- ACTUALIZAR PERFIL (CLIENTE) ---
exports.actualizarPerfil = async (req, res) => {
    try {
        const { nombre, telefono, fecha_nacimiento, direccion, ciudad } = req.body; 
        const usuarioId = req.user.id; 

        const usuario = await Usuario.findByPk(usuarioId);
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        await usuario.update({
            nombre: nombre || usuario.nombre, telefono: telefono || usuario.telefono,
            fechaNacimiento: fecha_nacimiento || usuario.fechaNacimiento,
            direccion: direccion || usuario.direccion, ciudad: ciudad || usuario.ciudad 
        });

        res.json({ 
            mensaje: "Perfil actualizado",
            usuario: {
                id: usuario.id, nombre: usuario.nombre, cedula: usuario.cedula,
                email: usuario.email, rol: usuario.rol, telefono: usuario.telefono,
                fecha_nacimiento: usuario.fechaNacimiento, direccion: usuario.direccion, ciudad: usuario.ciudad
            }
        });
    } catch (error) {
        console.error("Error al actualizar perfil:", error);
        res.status(500).json({ error: "Error al actualizar los datos en el servidor" });
    }
};

// --- GESTIÓN DE DIRECCIONES ---
exports.getDirecciones = async (req, res) => {
    try {
        const direcciones = await Direccion.findAll({ where: { usuarioId: req.user.id }, order: [['createdAt', 'DESC']] });
        res.json(direcciones);
    } catch (error) { res.status(500).json({ error: "Error al obtener direcciones" }); }
};

exports.addDireccion = async (req, res) => {
    try {
        const { etiqueta, direccion, ciudad } = req.body;
        const nuevaDireccion = await Direccion.create({ etiqueta, direccion, ciudad, usuarioId: req.user.id });
        res.status(201).json(nuevaDireccion);
    } catch (error) { res.status(400).json({ error: "Error al guardar la dirección" }); }
};

exports.deleteDireccion = async (req, res) => {
    try {
        const { id } = req.params;
        const borrado = await Direccion.destroy({ where: { id, usuarioId: req.user.id } });
        if (borrado) { res.json({ mensaje: "Dirección eliminada" }); } 
        else { res.status(404).json({ error: "Dirección no encontrada" }); }
    } catch (error) { res.status(500).json({ error: "Error al eliminar dirección" }); }
};

// --- FUNCIONES EXCLUSIVAS DEL ADMINISTRADOR ---
exports.getUsuarios = async (req, res) => {
    try {
        const usuarios = await Usuario.findAll({ attributes: { exclude: ['password_hash'] }, order: [['id', 'DESC']] });
        res.json(usuarios);
    } catch (error) { res.status(500).json({ error: "Error al obtener la lista de clientes" }); }
};

exports.resetPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        if (!password || password.length < 6) return res.status(400).json({ error: "Mínimo 6 caracteres" });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        await Usuario.update({ password_hash: passwordHash }, { where: { id } });
        res.json({ mensaje: "Contraseña actualizada con éxito" });
    } catch (error) { res.status(500).json({ error: "Error al actualizar contraseña" }); }
};

exports.eliminarUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.user.id) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });

        const usuario = await Usuario.findByPk(id);
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        await usuario.destroy();

        // 🔥 AVISAR SI EL USUARIO ESTABA CONECTADO PARA SACARLO 🔥
        const io = req.app.get('socketio') || req.io;
        if(io) io.emit('usuarioEliminado', id);

        res.json({ mensaje: "Usuario eliminado del sistema" });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(400).json({ error: "No se puede eliminar un usuario que ya tiene pedidos." });
    }
};

exports.actualizarUsuarioPorAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, cedula, email, rol, telefono, ciudad, direccion } = req.body;

        const usuario = await Usuario.findByPk(id);
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        if (cedula && cedula !== usuario.cedula) {
            const cedulaExiste = await Usuario.findOne({ where: { cedula } });
            if (cedulaExiste) return res.status(400).json({ error: "Esa cédula ya está asignada a otro cliente." });
        }

        await usuario.update({
            nombre: nombre || usuario.nombre,
            cedula: cedula || usuario.cedula,
            email: email || usuario.email,
            rol: rol || usuario.rol,
            telefono: telefono || usuario.telefono,
            ciudad: ciudad || usuario.ciudad,
            direccion: direccion || usuario.direccion
        });

        // 🔥 MAGIA: AVISAR AL CLIENTE ESPECÍFICO QUE SUS DATOS FUERON ACTUALIZADOS 🔥
        const io = req.app.get('socketio') || req.io;
        if(io) io.emit('usuarioEditado', usuario);

        res.json({ mensaje: "Información del cliente actualizada con éxito" });
    } catch (error) {
        console.error("Error al editar usuario por admin:", error);
        res.status(500).json({ error: "Error interno al actualizar datos del usuario" });
    }
};

exports.recuperarPassword = async (req, res) => {
    try {
        const { cedula, email } = req.body;
        if (!cedula || !email) return res.status(400).json({ error: "Faltan datos" });

        const usuario = await Usuario.findOne({ where: { cedula, email } });
        if (!usuario) return res.status(404).json({ error: "Los datos no coinciden" });

        const passwordTemporal = "Modern" + Math.floor(1000 + Math.random() * 9000);
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordTemporal, salt);

        await usuario.update({ password_hash: passwordHash });

        res.json({ mensaje: "Identidad verificada.", passwordTemporal: passwordTemporal });
    } catch (error) {
        console.error("Error al recuperar contraseña:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// --- WHATSAPP DINÁMICO ---
exports.getWhatsapp = async (req, res) => {
    try {
        await Configuracion.sync();
        const conf = await Configuracion.findOne({ where: { clave: 'whatsapp' } });
        res.json({ whatsapp: conf ? conf.valor : '573000000000' });
    } catch (error) { res.json({ whatsapp: '573000000000' }); }
};

exports.updateWhatsapp = async (req, res) => {
    try {
        await Configuracion.sync();
        const { whatsapp } = req.body;
        
        let conf = await Configuracion.findOne({ where: { clave: 'whatsapp' } });
        if (conf) { await conf.update({ valor: whatsapp }); } 
        else { await Configuracion.create({ clave: 'whatsapp', valor: whatsapp }); }
        
        res.json({ mensaje: 'Número de WhatsApp guardado con éxito' });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar configuración' }); }
};