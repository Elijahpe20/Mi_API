const express = require('express');
const { Pool } = require('pg');
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

// PostgreSQL Connection Pool
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false,
	},
	max: 2, // Máximo 2 conexiones simultáneas (plan gratuito)
	idleTimeoutMillis: 30000, // Cerrar conexiones inactivas después de 30 segundos
	connectionTimeoutMillis: 10000, // Timeout de conexión de 10 segundos
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
	if (err) {
		console.error('❌ Error al conectar a la base de datos:', err);
	} else {
		console.log('✅ Conexión exitosa a la base de datos PostgreSQL');
	}
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
		const result = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at FROM users ORDER BY id',
		);
		res.json({
			success: true,
			data: result.rows,
			count: result.rows.length,
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
		const result = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at FROM users WHERE id = $1',
			[id],
		);

		if (result.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Usuario no encontrado',
			});
		}

		res.json({
			success: true,
			data: result.rows[0],
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
		const existingUser = await pool.query(
			'SELECT id FROM users WHERE email = $1',
			[email],
		);

		if (existingUser.rows.length > 0) {
			return res.status(409).json({
				success: false,
				message: 'El email ya está registrado',
			});
		}

		// Encriptar password
		const hashedPassword = await bcrypt.hash(password, 10);

		// Insertar usuario
		const result = await pool.query(
			'INSERT INTO users (first_name, last_name, email, password, birthday) VALUES ($1, $2, $3, $4, $5) RETURNING id',
			[first_name, last_name, email, hashedPassword, birthday || null],
		);

		// Obtener el usuario creado
		const newUser = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at FROM users WHERE id = $1',
			[result.rows[0].id],
		);

		res.status(201).json({
			success: true,
			message: 'Usuario creado exitosamente',
			data: newUser.rows[0],
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
		const existingUser = await pool.query(
			'SELECT id FROM users WHERE id = $1',
			[id],
		);

		if (existingUser.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Usuario no encontrado',
			});
		}

		// Construir query dinámicamente
		let updateFields = [];
		let values = [];
		let paramCount = 1;

		if (first_name) {
			updateFields.push(`first_name = $${paramCount}`);
			values.push(first_name);
			paramCount++;
		}
		if (last_name) {
			updateFields.push(`last_name = $${paramCount}`);
			values.push(last_name);
			paramCount++;
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
			const emailCheck = await pool.query(
				'SELECT id FROM users WHERE email = $1 AND id != $2',
				[email, id],
			);

			if (emailCheck.rows.length > 0) {
				return res.status(409).json({
					success: false,
					message: 'El email ya está registrado por otro usuario',
				});
			}

			updateFields.push(`email = $${paramCount}`);
			values.push(email);
			paramCount++;
		}
		if (password) {
			const hashedPassword = await bcrypt.hash(password, 10);
			updateFields.push(`password = $${paramCount}`);
			values.push(hashedPassword);
			paramCount++;
		}
		if (birthday !== undefined) {
			updateFields.push(`birthday = $${paramCount}`);
			values.push(birthday);
			paramCount++;
		}

		if (updateFields.length === 0) {
			return res.status(400).json({
				success: false,
				message: 'No hay campos para actualizar',
			});
		}

		updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
		values.push(id);

		await pool.query(
			`UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount}`,
			values,
		);

		// Obtener el usuario actualizado
		const updatedUser = await pool.query(
			'SELECT id, first_name, last_name, email, birthday, created_at, updated_at FROM users WHERE id = $1',
			[id],
		);

		res.json({
			success: true,
			message: 'Usuario actualizado exitosamente',
			data: updatedUser.rows[0],
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
		const existingUser = await pool.query(
			'SELECT id FROM users WHERE id = $1',
			[id],
		);

		if (existingUser.rows.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Usuario no encontrado',
			});
		}

		// Eliminar usuario
		await pool.query('DELETE FROM users WHERE id = $1', [id]);

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
	console.log(`📱 Desplegado en: https://mi-api-ns1j.onrender.com`);
});
