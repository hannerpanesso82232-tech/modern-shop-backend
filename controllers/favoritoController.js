const { Favorito, Producto, Categoria } = require('../models');

exports.obtenerFavoritos = async (req, res) => {
    try {
        // Buscamos los favoritos del usuario autenticado
        const favoritos = await Favorito.findAll({
            where: { usuario_id: req.user.id },
            include: [{
                model: Producto,
                as: 'Producto', // <--- CORRECCIÓN: Alias obligatorio según tu model/index.js
                include: [{ 
                    model: Categoria, 
                    as: 'Categoria', // Alias para la relación Producto -> Categoria
                    attributes: ['nombre'] 
                }]
            }]
        });

        // Mapeamos para devolver solo la lista de objetos Producto con su Categoría
        const productosFavoritos = favoritos
            .filter(f => f.Producto) 
            .map(f => f.Producto);

        res.json(productosFavoritos);
    } catch (error) {
        console.error("❌ Error en obtenerFavoritos:", error);
        res.status(500).json({ mensaje: "Error al obtener favoritos" });
    }
};

exports.toggleFavorito = async (req, res) => {
    const { producto_id } = req.body;
    const usuario_id = req.user.id;

    if (!producto_id) {
        return res.status(400).json({ mensaje: "El ID del producto es requerido" });
    }

    try {
        // Verificar si ya existe el favorito
        const existe = await Favorito.findOne({
            where: { usuario_id, producto_id }
        });

        if (existe) {
            // Si existe, lo eliminamos (Quitar de favoritos)
            await existe.destroy();
            return res.json({ 
                success: true,
                estado: false, 
                mensaje: "Eliminado de favoritos" 
            });
        } else {
            // Si no existe, lo creamos (Agregar a favoritos)
            await Favorito.create({ usuario_id, producto_id });
            return res.json({ 
                success: true,
                estado: true, 
                mensaje: "Añadido a favoritos" 
            });
        }
    } catch (error) {
        console.error("❌ Error en toggleFavorito:", error);
        res.status(500).json({ mensaje: "Error al procesar favorito" });
    }
};