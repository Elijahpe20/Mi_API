const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Conexión a la base de datos MySQL
const db = mysql.createConnection({
	host: 'localhost',
	user: 'root', // Asegúrate de poner tu usuario de MySQL
	password: '', // Asegúrate de poner tu contraseña de MySQL
	database: 'crud_api',
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

// Iniciar servidor
app.listen(port, () => {
	console.log(`Servidor corriendo en http://localhost:${port}`);
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
