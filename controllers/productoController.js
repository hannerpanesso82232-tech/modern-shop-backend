const { Producto, Categoria, MovimientoKardex, sequelize } = require('../models');
const fs = require('fs');
const path = require('path');
const redisClient = require('../config/redis'); 

// Función Helper para registrar en el Kardex automáticamente
const registrarTrazaKardex = async (productoId, tipo, cantidad, costo_unitario, valor_total, saldo_stock, saldo_costo, referencia, usuarioId = null, tx = null) => {
    try {
        await MovimientoKardex.create({
            productoId, usuarioId, tipo, cantidad, costo_unitario, valor_total,
            saldo_stock_momento: saldo_stock, saldo_costo_promedio: saldo_costo,
            sucursal_origen: 'Principal', sucursal_destino: 'Principal', referencia
        }, { transaction: tx });
    } catch (error) {
        console.error("⚠️ Error interno al registrar en Kardex:", error);
    }
};

// 1. Obtener Productos
exports.obtenerProductos = async (req, res) => {
    try {
        const productosCacheados = await redisClient.get('catalogo_productos');
        if (productosCacheados) {
            console.log("⚡ Catálogo cargado desde Redis");
            return res.json(JSON.parse(productosCacheados));
        }

        console.log("🐢 Catálogo cargado desde PostgreSQL/MySQL");
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
    const t = await sequelize.transaction();
    try {
        const { 
            nombre, descripcion, precio, stock, categoriaId, proveedor, 
            costo_compra, margen_ganancia, tope_stock,
            precio_mayor, cantidad_mayor, codigo_barras
        } = req.body;
        
        const imagen_url = req.file ? req.file.path : null; 
        const stockInicial = parseInt(stock || 0);
        const costoInicial = parseFloat(costo_compra || 0);
        
        const nuevoProducto = await Producto.create({
            nombre, descripcion, precio: parseFloat(precio || 0), 
            stock: stockInicial, tope_stock: parseInt(tope_stock || 10),
            categoriaId: categoriaId || null, imagen_url, 
            proveedor: proveedor || 'No especificado',
            costo_compra: costoInicial, margen_ganancia: parseFloat(margen_ganancia || 0),
            precio_mayor: precio_mayor ? parseFloat(precio_mayor) : null,
            cantidad_mayor: parseInt(cantidad_mayor || 0),
            codigo_barras: codigo_barras ? JSON.stringify(codigo_barras) : null
        }, { transaction: t });

        // 🔥 LOGICA KARDEX: Si el producto nace con stock, registramos la entrada inicial 🔥
        if (stockInicial > 0) {
            await registrarTrazaKardex(
                nuevoProducto.id, 'ENTRADA', stockInicial, costoInicial, 
                (stockInicial * costoInicial), stockInicial, costoInicial, 
                `APERTURA DE INVENTARIO INICIAL`, req.user?.id, t
            );
        }

        await t.commit(); // Confirmamos la transacción
        await redisClient.del('catalogo_productos');

        const productoConCategoria = await Producto.findByPk(nuevoProducto.id, {
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }]
        });
        
        res.status(201).json(productoConCategoria);
    } catch (error) {
        await t.rollback();
        console.error("❌ Error en crearProducto:", error);
        res.status(500).json({ error: "Error al crear el producto" });
    }
};

