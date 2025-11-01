const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Configuration, OpenAIApi } = require("openai");
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware untuk keamanan
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Batasi setiap IP ke 100 permintaan per windowMs
    message: "Terlalu banyak permintaan dari IP ini, coba lagi setelah 15 menit."
});
app.use(limiter);

app.use(express.json({ limit: '10kb' })); // Batasi ukuran JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const usersDataPath = path.join(__dirname, 'users.json');
const messagesDataPath = path.join(__dirname, 'messages.json');
const uploadsDir = path.join(__dirname, 'public', 'uploads');

// Pastikan direktori uploads ada
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Fungsi untuk membaca data pengguna dari file
function readUsersData() {
    try {
        const data = fs.readFileSync(usersDataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users data:', error);
        return [];
    }
}

// Fungsi untuk menulis data pengguna ke file
function writeUsersData(users) {
    try {
        fs.writeFileSync(usersDataPath, JSON.stringify(users, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing users data:', error);
    }
}

// Fungsi untuk membaca data pesan dari file
function readMessagesData() {
    try {
        const data = fs.readFileSync(messagesDataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading messages data:', error);
        return [];
    }
}

// Fungsi untuk menulis data pesan ke file
function writeMessagesData(messages) {
    try {
        fs.writeFileSync(messagesDataPath, JSON.stringify(messages, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing messages data:', error);
    }
}

// Konfigurasi Multer untuk unggah file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Batasi ukuran file menjadi 10MB
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb("Error: Hanya file gambar dan dokumen yang diizinkan!");
        }
    }
});

// Konfigurasi OpenAI API
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Fungsi untuk validasi input
function validateInput(input) {
    const regex = /^[a-zA-Z0-9\s.,?!]+$/;
    return regex.test(input);
}

// Endpoint untuk pendaftaran
app.post('/register', async (req, res) => {
    const { email, password } = req.body;

    if (!validateInput(email) || !validateInput(password)) {
        return res.status(400).json({ message: 'Input tidak valid' });
    }

    const users = readUsersData();

    // Cek apakah email sudah terdaftar
    if (users.find(user => user.email === email)) {
        return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: uuidv4(),
        email: email,
        password: hashedPassword,
        profilePicture: '/assets/default_profile.png' // Gambar profil default
    };

    users.push(newUser);
    writeUsersData(users);

    res.status(201).json({ message: 'Pendaftaran berhasil' });
});

// Endpoint untuk login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!validateInput(email) || !validateInput(password)) {
        return res.status(400).json({ message: 'Input tidak valid' });
    }

    const users = readUsersData();

    const user = users.find(user => user.email === email);
    if (!user) {
        return res.status(400).json({ message: 'Email tidak terdaftar' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).json({ message: 'Password salah' });
    }

    res.status(200).json({ message: 'Login berhasil', userId: user.id });
});

// Endpoint untuk mengirim pesan
app.post('/send-message', upload.single('file'), (req, res) => {
    const { senderId, messageText } = req.body;

    if (!validateInput(messageText)) {
        return res.status(400).json({ message: 'Input tidak valid' });
    }

    const file = req.file;

    const newMessage = {
        id: uuidv4(),
        senderId: senderId,
        text: messageText,
        file: file ? '/uploads/' + file.filename : null,
        timestamp: new Date().toISOString()
    };

    const messages = readMessagesData();
    messages.push(newMessage);
    writeMessagesData(messages);

    res.status(201).json({ message: 'Pesan terkirim', newMessage: newMessage });
});

// Endpoint untuk mendapatkan pesan
app.get('/messages', (req, res) => {
    const messages = readMessagesData();
    res.status(200).json(messages);
});

// Endpoint untuk mendapatkan respons dari Rela AI
app.post('/ask-rela-ai', async (req, res) => {
    const { prompt } = req.body;

    if (!validateInput(prompt)) {
        return res.status(400).json({ message: 'Input tidak valid' });
    }

    try {
        const completion = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 150,
        });
        const aiResponse = completion.data.choices[0].text;
        res.status(200).json({ response: aiResponse });
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        res.status(500).json({ error: 'Failed to get response from Rela AI' });
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
