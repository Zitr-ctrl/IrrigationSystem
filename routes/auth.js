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

router.get('/', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  try {
    // 1. Obtener la última lectura de cada sensor con datos de maceta
    const [lecturas] = await db.query(`
      SELECT 
        l.sensor_id,
        s.maceta_id,
        m.nombre_maceta,
        m.nombre_planta,
        m.tamaño_maceta,
        m.humedad_minima,
        l.valor,
        l.timestamp
      FROM lectura_sensor l
      JOIN sensor s ON l.sensor_id = s.id
      JOIN maceta m ON s.maceta_id = m.id
      WHERE l.id IN (
        SELECT MAX(id) FROM lectura_sensor GROUP BY sensor_id
      )
      ORDER BY s.maceta_id ASC
    `);

    // 2. Último estado de la bomba
    const [ultimoRegistro] = await db.query(`
      SELECT bomba_estado
      FROM registro_riego
      ORDER BY id DESC
      LIMIT 1
    `);

    const bombaEncendida = ultimoRegistro[0]?.bomba_estado === 'ON';

    // 3. Construir array de macetas
    const macetas = lecturas.map(l => ({
      id: l.maceta_id,
      nombre: l.nombre_maceta,
      planta: l.nombre_planta,
      tamaño: l.tamaño_maceta,
      humedad_minima: parseFloat(l.humedad_minima),
      humedad: parseFloat(l.valor),
      fecha: l.timestamp.toLocaleString()
    }));

    res.render('index', {
      bombaEncendida,
      macetas,
      correo: req.session.user.correo
    });
  } catch (error) {
    console.error('Error al obtener datos:', error);
    res.status(500).send('Error al cargar la página principal');
  }
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

router.get('/historial', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  try {
    const [lecturas] = await db.query(`
      SELECT 
        lectura_sensor.id,
        sensor.tipo,
        lectura_sensor.valor,
        lectura_sensor.unidad,
        lectura_sensor.timestamp,
        maceta.nombre_maceta AS zona
      FROM lectura_sensor
      JOIN sensor ON lectura_sensor.sensor_id = sensor.id
      LEFT JOIN maceta ON sensor.maceta_id = maceta.id
      ORDER BY lectura_sensor.timestamp DESC
      LIMIT 100
    `);

    res.render('historial_riego', {
      correo: req.session.user.correo,
      lecturas
    });
  } catch (err) {
    console.error('Error al obtener lecturas:', err);
    res.status(500).send('Error al cargar historial');
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

    res.redirect('/');
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).send('Error interno del servidor');
  }
});

// Ruta para actualizar humedad mínima
router.post('/api/actualizar_humedad_minima', async (req, res) => {
  const { maceta_id, humedad_minima } = req.body;

  if (!maceta_id || humedad_minima === undefined) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  if (humedad_minima < 0 || humedad_minima > 100) {
    return res.status(400).json({ error: 'El nivel debe ser entre 0 y 100.' });
  }

  try {
    await db.query(
      'UPDATE maceta SET humedad_minima = ? WHERE id = ?',
      [humedad_minima, maceta_id]
    );

    res.json({ message: 'Nivel de humedad mínima actualizado correctamente.' });
  } catch (err) {
    console.error('Error al actualizar humedad mínima:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// Ruta para editar datos de la maceta
router.post('/api/editar_maceta', async (req, res) => {
  const { maceta_id, nombre_maceta, nombre_planta, tamaño_maceta } = req.body;

  if (!maceta_id || !nombre_maceta || !nombre_planta || !tamaño_maceta) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    await db.query(
      'UPDATE maceta SET nombre_maceta = ?, nombre_planta = ?, tamaño_maceta = ? WHERE id = ?',
      [nombre_maceta, nombre_planta, tamaño_maceta, maceta_id]
    );

    res.json({ message: 'Información actualizada correctamente.' });
  } catch (err) {
    console.error('Error al actualizar maceta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


export default router;
