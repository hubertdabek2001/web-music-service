const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const pool = require('../db');

jest.mock('../db');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('POST /login', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should log in successfully with valid credentials', async () => {
        const mockUser = {
            user_id: 1,
            username: 'testuser',
            password: 'hashedpassword',
            role: 'user',
        };

        pool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

        bcrypt.compare.mockResolvedValueOnce(true);

        jwt.sign.mockReturnValue('mockedToken');

        const res = await request(app)
            .post('/login')
            .send({
                username: 'testuser',
                password: 'password123',
            });

        expect(res.status).toBe(302);
        expect(res.headers['set-cookie']).toBeDefined();
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE username = $1', ['testuser']);
        expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
    });

    it('should return 401 with invalid credentials', async () => {
        const mockUser = {
            user_id: 1,
            username: 'testuser',
            password: 'hashedpassword',
            role: 'user',
        };

        pool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });
        bcrypt.compare.mockResolvedValueOnce(false);

        const res = await request(app)
            .post('/login')
            .send({
                username: 'testuser',
                password: 'wrongpassword',
            });

        expect(res.status).toBe(401);
        expect(res.text).toBe('Invalid credentials');
        expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashedpassword');
    });

    it('should return 404 if user does not exist', async () => {
        pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const res = await request(app)
            .post('/login')
            .send({
                username: 'nonexistentuser',
                password: 'password123',
            });

        expect(res.status).toBe(404);
        expect(res.text).toBe('User not found');
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE username = $1', ['nonexistentuser']);
    });

    it('should handle internal server errors', async () => {
        pool.query.mockRejectedValueOnce(new Error('Database error'));
        const res = await request(app)
            .post('/login')
            .send({
                username: 'testuser',
                password: 'password123',
            });

        expect(res.status).toBe(500);
        expect(res.text).toBe('Internal server error');
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE username = $1', ['testuser']);
    });
});
