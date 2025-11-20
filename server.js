const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Connection pool para mejor rendimiento
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

// Test connection
pool
	.getConnection()
	.then((connection) => {
		console.log('✅ Conexión exitosa a la base de datos');
		connection.release();
	})
	.catch((err) => {
		console.error('❌ Error al conectar a la base de datos:', err);
	});

// Ruta raíz
app.get('/', (req, res) => {
	res.json({
		message: '¡API de usuarios funcionando!',
		endpoints: {
			'GET /users': 'Obtener todos los usuarios',
			'GET /users/:id': 'Obtener usuario por ID',
			'POST /users': 'Crear nuevo usuario',
			'PUT /users/:id': 'Actualizar usuario',
			'DELETE /users/:id': 'Eliminar usuario',
		},
	});
});

// ========== ENDPOINTS ==========

// 1. GET /users - Obtener todos los usuarios
app.get('/users', async (req, res) => {
	try {
		const [rows] = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at FROM users',
		);
		res.json({
			success: true,
			data: rows,
			count: rows.length,
		});
	} catch (error) {
		console.error('Error al obtener usuarios:', error);
		res.status(500).json({
			success: false,
			message: 'Error al obtener usuarios',
			error: error.message,
		});
	}
});

// 2. GET /users/:id - Obtener usuario por ID
app.get('/users/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const [rows] = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at FROM users WHERE id = ?',
			[id],
		);

		if (rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Usuario no encontrado',
			});
		}

		res.json({
			success: true,
			data: rows[0],
		});
	} catch (error) {
		console.error('Error al obtener usuario:', error);
		res.status(500).json({
			success: false,
			message: 'Error al obtener usuario',
			error: error.message,
		});
	}
});

// 3. POST /users - Crear nuevo usuario
app.post('/users', async (req, res) => {
	try {
		const { first_name, last_name, email, password, birthday } = req.body;

		// Validaciones
		if (!first_name || !last_name || !email || !password) {
			return res.status(400).json({
				success: false,
				message:
					'Faltan campos requeridos: first_name, last_name, email, password',
			});
		}

		// Validar formato de email
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return res.status(400).json({
				success: false,
				message: 'Formato de email inválido',
			});
		}

		// Verificar si el email ya existe
		const [existingUsers] = await pool.query(
			'SELECT id FROM users WHERE email = ?',
			[email],
		);

		if (existingUsers.length > 0) {
			return res.status(409).json({
				success: false,
				message: 'El email ya está registrado',
			});
		}

		// Encriptar password
		const hashedPassword = await bcrypt.hash(password, 10);

		// Insertar usuario
		const [result] = await pool.query(
			'INSERT INTO users (first_name, last_name, email, password, birthday) VALUES (?, ?, ?, ?, ?)',
			[first_name, last_name, email, hashedPassword, birthday || null],
		);

		// Obtener el usuario creado
		const [newUser] = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at FROM users WHERE id = ?',
			[result.insertId],
		);

		res.status(201).json({
			success: true,
			message: 'Usuario creado exitosamente',
			data: newUser[0],
		});
	} catch (error) {
		console.error('Error al crear usuario:', error);
		res.status(500).json({
			success: false,
			message: 'Error al crear usuario',
			error: error.message,
		});
	}
});

// 4. PUT /users/:id - Actualizar usuario
app.put('/users/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const { first_name, last_name, email, password, birthday } = req.body;

		// Verificar si el usuario existe
		const [existingUser] = await pool.query(
			'SELECT id FROM users WHERE id = ?',
			[id],
		);

		if (existingUser.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Usuario no encontrado',
			});
		}

		// Construir query dinámicamente
		let updateFields = [];
		let values = [];

		if (first_name) {
			updateFields.push('first_name = ?');
			values.push(first_name);
		}
		if (last_name) {
			updateFields.push('last_name = ?');
			values.push(last_name);
		}
		if (email) {
			// Validar formato de email
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(email)) {
				return res.status(400).json({
					success: false,
					message: 'Formato de email inválido',
				});
			}

			// Verificar si el email ya existe (excepto el usuario actual)
			const [emailCheck] = await pool.query(
				'SELECT id FROM users WHERE email = ? AND id != ?',
				[email, id],
			);

			if (emailCheck.length > 0) {
				return res.status(409).json({
					success: false,
					message: 'El email ya está registrado por otro usuario',
				});
			}

			updateFields.push('email = ?');
			values.push(email);
		}
		if (password) {
			const hashedPassword = await bcrypt.hash(password, 10);
			updateFields.push('password = ?');
			values.push(hashedPassword);
		}
		if (birthday !== undefined) {
			updateFields.push('birthday = ?');
			values.push(birthday);
		}

		if (updateFields.length === 0) {
			return res.status(400).json({
				success: false,
				message: 'No hay campos para actualizar',
			});
		}

		values.push(id);
		await pool.query(
			`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
			values,
		);

		// Obtener el usuario actualizado
		const [updatedUser] = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at, updated_at FROM users WHERE id = ?',
			[id],
		);

		res.json({
			success: true,
			message: 'Usuario actualizado exitosamente',
			data: updatedUser[0],
		});
	} catch (error) {
		console.error('Error al actualizar usuario:', error);
		res.status(500).json({
			success: false,
			message: 'Error al actualizar usuario',
			error: error.message,
		});
	}
});

// 5. DELETE /users/:id - Eliminar usuario
app.delete('/users/:id', async (req, res) => {
	try {
		const { id } = req.params;

		// Verificar si el usuario existe
		const [existingUser] = await pool.query(
			'SELECT id FROM users WHERE id = ?',
			[id],
		);

		if (existingUser.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Usuario no encontrado',
			});
		}

		// Eliminar usuario
		await pool.query('DELETE FROM users WHERE id = ?', [id]);

		res.json({
			success: true,
			message: 'Usuario eliminado exitosamente',
		});
	} catch (error) {
		console.error('Error al eliminar usuario:', error);
		res.status(500).json({
			success: false,
			message: 'Error al eliminar usuario',
			error: error.message,
		});
	}
});

// Manejador de rutas no encontradas
app.use((req, res) => {
	res.status(404).json({
		success: false,
		message: 'Ruta no encontrada',
	});
});

// Iniciar servidor
app.listen(port, () => {
	console.log(`✅ Servidor corriendo en http://localhost:${port}`);
	console.log(`📱 Desplegado en: https://mi-api-nsj1.onrender.com`);
});
