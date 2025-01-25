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
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

const AWS = require('aws-sdk');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASSWORD = process.env.FTP_PASSWORD;


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

//middleware do sprawdzania roli administratora

function verifyAdmin(req, res, next){
    const token = req.cookies.auth_token;

    if(!token){
        return res.status(401).send('Unauthorized');
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);

        if(decoded.role !== 'admin') {
            return res.status(403).send('Access denied');
        }

        next();
    } catch (err) {
        console.error('Error verifying admin:', err)
        res.status(401).send('Unauthorized');
    }
}

/*const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});*/

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const bucketName = process.env.AWS_BUCKET_NAME;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) =>{
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    fileFilter: function (req, file, cb) {
        const allowedMimeType = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
        if(allowedMimeType.includes(file.mimetype)){
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only audio files allowed.'))
        }
    },
});

app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
})

//połączenie z baza + sprawdzenie połączenia
const pool = require('./db');
const { register } = require('module');
const { json } = require('stream/consumers');

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
        await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
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
                const token = jwt.sign({user_id: user.rows[0].user_id, role: user.rows[0].role }, SECRET_KEY, {expiresIn: '1h'});
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
            return res.redirect("dashboard.html");
        }
        else{
            return res.redirect("/");
        }
    } catch (err){
        res.status(400).send('Invalid token');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.redirect('/');
});

app.get('/', verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'))
})


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

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/register.html'));
})

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
})

//dashboard
//access only for role: admin

app.get('/dashbaord', verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'))
})

//api fetch list of users in database

app.get('/api/users', verifyAdmin, async(req, res) => {

    const { 
        sortBy = 'user_id', 
        sortOrder = 'asc',
        searchColumn = '',
        searchTerm = ''
    }= req.query;

    const validColumns = ['user_id','first_name', 'last_name', 'username', 'email', 'role'];
    const validOrders = ['asc', 'desc'];

    if(!validColumns.includes(sortBy) || !validOrders.includes(sortOrder)){
        return res.status(400).json({message: 'Invalid sort parameters'});
    }

    try {
        let query = 'SELECT * FROM users';
        const params = [];

        if(searchColumn && searchTerm){
            query += ` WHERE ${searchColumn} ILIKE $1`;
            params.push(`%${searchTerm}`);
        }

        query += ` ORDER BY ${sortBy} ${sortOrder}`

        const result = await pool.query(query, params)
        res.json(result.rows);
    }catch (err) {
        console.error('Error fetching users: ', err);
        res.status(500).send('Internal state error');
    }
})

app.get('/api/requests', verifyAdmin, async(req, res) => {

    const { 
        sortBy = 'request_id', 
        sortOrder = 'asc',
        searchColumn = '',
        searchTerm = ''
    }= req.query;

    const validColumns = ['request_id','title', 'album', 'author', 'genre_id', 'user_id'];
    const validOrders = ['asc', 'desc'];

    if(!validColumns.includes(sortBy) || !validOrders.includes(sortOrder)){
        return res.status(400).json({message: 'Invalid sort parameters'});
    }

    try {
        let query = `SELECT 
                requests.request_id,
                requests.title,
                requests.album,
                requests.author,
                requests.release_date,
                requests.status,
                requests.created_at,
                requests.url,
                requests.user_id,
                genre.genre_id,
                genre.genre_name,
                users.username FROM requests 
                INNER JOIN genre ON requests.genre_id = genre.genre_id
                INNER JOIN users ON requests.user_id = users.user_id `;
        const params = [];

        if(searchColumn && searchTerm){
            query += ` WHERE ${searchColumn} ILIKE $1`;
            params.push(`%${searchTerm}`);
        }

        query += ` ORDER BY ${sortBy} ${sortOrder}`

        const result = await pool.query(query, params)
        res.json(result.rows);
    }catch (err) {
        console.error('Error fetching requests: ', err);
        res.status(500).send('Internal state error');
    }
})

//delete endpoint button in /api/users

app.delete('/api/users/:id', verifyAdmin, async(req, res) => {
    
    try{
        const userID = req.params.user_id;
        await pool.query('DELETE FROM users WHERE user_id = $1', [userID]);
        res.status(200).send('User deleted successfully.');
    } catch(err) {
        console.error('Error deleteing user: ',err);
        res.status(500).send('Internal state error');
    }

})

