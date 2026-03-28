import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Cargar las variables del archivo .env
dotenv.config();

// Inicializar el servidor Express
const app = express();
const port = process.env.PORT || 3000;

// Configurar los "cadeneros" y traductores
app.use(cors({ origin: '*' })); // Permite que otras webs se conecten a esta API
app.use(express.json()); // Permite que el servidor entienda datos en formato JSON

// Conectar a la base de datos de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Crear nuestra primera ruta (URL) de prueba
app.get('/', (req, res) => {
    res.send('¡El servidor de la Heladería Libertad está funcionando perfectamente! 🍦');
});

// Ruta para obtener todos los productos del catálogo
app.get('/productos', async (req, res) => {
    try {
        // Le pedimos a Supabase que seleccione todo (*) de la tabla 'productos'
        const { data, error } = await supabase
            .from('productos')
            .select('*');

        // Si hay un error, lo lanzamos para que lo atrape el catch
        if (error) {
            throw error;
        }

        // Si todo sale bien, enviamos los datos al navegador en formato JSON
        res.json(data);
    } catch (error) {
        // Si algo falla, enviamos un mensaje de error
        res.status(500).json({ error: error.message });
    }
});

// Encender el motor
app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});