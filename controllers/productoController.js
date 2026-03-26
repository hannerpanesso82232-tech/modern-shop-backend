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
        // 🔥 AÑADIDO: Campos para Punto de Venta (POS) 🔥
        const { 
            nombre, descripcion, precio, stock, categoriaId, proveedor, 
            costo_compra, margen_ganancia, tope_stock,
            precio_mayor, cantidad_mayor, codigo_barras
        } = req.body;
        
        const imagen_url = req.file ? req.file.path : null; 
        
        const nuevoProducto = await Producto.create({
            nombre, 
            descripcion, 
            precio: parseFloat(precio || 0), 
            stock: parseInt(stock || 0), 
            tope_stock: parseInt(tope_stock || 10),
            categoriaId: categoriaId || null, 
            imagen_url, 
            proveedor: proveedor || 'No especificado',
            costo_compra: parseFloat(costo_compra || 0), 
            margen_ganancia: parseFloat(margen_ganancia || 0),
            
            // 🔥 Guardamos los nuevos datos del POS 🔥
            precio_mayor: precio_mayor ? parseFloat(precio_mayor) : null,
            cantidad_mayor: parseInt(cantidad_mayor || 0),
            codigo_barras: codigo_barras ? JSON.stringify(codigo_barras) : null
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
        const { 
            nombre, precio, stock, categoriaId, descripcion, proveedor, 
            costo_compra, margen_ganancia, tope_stock,
            precio_mayor, cantidad_mayor, codigo_barras // 🔥 Campos POS 🔥
        } = req.body;
        
        const producto = await Producto.findByPk(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        const datosActualizados = {
            nombre: nombre || producto.nombre, 
            descripcion: descripcion !== undefined ? descripcion : producto.descripcion, 
            precio: precio !== undefined ? parseFloat(precio) : producto.precio, 
            stock: stock !== undefined ? parseInt(stock) : producto.stock, 
            tope_stock: tope_stock !== undefined ? parseInt(tope_stock) : producto.tope_stock,
            categoriaId: categoriaId || producto.categoriaId, 
            proveedor: proveedor || producto.proveedor,
            costo_compra: costo_compra !== undefined ? parseFloat(costo_compra) : producto.costo_compra,
            margen_ganancia: margen_ganancia !== undefined ? parseFloat(margen_ganancia) : producto.margen_ganancia,
            
            // 🔥 Actualizamos campos POS 🔥
            precio_mayor: precio_mayor !== undefined ? (precio_mayor ? parseFloat(precio_mayor) : null) : producto.precio_mayor,
            cantidad_mayor: cantidad_mayor !== undefined ? parseInt(cantidad_mayor) : producto.cantidad_mayor,
            codigo_barras: codigo_barras !== undefined ? (codigo_barras ? JSON.stringify(codigo_barras) : null) : producto.codigo_barras
        };

        if (req.file) {
            datosActualizados.imagen_url = req.file.path;
        }

        await producto.update(datosActualizados);
        
        const productoFinal = await Producto.findByPk(id, {
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }]
        });

        await redisClient.del('catalogo_productos');

        const io = req.app.get('socketio') || req.io;
        if(io) {
            io.emit('productoActualizado', productoFinal);
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