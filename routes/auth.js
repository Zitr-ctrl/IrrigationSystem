import express from 'express';
import bcrypt from 'bcrypt';
import db from '../db/connection.js';

const router = express.Router();

// Página de login
router.get('/login', (req, res) => {
  res.sendFile('login.html', { root: 'views' });
});

// Página de registro
router.get('/register', (req, res) => {
  res.sendFile('register.html', { root: 'views' });
});

router.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const { nombre, apellido } = req.session.user;

  res.send(`<h1>Bienvenido, ${nombre} ${apellido} 👋</h1><a href="/logout">Cerrar sesión</a>`);
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Error al cerrar sesión');
    }
    res.clearCookie('connect.sid'); // cookie por defecto de express-session
    res.redirect('/login');
  });
});


// Procesar registro
router.post('/register', async (req, res) => {
  const { nombre, apellido, correo, username, password } = req.body;

  try {
    // Verificar si el username o correo ya existen
    const [existing] = await db.query(
      'SELECT * FROM user WHERE username = ? OR correo = ?',
      [username, correo]
    );

    if (existing.length > 0) {
      return res.status(400).send('El nombre de usuario o correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO user (nombre, apellido, correo, username, password) VALUES (?, ?, ?, ?, ?)',
      [nombre, apellido, correo, username, hashedPassword]
    );

    res.redirect('/login');
  } catch (err) {
    console.error('Error al registrar usuario:', err);
    res.status(500).send('Error interno del servidor');
  }
});


// Procesar login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM user WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).send('Usuario no encontrado');
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).send('Contraseña incorrecta');
    }

    // Guardar datos en sesión
    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      username: user.username,
      correo: user.correo
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).send('Error interno del servidor');
  }
});


export default router;
