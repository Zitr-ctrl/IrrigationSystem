import express from "express";
import bcrypt from "bcrypt";
import db from "../db/connection.js";
import ExcelJS from "exceljs";
import { ensureAuth, ensureAdmin } from "../middlewares/auth.js";

const router = express.Router();

// Página de login
router.get("/login", (req, res) => {
  res.sendFile("login.html", { root: "views" });
});

// Página de registro
router.get("/register", ensureAuth, ensureAdmin, (req, res) => {
  res.render("register", {
    correo: req.session.user.correo,
    user: req.session.user,
  });
});

router.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const { nombre, apellido } = req.session.user;

  res.send(
    `<h1>Bienvenido, ${nombre} ${apellido} 👋</h1><a href="/logout">Cerrar sesión</a>`
  );
});

router.get("/", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
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

    const bombaEncendida = ultimoRegistro[0]?.bomba_estado === "ON";

    // 3. Construir array de macetas
    const macetas = lecturas.map((l) => ({
      id: l.maceta_id,
      nombre: l.nombre_maceta,
      planta: l.nombre_planta,
      tamaño: l.tamaño_maceta,
      humedad_minima: parseFloat(l.humedad_minima),
      humedad: parseFloat(l.valor),
      fecha: l.timestamp.toLocaleString(),
    }));

    // ✅ Ahora se pasa también el objeto user completo
    res.render("index", {
      bombaEncendida,
      macetas,
      correo: req.session.user.correo,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error al obtener datos:", error);
    res.status(500).send("Error al cargar la página principal");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error al cerrar sesión");
    }
    res.clearCookie("connect.sid"); // cookie por defecto de express-session
    res.redirect("/login");
  });
});

router.post("/register", ensureAuth, ensureAdmin, async (req, res) => {
  const { nombre, apellido, correo, username, password } = req.body;

  try {
    const [existing] = await db.query(
      "SELECT * FROM user WHERE username = ? OR correo = ?",
      [username, correo]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Usuario o correo ya registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO user (nombre, apellido, correo, username, password) VALUES (?, ?, ?, ?, ?)",
      [nombre, apellido, correo, username, hashedPassword]
    );

    res.json({ message: "Usuario registrado correctamente" });
  } catch (err) {
    console.error("Error al registrar usuario:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get("/historial", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    const [lecturas] = await db.query(`
      SELECT 
        lectura_sensor.id,
        sensor.tipo,
        lectura_sensor.valor,
        lectura_sensor.unidad,
        lectura_sensor.timestamp,
        maceta.nombre_maceta AS zona,
        maceta.humedad_minima
      FROM lectura_sensor
      JOIN sensor ON lectura_sensor.sensor_id = sensor.id
      LEFT JOIN maceta ON sensor.maceta_id = maceta.id
      ORDER BY lectura_sensor.timestamp DESC
      LIMIT 100
    `);

    res.render("historial_riego", {
      correo: req.session.user.correo,
      user: req.session.user,
      lecturas,
    });
  } catch (err) {
    console.error("Error al obtener lecturas:", err);
    res.status(500).send("Error al cargar historial");
  }
});

router.get("/exportar-excel", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  try {
    const [lecturas] = await db.query(`
      SELECT 
        lectura_sensor.id,
        sensor.tipo,
        lectura_sensor.valor,
        lectura_sensor.unidad,
        lectura_sensor.timestamp,
        maceta.nombre_maceta AS zona,
        maceta.humedad_minima
      FROM lectura_sensor
      JOIN sensor ON lectura_sensor.sensor_id = sensor.id
      LEFT JOIN maceta ON sensor.maceta_id = maceta.id
      ORDER BY lectura_sensor.timestamp DESC
      LIMIT 100
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Historial de Riego");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Zona", key: "zona", width: 20 },
      { header: "Tipo", key: "tipo", width: 15 },
      { header: "Valor", key: "valor", width: 15 },
      { header: "Unidad", key: "unidad", width: 10 },
      { header: "Humedad Mínima", key: "humedad_minima", width: 18 },
      { header: "Fecha", key: "timestamp", width: 25 },
    ];

    lecturas.forEach((l) => {
      worksheet.addRow({
        id: l.id,
        zona: l.zona || "Sin zona",
        tipo: l.tipo,
        valor: l.valor,
        unidad: l.unidad,
        humedad_minima: l.humedad_minima ?? "No definida",
        timestamp: new Date(l.timestamp).toLocaleString(),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=historial_riego.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error al generar Excel:", error);
    res.status(500).send("Error al exportar historial");
  }
});

// Procesar login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query(
      `
      SELECT u.*, t.nombre_tipo, t.id AS tipo_user_id
      FROM user u
      JOIN tipo_user t ON u.tipo_user_id = t.id
      WHERE username = ?
    `,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).send("Usuario no encontrado");
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).send("Contraseña incorrecta");
    }

    // Guardar datos en sesión

    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      username: user.username,
      correo: user.correo,
      tipo_user_id: user.tipo_user_id,
      tipo_user_nombre: user.nombre_tipo,
    };

    res.redirect("/");
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).send("Error interno del servidor");
  }
});

