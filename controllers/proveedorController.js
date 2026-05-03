const { Proveedor } = require('../models');

exports.obtenerProveedores = async (req, res) => {
    try {
        const proveedores = await Proveedor.findAll({ order: [['nombre', 'ASC']] });
        res.json(proveedores);
    } catch (error) { 
        res.status(500).json({ error: "Error al obtener proveedores" }); 
    }
};

exports.crearProveedor = async (req, res) => {
    try {
        const nuevo = await Proveedor.create(req.body);
        res.status(201).json(nuevo);
    } catch (error) { 
        res.status(400).json({ error: "Error al crear proveedor (¿Nombre duplicado?)" }); 
    }
};

exports.actualizarProveedor = async (req, res) => {
    try {
        const prov = await Proveedor.findByPk(req.params.id);
        if (!prov) return res.status(404).json({ error: "No encontrado" });
        await prov.update(req.body);
        res.json(prov);
    } catch (error) { 
        res.status(400).json({ error: "Error al actualizar" }); 
    }
};

exports.eliminarProveedor = async (req, res) => {
    try {
        await Proveedor.destroy({ where: { id: req.params.id } });
        res.json({ mensaje: "Eliminado correctamente" });
    } catch (error) { 
        res.status(500).json({ error: "Error al eliminar" }); 
    }
};