//verify access for admin only

app.get('/api/verify-admin', (req, res) => {
    const token = req.cookies.auth_token;

    if(!token){
        return res.status(401).send('Unauthorized');
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);

        if(decoded.role === 'admin'){
            return res.status(200).send('Authorized');
        } else {
            return res.status(403).send('Access denied');
        }
    } catch (err) {
        console.error('Error verifying admin: ', err);
        res.status(401).send('Unauthorized');
    }
})

//current user session

app.get('/api/current-user', async (req, res) => {
    const token = req.cookies.auth_token;

    if(!token){
        return res.status(401).json({message: 'Not logged in'});
    }

    try{
        const decoded = jwt.verify(token, SECRET_KEY);
        const user = await pool.query('SELECT user_id, first_name, last_name, username, email, role, registration_date FROM users where user_id = $1', [decoded.user_id]);
        
        if (user.rows.length > 0) {
            return res.status(200).json(user.rows[0]);
        }else {
            return res.status(404).json({message: 'User not found'});
        }
    }catch (err){
        console.error('Error verifying user: ', err);
        return res.status(401).json({ message: 'Invalid token'});
    }
})

/*app.get('/user-profile', async (req, res) => {
    const { id } = req.query;

    if(!id){
        return res.status(400).send('User ID is required');
    }

    try{
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

        if(result.rows.length === 0){
            return res.status(404).send('User not found');
        }

        const user = result.rows[0];
        res.send(`
             <h1>User Profile</h1>
            <p><strong>ID:</strong> ${user.id}</p>
            <p><strong>First Name:</strong> ${user.first_name}</p>
            <p><strong>Last Name:</strong> ${user.last_name}</p>
            <p><strong>Username:</strong> ${user.username}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Verified:</strong> ${user.is_verified ? 'Yes' : 'No'}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <a href="/dashboard">Back to Dashboard</a>`);
    } catch (err){
        console.error('Error fetching user profile:', err);
        res.status(500).send('Internal Server Error');
    }
})*/

app.get('/api/users/:id', async(req, res) => {
    const { id } = req.params;

    try{
        const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [id]);

        if(result.rows.length === 0){
            return res.status(404).json({error: 'User not found'});
        }

        res.json(result.rows[0]);
    }catch (err) {
        console.error('Error fetch user data:',err)
        res.status(500).json({error: 'Internal Server Error'});
    }
})

const allowedMimeType = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'];


