import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

// Envoltorio con promesas
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}).promise(); // 👈 Esta línea es la clave

export default pool;
