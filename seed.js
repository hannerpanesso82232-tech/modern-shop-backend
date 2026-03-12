require('dotenv').config();
const { sequelize, Categoria, Producto, Usuario } = require('./models');
const bcrypt = require('bcryptjs');

const seedDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log('⏳ Poblando base de datos...');

        // 1. CREAR CATEGORÍAS
        const categorias = await Categoria.bulkCreate([
            { nombre: 'Calzado' },
            { nombre: 'Ropa' },
            { nombre: 'Accesorios' },
            { nombre: 'Deportes' }
        ], { ignoreDuplicates: true });

        console.log('✅ Categorías creadas');



        // 3. CREAR PRODUCTOS DE PRUEBA
        const catCalzado = await Categoria.findOne({ where: { nombre: 'Calzado' } });
        const catRopa = await Categoria.findOne({ where: { nombre: 'Ropa' } });

        await Producto.bulkCreate([
            {
                nombre: 'Tenis Running Pro',
                descripcion: 'Tenis de alta gama para maratones y entrenamiento diario.',
                precio: 129.99,
                stock: 25,
                categoriaId: catCalzado.id, // CORRECCIÓN: usar categoriaId (CamelCase)
                imagen_url: '/uploads/demo-tenis.jpg' 
            },
            {
                nombre: 'Camiseta Dry-Fit',
                descripcion: 'Camiseta transpirable para alto rendimiento deportivo.',
                precio: 35.00,
                stock: 50,
                categoriaId: catRopa.id, // CORRECCIÓN
                imagen_url: '/uploads/demo-camisa.jpg'
            },
            {
                nombre: 'Sudadera Urban Style',
                descripcion: 'Comodidad y estilo para el día a día.',
                precio: 55.50,
                stock: 15,
                categoriaId: catRopa.id, // CORRECCIÓN
                imagen_url: '/uploads/demo-sudadera.jpg'
            }
        ]);

        console.log('✅ Productos de prueba creados');
        console.log('🚀 ¡Base de datos lista para usar!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error en el Seeding:', error);
        process.exit(1);
    }
};

seedDatabase();