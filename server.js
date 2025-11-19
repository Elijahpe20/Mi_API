const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = 3000;

// Conexión a la base de datos MySQL usando las variables de entorno
const db = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT,
});

db.connect((err) => {
	if (err) throw err;
	console.log('Conectado a la base de datos!');
});

// Middleware
app.use(bodyParser.json());

// Endpoint para obtener todos los usuarios
app.get('/users', (req, res) => {
	db.query('SELECT * FROM users', (err, result) => {
		if (err) throw err;
		res.json(result);
	});
});

// Endpoint para agregar un nuevo usuario
app.post('/users', (req, res) => {
	const { first_name, last_name, email, password, birthday } = req.body;
	const query =
		'INSERT INTO users (first_name, last_name, email, password, birthday) VALUES (?, ?, ?, ?, ?)';
	db.query(
		query,
		[first_name, last_name, email, password, birthday],
		(err, result) => {
			if (err) throw err;
			res.json({
				message: 'Usuario agregado correctamente!',
				id: result.insertId,
			});
		},
	);
});

// Iniciar servidor
app.listen(port, () => {
	console.log(`Servidor corriendo en http://localhost:${port}`);
});
