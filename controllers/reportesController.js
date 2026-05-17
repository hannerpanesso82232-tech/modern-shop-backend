const { Pedido, DetallePedido, Producto, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.obtenerMetricasAnaliticas = async (req, res) => {
    try {
        // 1. Reporte Diario (Últimos 30 días agrupados)
        const ventasDiarias = await Pedido.findAll({
            where: { estado: 'Entregado' },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('fecha_pedido')), 'fecha'],
                [sequelize.fn('SUM', sequelize.col('total')), 'totalVendido'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalPedidos']
            ],
            group: [sequelize.fn('DATE', sequelize.col('fecha_pedido'))],
            order: [[sequelize.fn('DATE', sequelize.col('fecha_pedido')), 'ASC']],
            limit: 30
        });

        // 2. Reporte Mensual (Histórico por Meses)
        const ventasMensuales = await Pedido.findAll({
            where: { estado: 'Entregado' },
            attributes: [
                [sequelize.fn('DATE_FORMAT', sequelize.col('fecha_pedido'), '%Y-%m'), 'mes'],
                [sequelize.fn('SUM', sequelize.col('total')), 'totalVendido'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalPedidos']
            ],
            group: [sequelize.fn('DATE_FORMAT', sequelize.col('fecha_pedido'), '%Y-%m')],
            order: [[sequelize.fn('DATE_FORMAT', sequelize.col('fecha_pedido'), '%Y-%m'), 'ASC']]
        });

        res.json({ ventasDiarias, ventasMensuales });
    } catch (error) {
        res.status(500).json({ error: "Error al compilar analíticas avanzadas" });
    }
};