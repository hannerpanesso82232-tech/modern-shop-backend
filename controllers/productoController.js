const { Producto, Categoria, MovimientoKardex, sequelize } = require('../models');
const fs = require('fs');
const path = require('path');
const redisClient = require('../config/redis'); 

// 🔥 Helper del Kardex Logístico Actualizado (CON FOTO DEL PASADO) 🔥
const registrarTrazaKardex = async (productoId, tipo, cantidad, costo_unitario, valor_total, saldo_stock, saldo_costo, referencia, usuarioId = null, tx = null, stock_anterior = 0, costo_anterior = 0) => {
    try {
        await MovimientoKardex.create({
            productoId, usuarioId, tipo, cantidad, costo_unitario, valor_total,
            stock_anterior, costo_anterior, // Memorias del estado anterior
            saldo_stock_momento: saldo_stock, saldo_costo_promedio: saldo_costo,
            sucursal_origen: 'Principal', sucursal_destino: 'Principal', referencia
        }, { transaction: tx });
    } catch (error) { 
        console.error("⚠️ Error Kardex:", error); 
    }
};

exports.obtenerProductos = async (req, res) => {
    try {
        const productosCacheados = await redisClient.get('catalogo_productos');
        if (productosCacheados) return res.json(JSON.parse(productosCacheados));
        
        const productos = await Producto.findAll({ 
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }], 
            order: [['id', 'DESC']] 
        });
        
        await redisClient.setEx('catalogo_productos', 3600, JSON.stringify(productos));
        res.json(productos);
    } catch (error) { 
        res.status(500).json({ error: "Error al obtener productos" }); 
    }
};

exports.crearProducto = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { 
            nombre, descripcion, precio, stock, categoriaId, proveedor, 
            costo_compra, costo_operacion, margen_ganancia, tope_stock, 
            precio_mayor, cantidad_mayor, codigo_barras 
        } = req.body;
        
        const imagen_url = req.file ? req.file.path : null; 
        const stockInicial = parseInt(stock || 0);
        const costoInicial = parseFloat(costo_compra || 0); // Este es el Costo Promedio (que al nacer, es igual al de compra)
        
        const nuevoProducto = await Producto.create({
            nombre, descripcion, precio: parseFloat(precio || 0), stock: stockInicial, tope_stock: parseInt(tope_stock || 10),
            categoriaId: categoriaId || null, imagen_url, proveedor: proveedor || 'No especificado',
            costo_compra: costoInicial, margen_ganancia: parseFloat(margen_ganancia || 0),
            precio_mayor: precio_mayor ? parseFloat(precio_mayor) : null, cantidad_mayor: parseInt(cantidad_mayor || 0), codigo_barras: codigo_barras ? JSON.stringify(codigo_barras) : null
        }, { transaction: t });

        if (stockInicial > 0) {
            await registrarTrazaKardex(
                nuevoProducto.id, 'ENTRADA', stockInicial, costoInicial, (stockInicial * costoInicial), 
                stockInicial, costoInicial, `APERTURA DE INVENTARIO INICIAL`, req.user?.id, t, 0, 0
            );
        }

        await t.commit(); 
        await redisClient.del('catalogo_productos');
        
        const productoConCategoria = await Producto.findByPk(nuevoProducto.id, { 
            include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }] 
        });
        res.status(201).json(productoConCategoria);
    } catch (error) {
        await t.rollback(); 
        res.status(500).json({ error: "Error al crear el producto" });
    }
};

