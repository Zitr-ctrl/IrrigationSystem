import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

// Configura tu conexión (ajusta si usas otro puerto o contraseña)
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '12345',
  database: 'irrigationsystem2',
  port: 3308
};

const nuevoAdmin = {
  nombre: 'Admin',
  apellido: 'Principal',
  correo: 'admin@gmail.com',
  username: 'admin',
  password: 'admin123', // Puedes cambiarla aquí
  tipo_user_id: 1 // 1 = admin
};

(async () => {
  try {
    const connection = await mysql.createConnection(dbConfig);

    const [usuariosExistentes] = await connection.execute(
      'SELECT * FROM user WHERE username = ? OR correo = ?',
      [nuevoAdmin.username, nuevoAdmin.correo]
    );

    if (usuariosExistentes.length > 0) {
      console.log('⚠️ Ya existe un usuario con ese nombre o correo.');
      await connection.end();
      return;
    }

    const hashedPassword = await bcrypt.hash(nuevoAdmin.password, 10);

    await connection.execute(
      'INSERT INTO user (nombre, apellido, correo, username, password, tipo_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        nuevoAdmin.nombre,
        nuevoAdmin.apellido,
        nuevoAdmin.correo,
        nuevoAdmin.username,
        hashedPassword,
        nuevoAdmin.tipo_user_id
      ]
    );

    console.log('✅ Usuario administrador creado exitosamente.');
    await connection.end();
  } catch (error) {
    console.error('❌ Error al crear el usuario administrador:', error);
  }
})();
