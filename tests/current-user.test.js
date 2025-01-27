const request = require('supertest');
const app = require('../app'); 
const pool = require('../db'); 
const jwt = require('jsonwebtoken');


jest.mock('../db', () => ({
    query: jest.fn()
}));


jest.mock('jsonwebtoken', () => ({
    verify: jest.fn()
}));

describe('GET /api/current-user', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should return 401 if no token is provided', async () => {
        const res = await request(app).get('/api/current-user').set('Cookie', '');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Not logged in' });
    });

    it('should return 401 if the token is invalid', async () => {
        jwt.verify.mockImplementation(() => {
            throw new Error('Invalid token');
        });

        const res = await request(app)
            .get('/api/current-user')
            .set('Cookie', 'auth_token=invalid_token');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Invalid token' });
    });

    it('should return 404 if the user is not found', async () => {
        jwt.verify.mockReturnValue({ user_id: 1 }); 
        pool.query.mockResolvedValueOnce({ rows: [] }); 

        const res = await request(app)
            .get('/api/current-user')
            .set('Cookie', 'auth_token=valid_token');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'User not found' });
        expect(pool.query).toHaveBeenCalledWith(
            'SELECT user_id, first_name, last_name, username, email, role, registration_date FROM users where user_id = $1',
            [1]
        );
    });

    it('should return 200 with user data if the token is valid and user exists', async () => {
        const mockUser = {
            user_id: 50,
            first_name: 'Hubert',
            last_name: 'Dabek',
            email: 'hdabek69@gmail.com',
            role: 'user'
        };

        jwt.verify.mockReturnValue({ user_id: 1 }); 
        pool.query.mockResolvedValueOnce({ rows: [mockUser] }); 

        const res = await request(app)
            .get('/api/current-user')
            .set('Cookie', 'auth_token=valid_token');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockUser);
        expect(pool.query).toHaveBeenCalledWith(
            'SELECT user_id, first_name, last_name, username, email, role, registration_date FROM users where user_id = $1',
            [1]
        );
    });
});
