const axios = require('axios');

const testPedido = async () => {
    try {
        // 1. Iniciar sesión para obtener el token (RF-03)
        const login = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'carlos@correo.com',
            password: 'password123'
        });
        const token = login.data.token;

        console.log('✅ Token obtenido con éxito.');

        // 2. Crear un pedido (CU-04)
        // Intentaremos comprar una 'Laptop Pro 15' (asumiendo ID 1)
        const pedido = await axios.post('http://localhost:3000/api/pedidos', 
        {
            productos: [
                { producto_id: 1, cantidad: 1 }
            ]
        }, 
        {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('✅ Pedido creado:', pedido.data);
        console.log('🚀 Revisa tu consola de PostgreSQL para ver el Trigger en acción.');

    } catch (error) {
        console.error('❌ Error en la prueba:', error.response ? error.response.data : error.message);
    }
};

testPedido();