// 3. Actualizar producto (CON EVENTO EN VIVO Y KARDEX)
exports.actualizarProducto = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { 
            nombre, precio, stock, categoriaId, descripcion, proveedor, 
            costo_compra, margen_ganancia, tope_stock,
            precio_mayor, cantidad_mayor, codigo_barras 
        } = req.body;
        
        const producto = await Producto.findByPk(id, { transaction: t });
        if (!producto) {
            await t.rollback();
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        const stockAnterior = parseInt(producto.stock);
        const stockNuevo = stock !== undefined ? parseInt(stock) : stockAnterior;
        const costoNuevo = costo_compra !== undefined ? parseFloat(costo_compra) : parseFloat(producto.costo_compra);
        
        const datosActualizados = {
            nombre: nombre || producto.nombre, 
            descripcion: descripcion !== undefined ? descripcion : producto.descripcion, 
            precio: precio !== undefined ? parseFloat(precio) : producto.precio, 
            stock: stockNuevo, 
            tope_stock: tope_stock !== undefined ? parseInt(tope_stock) : producto.tope_stock,
            categoriaId: categoriaId || producto.categoriaId, 
            proveedor: proveedor || producto.proveedor,
            costo_compra: costoNuevo,
            margen_ganancia: margen_ganancia !== undefined ? parseFloat(margen_ganancia) : producto.margen_ganancia,
            precio_mayor: precio_mayor !== undefined ? (precio_mayor ? parseFloat(precio_mayor) : null) : producto.precio_mayor,
            cantidad_mayor: cantidad_mayor !== undefined ? parseInt(cantidad_mayor) : producto.cantidad_mayor,
            codigo_barras: codigo_barras !== undefined ? (codigo_barras ? JSON.stringify(codigo_barras) : null) : producto.codigo_barras
        };

        if (req.file) datosActualizados.imagen_url = req.file.path;

        await producto.update(datosActualizados, { transaction: t });
        
        // 🔥 LÓGICA KARDEX: Detectamos si hubo una modificación de stock en la edición 🔥
        const diferenciaStock = stockNuevo - stockAnterior;
        if (diferenciaStock !== 0) {
            const tipoMov = diferenciaStock > 0 ? 'ENTRADA' : 'AJUSTE';
            const costUnit = costoNuevo;
            const cantReal = Math.abs(diferenciaStock);
            
            await registrarTrazaKardex(
                producto.id, tipoMov, cantReal, costUnit, 
                (cantReal * costUnit), stockNuevo, costUnit, 
                `AJUSTE MANUAL DESDE PANEL ADMIN`, req.user?.id, t
            );
        }

        await t.commit();
        await redisClient.del('catalogo_productos');

        const productoFinal = await Producto.findByPk(id, {
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }]
        });

        const io = req.app.get('socketio') || req.io;
        if(io) {
            io.emit('productoActualizado', productoFinal);
            io.emit('stockActualizado', { id: parseInt(id), nuevoStock: productoFinal.stock });
        }

        res.json({ mensaje: "Producto actualizado con éxito", producto: productoFinal });
    } catch (error) {
        await t.rollback();
        console.error("❌ Error en actualizarProducto:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// 4. Actualizar Stock Manualmente (Mermas / Daños)
exports.actualizarStockManualmente = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { cantidad, operacion } = req.body;
        const producto = await Producto.findByPk(id, { transaction: t });

        if (!producto) {
            await t.rollback();
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        let nuevoStock = producto.stock;
        const cantMov = parseInt(cantidad);
        const costoVigente = parseFloat(producto.costo_compra || 0);

        if (operacion === 'restar') {
            if (producto.stock < cantMov) {
                await t.rollback();
                return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}` });
            }
            nuevoStock -= cantMov;
            
            // 🔥 KARDEX: Registro de baja o merma 🔥
            await registrarTrazaKardex(
                producto.id, 'SALIDA', cantMov, costoVigente, (cantMov * costoVigente), 
                nuevoStock, costoVigente, `BAJA DE MERCANCÍA / MERMA`, req.user?.id, t
            );

        } else {
            nuevoStock += cantMov;
            // 🔥 KARDEX: Registro de entrada express 🔥
            await registrarTrazaKardex(
                producto.id, 'ENTRADA', cantMov, costoVigente, (cantMov * costoVigente), 
                nuevoStock, costoVigente, `ENTRADA EXPRESS`, req.user?.id, t
            );
        }

        await producto.update({ stock: nuevoStock }, { transaction: t });
        await t.commit();
        await redisClient.del('catalogo_productos');

        const io = req.app.get('socketio') || req.io;
        if(io) io.emit('stockActualizado', { id: parseInt(id), nuevoStock });

        res.json({ mensaje: "Sincronización de inventario exitosa", nuevoStock });
    } catch (error) {
        await t.rollback();
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