router.post(
  "/api/actualizar_humedad_minima",
  ensureAuth,
  ensureAdmin,
  async (req, res) => {
    const { maceta_id, humedad_minima } = req.body;

    if (!maceta_id || humedad_minima === undefined) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    if (humedad_minima < 0 || humedad_minima > 100) {
      return res
        .status(400)
        .json({ error: "El nivel debe ser entre 0 y 100." });
    }

    try {
      // Obtener valor anterior
      const [rows] = await db.query(
        "SELECT humedad_minima FROM maceta WHERE id = ?",
        [maceta_id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Maceta no encontrada" });
      }

      const anterior = rows[0].humedad_minima;

      // Actualizar
      await db.query("UPDATE maceta SET humedad_minima = ? WHERE id = ?", [
        humedad_minima,
        maceta_id,
      ]);

      // Log del cambio
      await db.query(
        `INSERT INTO log_maceta (maceta_id, user_id, accion, valor_anterior, valor_nuevo)
       VALUES (?, ?, ?, ?, ?)`,
        [
          maceta_id,
          req.session.user.id,
          "Actualizó humedad mínima",
          anterior.toString(),
          humedad_minima.toString(),
        ]
      );

      res.json({
        message: "Nivel de humedad mínima actualizado correctamente.",
      });
    } catch (err) {
      console.error("Error al actualizar humedad mínima:", err);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

router.post("/api/editar_maceta", ensureAuth, ensureAdmin, async (req, res) => {
  const { maceta_id, nombre_maceta, nombre_planta, tamaño_maceta } = req.body;

  if (!maceta_id || !nombre_maceta || !nombre_planta || !tamaño_maceta) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    // Obtener datos anteriores
    const [rows] = await db.query(
      "SELECT nombre_maceta, nombre_planta, tamaño_maceta FROM maceta WHERE id = ?",
      [maceta_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Maceta no encontrada" });
    }

    const anterior = rows[0];

    // Actualizar datos
    await db.query(
      "UPDATE maceta SET nombre_maceta = ?, nombre_planta = ?, tamaño_maceta = ? WHERE id = ?",
      [nombre_maceta, nombre_planta, tamaño_maceta, maceta_id]
    );

    // Comparar y registrar cambios
    const cambios = [];

    if (anterior.nombre_maceta !== nombre_maceta) {
      cambios.push([
        "Actualizó nombre de maceta",
        anterior.nombre_maceta,
        nombre_maceta,
      ]);
    }

    if (anterior.nombre_planta !== nombre_planta) {
      cambios.push([
        "Actualizó nombre de planta",
        anterior.nombre_planta,
        nombre_planta,
      ]);
    }

    if (anterior.tamaño_maceta !== tamaño_maceta) {
      cambios.push([
        "Actualizó tamaño de maceta",
        anterior.tamaño_maceta,
        tamaño_maceta,
      ]);
    }

    for (const [accion, valorAnterior, valorNuevo] of cambios) {
      await db.query(
        `INSERT INTO log_maceta (maceta_id, user_id, accion, valor_anterior, valor_nuevo)
         VALUES (?, ?, ?, ?, ?)`,
        [maceta_id, req.session.user.id, accion, valorAnterior, valorNuevo]
      );
    }

    res.json({ message: "Información actualizada correctamente." });
  } catch (err) {
    console.error("Error al actualizar maceta:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