exports.actualizarProducto = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { 
            nombre, precio, stock, categoriaId, descripcion, proveedor, 
            costo_compra, costo_operacion, margen_ganancia, tope_stock, 
            precio_mayor, cantidad_mayor, codigo_barras 
        } = req.body;
        
        const producto = await Producto.findByPk(id, { transaction: t });
        if (!producto) { 
            await t.rollback(); 
            return res.status(404).json({ error: "Producto no encontrado" }); 
        }

        // FOTOS DEL PASADO
        const stockAnterior = parseInt(producto.stock);
        const costoAnterior = parseFloat(producto.costo_compra || 0);
        
        const stockNuevo = stock !== undefined ? parseInt(stock) : stockAnterior;
        const costoPromedioNuevo = costo_compra !== undefined ? parseFloat(costo_compra) : costoAnterior;
        
        const datosActualizados = {
            nombre: nombre || producto.nombre, descripcion: descripcion !== undefined ? descripcion : producto.descripcion, 
            precio: precio !== undefined ? parseFloat(precio) : producto.precio, stock: stockNuevo, tope_stock: tope_stock !== undefined ? parseInt(tope_stock) : producto.tope_stock,
            categoriaId: categoriaId || producto.categoriaId, proveedor: proveedor || producto.proveedor,
            costo_compra: costoPromedioNuevo, margen_ganancia: margen_ganancia !== undefined ? parseFloat(margen_ganancia) : producto.margen_ganancia,
            precio_mayor: precio_mayor !== undefined ? (precio_mayor ? parseFloat(precio_mayor) : null) : producto.precio_mayor,
            cantidad_mayor: cantidad_mayor !== undefined ? parseInt(cantidad_mayor) : producto.cantidad_mayor,
            codigo_barras: codigo_barras !== undefined ? (codigo_barras ? JSON.stringify(codigo_barras) : null) : producto.codigo_barras
        };

        if (req.file) datosActualizados.imagen_url = req.file.path;
        await producto.update(datosActualizados, { transaction: t });
        
        const diferenciaStock = stockNuevo - stockAnterior;
        if (diferenciaStock !== 0) {
            const tipoMov = diferenciaStock > 0 ? 'ENTRADA' : 'AJUSTE';
            const cantReal = Math.abs(diferenciaStock);
            
            // 🔥 AQUÍ ESTÁ LA MAGIA: Tomamos el costo del lote de la factura, no el promedio 🔥
            const costRealLote = costo_operacion !== undefined ? parseFloat(costo_operacion) : costoPromedioNuevo;
            
            await registrarTrazaKardex(
                producto.id, tipoMov, cantReal, costRealLote, (cantReal * costRealLote), 
                stockNuevo, costoPromedioNuevo, `AJUSTE MANUAL DESDE PANEL ADMIN`, req.user?.id, t,
                stockAnterior, costoAnterior // Mandamos la foto del pasado
            );
        }

        await t.commit();
        await redisClient.del('catalogo_productos');
        
        const productoFinal = await Producto.findByPk(id, { include: [{ model: Categoria, as: 'Categoria', attributes: ['nombre'] }] });
        const io = req.app.get('socketio') || req.io;
        if(io) { 
            io.emit('productoActualizado', productoFinal); 
            io.emit('stockActualizado', { id: parseInt(id), nuevoStock: productoFinal.stock }); 
        }
        res.json({ mensaje: "Producto actualizado con éxito", producto: productoFinal });
    } catch (error) {
        await t.rollback(); 
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

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

        const stockAnterior = parseInt(producto.stock);
        const costoAnterior = parseFloat(producto.costo_compra || 0);
        let nuevoStock = stockAnterior;
        const cantMov = parseInt(cantidad);

        if (operacion === 'restar') {
            if (stockAnterior < cantMov) { 
                await t.rollback(); 
                return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}` }); 
            }
            nuevoStock -= cantMov;
            await registrarTrazaKardex(
                producto.id, 'SALIDA', cantMov, costoAnterior, (cantMov * costoAnterior), 
                nuevoStock, costoAnterior, `BAJA DE MERCANCÍA / MERMA`, req.user?.id, t, stockAnterior, costoAnterior
            );
        } else {
            nuevoStock += cantMov;
            await registrarTrazaKardex(
                producto.id, 'ENTRADA', cantMov, costoAnterior, (cantMov * costoAnterior), 
                nuevoStock, costoAnterior, `ENTRADA EXPRESS`, req.user?.id, t, stockAnterior, costoAnterior
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
        res.status(500).json({ error: "Error al procesar inventario" }); 
    }
};

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
        res.status(500).json({ error: "Error al eliminar el producto" }); 
    }
};