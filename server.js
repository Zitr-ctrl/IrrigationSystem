import express from 'express';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Para usar __dirname con ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.urlencoded({ extended: true }));

app.use(express.json());

app.use(session({
  secret: 'tu_clave_secreta', // ⚠️ Cámbiala por una segura en producción
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true si usas HTTPS
}));

// Rutas
app.use(authRoutes);

// Archivos estáticos y vistas
app.use(express.static('public'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs'); // o usa HTML plano si prefieres


// Inicio
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
