const { Producto, Categoria } = require('../models');
const fs = require('fs');
const path = require('path');
const redisClient = require('../config/redis'); 

// 1. Obtener Productos
exports.obtenerProductos = async (req, res) => {
    try {
        const productosCacheados = await redisClient.get('catalogo_productos');

        if (productosCacheados) {
            console.log("⚡ Catálogo cargado desde Redis");
            return res.json(JSON.parse(productosCacheados));
        }

        console.log("🐢 Catálogo cargado desde PostgreSQL");
        const productos = await Producto.findAll({
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }],
            order: [['id', 'DESC']]
        });

        await redisClient.setEx('catalogo_productos', 3600, JSON.stringify(productos));

        res.json(productos);
    } catch (error) {
        console.error("❌ Error en obtenerProductos:", error);
        res.status(500).json({ error: "Error al obtener productos" });
    }
};

// 2. Crear Producto
exports.crearProducto = async (req, res) => {
    try {
        // 🔥 AÑADIDO: Ahora se recibe y guarda el tope_stock 🔥
        const { nombre, descripcion, precio, stock, categoriaId, proveedor, costo_compra, margen_ganancia, tope_stock } = req.body;
        const imagen_url = req.file ? req.file.path : null; 
        
        const nuevoProducto = await Producto.create({
            nombre, 
            descripcion, 
            precio: parseFloat(precio || 0), 
            stock: parseInt(stock || 0), 
            tope_stock: parseInt(tope_stock || 10), // Guardamos el tope
            categoriaId: categoriaId || null, 
            imagen_url, 
            proveedor: proveedor || 'No especificado',
            costo_compra: parseFloat(costo_compra || 0), 
            margen_ganancia: parseFloat(margen_ganancia || 0)
        });

        const productoConCategoria = await Producto.findByPk(nuevoProducto.id, {
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }]
        });
        
        await redisClient.del('catalogo_productos');

        res.status(201).json(productoConCategoria);
    } catch (error) {
        console.error("❌ Error en crearProducto:", error);
        res.status(500).json({ error: "Error al crear el producto" });
    }
};

// 3. Actualizar producto (CON EVENTO EN VIVO)
exports.actualizarProducto = async (req, res) => {
    try {
        const { id } = req.params;
        // 🔥 AÑADIDO: tope_stock 🔥
        const { nombre, precio, stock, categoriaId, descripcion, proveedor, costo_compra, margen_ganancia, tope_stock } = req.body;
        
        const producto = await Producto.findByPk(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        // 🔥 CORRECCIÓN: Validación robusta para no perder precios y topes 🔥
        const datosActualizados = {
            nombre: nombre || producto.nombre, 
            descripcion: descripcion !== undefined ? descripcion : producto.descripcion, 
            precio: precio !== undefined ? parseFloat(precio) : producto.precio, 
            stock: stock !== undefined ? parseInt(stock) : producto.stock, 
            tope_stock: tope_stock !== undefined ? parseInt(tope_stock) : producto.tope_stock,
            categoriaId: categoriaId || producto.categoriaId, 
            proveedor: proveedor || producto.proveedor,
            costo_compra: costo_compra !== undefined ? parseFloat(costo_compra) : producto.costo_compra,
            margen_ganancia: margen_ganancia !== undefined ? parseFloat(margen_ganancia) : producto.margen_ganancia
        };

        if (req.file) {
            datosActualizados.imagen_url = req.file.path;
        }

        await producto.update(datosActualizados);
        
        const productoFinal = await Producto.findByPk(id, {
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }]
        });

        // 🔥 Destruimos el caché para que el catálogo de clientes muestre el precio nuevo de inmediato
        await redisClient.del('catalogo_productos');

        // 🔥 MAGIA: Notificar a todos los clientes y paneles del cambio en vivo 🔥
        const io = req.app.get('socketio') || req.io;
        if(io) {
            io.emit('productoActualizado', productoFinal);
            // Esto asegura que la tabla del admin también cambie al instante
            io.emit('stockActualizado', { id: parseInt(id), nuevoStock: productoFinal.stock });
        }

        res.json({ mensaje: "Producto actualizado con éxito", producto: productoFinal });
    } catch (error) {
        console.error("❌ Error en actualizarProducto:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// 4. Actualizar Stock Manualmente 
exports.actualizarStockManualmente = async (req, res) => {
    try {
        const { id } = req.params;
        const { cantidad, operacion } = req.body;
        const producto = await Producto.findByPk(id);

        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        let nuevoStock = producto.stock;
        if (operacion === 'restar') {
            if (producto.stock < cantidad) {
                return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}` });
            }
            nuevoStock -= parseInt(cantidad);
        } else {
            nuevoStock += parseInt(cantidad);
        }

        await producto.update({ stock: nuevoStock });
        await redisClient.del('catalogo_productos');

        // Avisar al Dashboard que el stock cambió
        const io = req.app.get('socketio') || req.io;
        if(io) io.emit('stockActualizado', { id: parseInt(id), nuevoStock });

        res.json({ mensaje: "Sincronización de inventario exitosa", nuevoStock });
    } catch (error) {
        console.error("❌ Error en actualizarStockManualmente:", error);
        res.status(500).json({ error: "Error al procesar inventario" });
    }
};

// 5. Eliminar Producto
exports.eliminarProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const producto = await Producto.findByPk(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        if (producto.imagen_url) {
            // El manejo de archivos locales está comentado temporalmente
            // const rutaImagen = path.join(__dirname, '../uploads', path.basename(producto.imagen_url)); 
            // if (fs.existsSync(rutaImagen)) fs.unlinkSync(rutaImagen);
        }

        await producto.destroy();
        await redisClient.del('catalogo_productos');

        const io = req.app.get('socketio') || req.io;
        if(io) io.emit('productoEliminado', id); 

        res.json({ mensaje: "Producto eliminado correctamente", id });
    } catch (error) {
        console.error("❌ Error en eliminarProducto:", error);
        res.status(500).json({ error: "Error al eliminar el producto" });
    }
};