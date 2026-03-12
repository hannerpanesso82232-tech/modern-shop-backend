const { Categoria, Producto } = require('../models');

// 1. Obtener todas las categorías
exports.obtenerCategorias = async (req, res) => {
    try {
        const categorias = await Categoria.findAll({
            order: [['nombre', 'ASC']] // Orden alfabético para el select del frontend
        });
        res.json(categorias);
    } catch (error) {
        console.error("❌ Error en obtenerCategorias:", error);
        res.status(500).json({ error: "Error al obtener categorías" });
    }
};

// 2. Crear nueva categoría
exports.crearCategoria = async (req, res) => {
    try {
        const { nombre } = req.body;

        if (!nombre) {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }

        // Validación para evitar duplicados manual antes de que explote Postgres
        const existe = await Categoria.findOne({ where: { nombre: nombre.trim() } });
        if (existe) {
            return res.status(400).json({ error: "Esta categoría ya existe" });
        }

        const nueva = await Categoria.create({ nombre: nombre.trim() });
        res.status(201).json(nueva);
    } catch (error) {
        console.error("❌ Error en crearCategoria:", error);
        res.status(500).json({ error: "Error al crear categoría" });
    }
};

// 3. Actualizar categoría
exports.actualizarCategoria = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;

        const categoria = await Categoria.findByPk(id);
        if (!categoria) return res.status(404).json({ error: "Categoría no encontrada" });

        await categoria.update({ nombre: nombre.trim() });
        res.json(categoria);
    } catch (error) {
        console.error("❌ Error en actualizarCategoria:", error);
        res.status(500).json({ error: "Error al actualizar categoría" });
    }
};

// 4. Eliminar categoría
exports.eliminarCategoria = async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar si hay productos asociados a esta categoría antes de borrar
        const productosAsociados = await Producto.count({ where: { categoriaId: id } });
        
        if (productosAsociados > 0) {
            return res.status(400).json({ 
                error: `No puedes eliminar esta categoría porque tiene ${productosAsociados} productos asociados.` 
            });
        }

        const categoria = await Categoria.findByPk(id);
        if (!categoria) return res.status(404).json({ error: "Categoría no encontrada" });

        await categoria.destroy();
        res.json({ mensaje: "Categoría eliminada con éxito", id });
    } catch (error) {
        console.error("❌ Error en eliminarCategoria:", error);
        res.status(500).json({ error: "Error al eliminar categoría" });
    }
};