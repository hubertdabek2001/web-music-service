//express połączenie

const express = require('express');
const session = require('express-session');
const pg = require('pg');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;


//middleware
app.use(express.json());


app.use(express.urlencoded({ extended: true}));
app.use(cookieParser());
app.use(session({
    secret:SECRET_KEY,
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
const { register } = require('module');

app.get('/db-test', async (req, res) => {
    try{
        const result = await pool.query('SELECT NOW()');
        res.json(result.rows[0]);
    }catch (err) {
        console.error(err);
        res.status(500).send('Brak połączenia z bazą danych');
    }
})

//konfiguracja nodemailera
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    }
})

//rejestracja użytkownika
app.post('/register', async (req, res) => {
    const { username, email, password, role, first_name, last_name, verification_code, is_verified } = req.body;
    
    
    try {
        const checkUsername = await pool.query('SELECT * FROM users WHERE username = $1', [ username ]);
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [ email ]);
        
        if(checkUsername.rowCount > 0){
            console.log('This username already exist');
            return;
        }
        
        if(existingUser.rowCount > 0){
            const user = existingUser.rows[0];

            if(!user.is_verified){
                await pool.query('DELETE FROM users WHERE email = $1', [ email ]);
                console.log('Record deleted. Try to register.')
            }else {
                return res.status(400).send('Account with those credentials alredy exists.');
            }
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const verificationToken = jwt.sign({email: email}, SECRET_KEY, {expiresIn: '1h'});
        console.log(verificationToken);

        const result = await pool.query(
            'INSERT INTO users (username, email, password, role, first_name, last_name, verification_code, is_verified) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
             [username, email, hashedPassword, role, first_name, last_name, verificationToken, false]
        );
        const verificationLink = `http://localhost:3000/verify-email?token=${verificationToken}`;
        await transporter.sendMail({
            from: {
                name: 'Music Player',
                address: process.env.USER
            },
            to: email,
            subject: 'Verify your email',
            html: `<p>Click the email below to verify your email: </p><a href="${verificationLink}">${verificationLink}</a>`
        });
        
        res.status(200).send('Registration successul! Please check your email to verify your account');
        
    }catch (err){
        console.error('Error registring user:',err);
        res.status(500).send('An error occured during registration');
    }
});

//uwierzytelnienie

app.get('/verify-email', async(req, res) => {
    const { token } = req.query;

    try{
        const result = await pool.query('UPDATE users SET is_verified = true WHERE verification_code = $1 RETURNING *', [ token ]);
        if (result.rowCount > 0){
            res.send('Email successfully verified. You can now log in');
            
        }else {
            res.status(400).send('Invalid or expired verification token.')
        }
    } catch (err) {
        console.error('Error verifying email: ',err);
        res.status(500).send('An error occured during email verification');
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

    try{
        console.log('Recived username:', username);

        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        console.log('User query result: ',user.rows);

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
    }catch (err){
        console.error('Error during login:', err);
        res.status(500).send('Internal server error');
    }
    
    
});

//dashboard access
app.get('/dashboard', (req, res) => {
    const token = req.cookies.auth_token;
    if(!token) {
        return res.redirect("register.html")
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


//deleting user after 60seconds of non authorized registration (endpoint test)

app.delete('/delete-unverified', async (req, res) => {
    try{
        const oneHourAgo = new Date(Date.now() - 60 * 1000);

        const result = await pool.query('DELETE FROM users WHERE is_verified = false AND registration_date < $1', [ oneHourAgo ]
        );
        res.status(200).send(`${result.rowCount} unverified users removed.`);
    } catch (err){
        console.error('Error cleaning up unverified users: ',err);
        res.status(500).send('An error occured during cleanup.')
    }
})

//deleting unverfied user after 1hour
schedule.scheduleJob('0 * * * *', async () => {
    try{
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const result = await pool.query('DELETE FROM users WHERE is_verified = false AND registration_date < $1', [ oneHourAgo ]
        );
        console.log(`${result.rowCount} unverified users removed at ${new Date()}.`)
        
    }catch (err) {
        console.error('Error during scheduled cleanup ',err);
    }
})