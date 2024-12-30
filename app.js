//express połączenie

const express = require('express');
const session = require('express-session');
const pg = require('pg');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');


const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'session_secret_key';


//middleware
app.use(express.json());


app.use(express.urlencoded({ extended: true}));
app.use(cookieParser());
app.use(session({
    secret: 'session_secret_key',
    resave: false,
    saveUninitialized: false
}));

//middleware do obsługi plikow statycznych
app.use(express.static(path.join(__dirname, 'public')));


app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
})

//połączenie z baza + sprawdzenie połączenia
const pool = require('./db');

app.get('/db-test', async (req, res) => {
    try{
        const result = await pool.query('SELECT NOW()');
        res.json(result.rows[0]);
    }catch (err) {
        console.error(err);
        res.status(500).send('Brak połączenia z bazą danych');
    }
})


//tworzernie nowego uzykownika
app.post('/users', async (req, res) => {
    const { username, email, password, role, first_name, last_name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (username, email, password, role, first_name, last_name) VALUES($1, $2, $3, $4, $5, $6) RETURNING *',
             [username, email, hashedPassword, role, first_name, last_name]
        );
        res.status(201).json(result.rows[0]);
    }catch (err){
        console.error(err);
        res.status(500).send('Błąd dodania użytkownika');
    }
});

//pobieranie wszystkich użykowników

app.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        res.json(result.rows);
    } catch (err){
        console.error(err);
        res.status(500).send('Błąd pobierania użytkowników');
    }
});

//pobieranie jednego uzytkownika

app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0){
            return res.status(404).send('Użytkownik nie znaleziony');
        }
        res.json(result.rows[0]);
    } catch (err){
        console.error(err);
        res.status(500).send('Błąd pobierania użytkownika');
    }
})

//usuwanie użytkownika o danym ID
app.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try{
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.status(204).send();
    }catch (err) {
        console.error(err);
        res.status(500).send('Błąd usuwania użytkownika');
    }
});

//logowanie
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE username = $1' [username]);
    if(user.rows.length > 0){
        const isValid = await bcrypt.compare(password, user.rows[0].password);
        if(isValid){
            const token = jwt.sign({id: user.rows[0].id, role: user.rows[0].role }, SECRET_KEY, {expiresIn: '1h'});
            res.cookie('auth_token', token, {httpOnly: true});
            res.redirect('/dashboard');
        }
        else{
            res.status(401).send('Invalid credentials');
        }
    }
    else{
        res.status(404).send('User not found');
    }
});

//dashboard access
app.get('/dashboard', (req, res) => {
    const token = req.cookies.auth_token;
    if(!token) {
        return res.status(403).send('Access denied. No token provided.');
    }
    try{
        const decoded = jwt.verify(token, SECRET_KEY);
        if(decoded.role === 'admin'){
            res.send('Welcome, Admin! <a href=\"/manage\">Manage Users </a>');
        }
        else{
            res.send('Welcome. Users');
        }
    } catch (err){
        res.status(400).send('Invalid token');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.redirect('/');
});