app.post('/api/requests', upload.single('file'), async (req, res) => {
    try {
        const { title, album, author, genre, release_date, user_id, status } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'File is required.' });
        }

        const filePath = req.file.path;
        const fileStream = fs.createReadStream(filePath);
        const fileName = req.file.filename;
        const s3Key = `uploads/audio/${fileName}`;

        // Walidacja danych wejściowych
        if (!title || !album || !author || !genre || !release_date) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const uploadParams = {
            Bucket: bucketName,
            Key: s3Key,
            Body: fileStream,
            ContnetType: allowedMimeType,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        fs.unlinkSync(filePath);

        // Pobierz URL pliku z S3
        const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

        // Generowanie statusu i daty
        const statusPending = 'Pending'; // Domyślny status
        const createdAt = new Date();

        // Zapisz rekord w bazie danych
        await pool.query(
            'INSERT INTO requests (title, album, author, genre_id, release_date, user_id, status, created_at, url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [
                title,
                album,
                author,
                genre,
                release_date,
                user_id,
                statusPending,
                createdAt,
                fileUrl,
            ]
        );

        res.status(200).json({ message: 'Request submitted successfully.', fileUrl });
    } catch (error) {
        console.error('Error saving request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Genre:

app.get('/api/genres', async(req, res) => {
    try{
        const result = await pool.query('SELECT * FROM genre');
        res.status(200).json(result.rows);

    }catch (err){
        console.error('Error fetching genres', err);
        res.status(500).json({error: 'An error occured'})
    }
    
})

app.delete('/api/clear-requests', async(req, res) => {
    try{
        await pool.query('DELETE FROM requests');
        res.status(201).send('Successfully cleared requests')
    } catch(err) {
        console.error('Error clearing requests', err);
        res.status(500).send('Internal server error')
    }
})

/*app.get('/api/requests/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const requestQuery = await pool.query(`SELECT requests.request_id,
                requests.title,
                requests.album,
                requests.author,
                requests.release_date,
                requests.status,
                requests.created_at,
                requests.url,
                genre.genre_id,
                genre.genre_name
                FROM requests 
                INNER JOIN genre on requests.genre_id = genre.genre_id 
                WHERE request_id = $1`, [id]);

        if (requestQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // Zwróć dane z bazy danych
        res.status(200).json(requestQuery.rows[0]);

        const request = requestQuery.rows[0];
        const s3Key = request.url.split('.com/')[1];

        const fileName = path.basename(s3Key);
        const tempFilePath = path.join(__dirname, 'temp', fileName);

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
        });
        const response = await s3.send(command);

        const writeStream = fs.createWriteStream(tempFilePath);
        response.Body.pipe(writeStream);

        writeStream.on('finish', () => {
            res.setHeader('Content-Type', 'audio/mpeg');

            const readStream = fs.createReadStream(tempFilePath);
            readStream.pipe(res);

            readStream.on('close', () => {
                fs.unlink(tempFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting temporary file: ', err);
                    }
                });
            });
        });

        writeStream.on('error', (err) => {
            console.error('Error writing file:', err);
            res.status(500).json({ message: 'Error processing file' });
        });

    } catch (err) {
        console.error('Error fetching requests', err);
        res.status(500).json({ message: 'Server Error' });
    }
});*/

app.get('/api/requests/:id/metadata', async (req, res) => {
    const { id } = req.params;

    try {
        const requestQuery = await pool.query(`SELECT requests.request_id,
                requests.title,
                requests.album,
                requests.author,
                requests.release_date,
                requests.status,
                requests.created_at,
                requests.url,
                genre.genre_id,
                genre.genre_name
                FROM requests 
                INNER JOIN genre on requests.genre_id = genre.genre_id 
                WHERE request_id = $1`, [id]);

        if (requestQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // Zwróć JSON z metadanymi
        res.status(200).json(requestQuery.rows[0]);
    } catch (err) {
        console.error('Error fetching requests', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/api/requests/:id/audio', async (req, res) => {
    const { id } = req.params;

    try {
        const requestQuery = await pool.query(`SELECT requests.url
                FROM requests 
                WHERE request_id = $1`, [id]);

        if (requestQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Audio not found' });
        }

        const request = requestQuery.rows[0];
        const s3Key = request.url.split('.com/')[1];

        const fileName = path.basename(s3Key);
        const tempFilePath = path.join(__dirname, 'temp', fileName);

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
        });
        const response = await s3.send(command);

        const writeStream = fs.createWriteStream(tempFilePath);
        response.Body.pipe(writeStream);

        writeStream.on('finish', () => {
            res.setHeader('Content-Type', 'audio/mpeg');

            const readStream = fs.createReadStream(tempFilePath);
            readStream.pipe(res);

            readStream.on('close', () => {
                fs.unlink(tempFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting temporary file: ', err);
                    }
                });
            });
        });

        writeStream.on('error', (err) => {
            console.error('Error writing file:', err);
            res.status(500).json({ message: 'Error processing file' });
        });

    } catch (err) {
        console.error('Error fetching audio', err);
        res.status(500).json({ message: 'Server Error' });
    }
});




app.get('/api/check-album-author', async (req, res) => {
    const { albumName, authorName } = req.query;

    try {
        const authorResult = await pool.query('SELECT * FROM author WHERE author_name = $1', [ authorName ]);
        const authorExists = authorResult.rows.length > 0 ? authorResult.rows[0] : null;


        const albumResult = await pool.query('SELECT * FROM album WHERE album_name = $1 AND author_id = $2', [
            albumName,
            authorExists ? authorExists.author_id : null
        ]);
        const albumExists = albumResult.rows.length > 0 ? albumResult.rows[0] : null;

        res.status(200).json({ albumExists, authorExists });
    }catch (err){
        console.error('Error checking album and author: ',err);
        res.status(500).json({ message: 'Server error'});
    }
})

app.get('add-album-author-form', async (req, res) => {
    const { albumName, authorName, authorExists, albumExists } = req.params;
    res.render('add-album-author-form', {albumName, authorName, authorExists, albumExists});
})

app.post('/api/add-author', async (req, res) => {
    const { author_name } = req.body;

    try{
        const result = await pool.query('INSERT INTO author (author_name) VALUES ($1) RETURNING *', [ author_name ]);

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding author', err);
        res.status(500).json({message: 'Server error'});
    }
})

app.post('/api/add-album', async (req, res) => {
    const { album_name, release_date, genre_id, author_id } = req.body;

    try{
        const result = await pool.query('INSERT INTO album (album_name, release_date, genre_id, author_id) VALUES ($1,$2,$3,$4) RETURNING *',
        [ album_name, release_date, genre_id, author_id ]
    );

    res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding album: ',err);
        res.status(500).json({message: 'Server Error'});
    }
})

app.post('/api/add-song', async(req, res) => {
    const { title, album_id, author_id, release_date, genre_id, url} = req.body;

    try{
        const result = await pool.query('INSERT INTO song (title, album_id, author_id, release_date, genre_id, url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [title, album_id, author_id, release_date, genre_id, url]
        );

        res.status(200).json(result.rows[0]);
    } catch (err){
        console.error('Error adding song: ', err);
        res.status(500).json({message: 'Server error'});
    }
})

app.get('/api/request-count', async(req, res) => {
    try{
        const result = await pool.query(`SELECT COUNT('request_id') FROM requests WHERE status = 'Pending'`);
        res.status(200).json(result.rows);
    }catch (err){
        console.error('Faild to count requests' ,err);
        res.status(500).json({message: 'Server error'});
    }
})

app.get('/api/albums/:album_name', async(req, res) => {
    const { album_name } = req.params;
    try{
        const result = await pool.query('SELECT * FROM album WHERE album_name = $1', [album_name]);
        if(result.rows.length === 0){
            return res.status(404).json({error: 'album not found'});
        }

        res.status(200).json(result.rows[0]);
        
    }catch (err){
        console.error('Failed finding album', err);
        res.status(500).json({message: 'Server error'});
    }
})

app.post('/api/songs/check', async ( req, res) => {
    const { title, album_id } = req.body;

    try{
        const songExists = await pool.query(
            'SELECT 1 FROM song WHERE title = $1 AND album_id = $2',
            [ title, album_id]
        );

        if (songExists.rows.length > 0) {
            return res.status(200).json({ exists: true});
        }

        res.status(200).json({exists: false});
    } catch(err){
        console.error('Error checking song:', err);
        res.status(500).json({message: 'Server Error'});
    }
})

app.get('/api/songs/:song_id', async (req, res) => {
    const { song_id } = req.params;

    try{
        const songQuery = await pool.query('SELECT * FROM song WHERE song_id = $1', [song_id]);

        if(songQuery.rows.length === 0 ){
            return res.status(404).json({error: 'Song not found'});
        }
        
        const song  = songQuery.rows[0];
        const s3Key = song.url.split('.com/')[1];
        const fileName = path.basename(s3Key);
        const localFilePath = path.join(__dirname, 'temp', fileName);

        
        
        const getObjectParams = {
            Bucket: bucketName,
            Key: s3Key,
        };

        const command = new GetObjectCommand(getObjectParams);
        const response = await s3.send(command);

        const writeStream = fs.createWriteStream(localFilePath);
        response.Body.pipe(writeStream);
        

        writeStream.on('finish', () => {
            res.setHeader = ('ContnetType', allowedMimeType);
            const readStream = fs.createReadStream(localFilePath); 

            readStream.on('open', () =>{
                readStream.pipe(res);
            })
            readStream.on('error', (err) =>{
                console.error('Error stream the file: ',err);
                res.status(500).json({error: 'Failed to stream file'});
            });
    
            readStream.on('close', () => {
                fs.unlink(localFilePath, (err) => {
                    if (err){
                        console.error('Error deleting temporary file: ', err);
                    };
                });
            });
        });

    
        writeStream.on('error', (err) => {
            console.error('Error writing file to local storage: ', err);
            res.status(500).json({ error: 'Failed to save file locally'});
        });
    } catch (err) {
        console.error('Error fetching song: ', err);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.get('/api/songs', async (req, res) => {
    try{
        const songs = await pool.query('SELECT song.song_id, song.url, song.title, author.author_name as artist FROM song INNER JOIN author on song.author_id = author.author_id');
        res.status(200).json(songs.rows);
    } catch (err) {
        console.error('Error fetching songs: ',err);
        res.status(500).json({error: 'Internal server error'});
    }
})

app.put('/api/requests/:id', async (req, res) => {
    const { id } = req.params; // ID żądania do aktualizacji
    const { title, album, author, genre, release_date, status } = req.body; // Dane do aktualizacji

    // Sprawdzenie, czy wszystkie wymagane pola zostały przesłane
    if (!title || !album || !author || !genre || !release_date || !status) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Aktualizacja rekordu w bazie danych
        const result = await pool.query(
            `UPDATE requests 
            SET title = $1, 
                album = $2, 
                author = $3, 
                genre_id = $4, 
                release_date = $5, 
                status = $6 
            WHERE request_id = $7 
            RETURNING *`,
            [title, album, author, genre, release_date, status, id]
        );

        // Jeśli żądanie nie istnieje, zwróć błąd
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // Sukces: zwróć zaktualizowane dane
        res.status(200).json({
            message: 'Request updated successfully',
            request: result.rows[0],
        });
    } catch (err) {
        console.error('Error updating request: ', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/playlists', async (req, res) => {
    const { playlist_name, playlist_description, user_id} = req.body;


    try {

     // 1. Dodajemy nową playlistę do tabeli new_playlist
        const newPlaylistResult = await pool.query(
            `INSERT INTO new_playlist (playlist_name, playlist_description, user_id) 
             VALUES ($1, $2, $3) RETURNING playlist_id`,
            [playlist_name, playlist_description, user_id]
        );

        const playlistId = newPlaylistResult.rows[0].playlist_id;

        

        await pool.query('INSERT INTO playlist (playlist_id) VALUES ($1)', [playlistId]);

        res.status(201).json({ message: 'Playlist created successfully', playlist_id: playlistId });
    } catch (err) {
        
        console.error('Error creating playlist:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/api/user/playlists', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).json({ message: 'Missing user_id parameter' });
    }

    try{
        const playlistQuery = await pool.query(`
            SELECT playlist_id, playlist_name, playlist_description
            FROM new_playlist
            WHERE user_id = $1`, [user_id]);

            if(playlistQuery.rows.length === 0){
                return res.status(404).json({message: 'No playlist found for this user'})
            }

            res.status(200).json(playlistQuery.rows);
    }catch (err){
        console.error('Error fetching plalists: ', err);
        res.status(500).json({message: 'Internal state error'});
    }
})

app.delete('/api/user/playlist/delete', async (req, res) => {
    const { playlist_id } = req.query;

    if(!playlist_id){
        return res.status(400).json({message: 'Failed to find the playlist'})
    }
    try{
        const response = await pool.query('DELETE FROM playlist WHERE playlist_id = $1', [playlist_id])
        

        await pool.query('DELETE FROM new_playlist WHERE playlist_id = $1', [playlist_id])
        res.status(200).json({message: 'Playlist deleted successfully.'})
    } catch (err) {
        console.error('Failed deleting the playlist', err);
        res.status(500).json({message: 'Internal state error'});
    }
    
})

app.get('/api/search/songs/', async (req, res) => {
    const { query } = req.query;

    if(!query || query.trim() === '') {
        return res.status(400).json({message: 'Query parameter is required'});
    }

    try {
        const searchQuery = `
        SELECT s.song_id, s.title, s.release_date, s.url, 
        a.album_name, au.author_name, g.genre_name
        FROM song s
        LEFT JOIN album a ON s.album_id = a.album_id
        LEFT JOIN author au ON s.author_id = au.author_id
        LEFT JOIN genre g ON s.genre_id = g.genre_id
        WHERE LOWER(s.title) LIKE LOWER($1)
            OR LOWER(a.album_name) LIKE LOWER($1)
            OR LOWER(au.author_name) LIKE LOWER($1)
        `;

        const values = [`%${query}%`];

        const result = await pool.query(searchQuery, values);

        if(result.rows.length === 0){
            return res.status(404).json({message: 'No songs found'});
        }

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error searching for songs: ', err);
        res.status(500).json({message: 'Internal state error'});
    }
})