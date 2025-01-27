const request = require('supertest');
const app = require('../app'); 
const pool = require('../db'); 

jest.mock('../db');

describe('POST /api/add-album', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should add an album successfully', async () => {
        const mockAlbum = {
            album_name: 'Test Album',
            release_date: '2023-12-25',
            genre_id: 1,
            author_id: 2,
        };

        const mockResult = {
            rows: [{
                album_id: 1,
                ...mockAlbum,
            }],
        };
        pool.query.mockResolvedValueOnce(mockResult);

        const res = await request(app)
            .post('/api/add-album')
            .send(mockAlbum);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockResult.rows[0]);
        expect(pool.query).toHaveBeenCalledWith(
            'INSERT INTO album (album_name, release_date, genre_id, author_id) VALUES ($1,$2,$3,$4) RETURNING *',
            [mockAlbum.album_name, mockAlbum.release_date, mockAlbum.genre_id, mockAlbum.author_id]
        );
    });

    it('should return 500 on server error', async () => {
        const mockAlbum = {
            album_name: 'Test Album',
            release_date: '2023-12-25',
            genre_id: 1,
            author_id: 2,
        };


        pool.query.mockRejectedValueOnce(new Error('Database error'));

        const res = await request(app)
            .post('/api/add-album')
            .send(mockAlbum);

        expect(res.status).toBe(500); 
        expect(res.body).toEqual({ message: 'Server Error' }); 
        expect(pool.query).toHaveBeenCalledWith(
            'INSERT INTO album (album_name, release_date, genre_id, author_id) VALUES ($1,$2,$3,$4) RETURNING *',
            [mockAlbum.album_name, mockAlbum.release_date, mockAlbum.genre_id, mockAlbum.author_id]
        );
    });
});
