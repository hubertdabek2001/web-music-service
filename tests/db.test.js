const pool = require('../db');
const { getAlbums, getAlbumById } = require('../app'); 

jest.mock('../db'); 

describe('Database Queries', () => {
    afterEach(() => {
        jest.clearAllMocks(); 
    });

    it('should fetch all albums', async () => {

        const mockAlbums = [
            { album_id: 1, album_name: 'Album 1', release_date: '2023-01-01', genre_id: 1, author_id: 1 },
            { album_id: 2, album_name: 'Album 2', release_date: '2023-01-02', genre_id: 2, author_id: 2 },
        ];
        pool.query.mockResolvedValueOnce({ rows: mockAlbums });


        const albums = await getAlbums();


        expect(albums).toEqual(mockAlbums);
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM album');
    });

    it('should fetch album by ID', async () => {

        const mockAlbum = { album_id: 1, album_name: 'Album 1', release_date: '2023-01-01', genre_id: 1, author_id: 1 };
        pool.query.mockResolvedValueOnce({ rows: [mockAlbum] });

        const album = await getAlbumById(1);

        expect(album).toEqual(mockAlbum);
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM album WHERE album_id = $1', [1]);
    });

    it('should handle empty results for getAlbumById', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const album = await getAlbumById(999);

        expect(album).toBeUndefined();
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM album WHERE album_id = $1', [999]);
    });

    it('should handle database errors', async () => {
        pool.query.mockRejectedValueOnce(new Error('Database error'));

        await expect(getAlbums()).rejects.toThrow('Database error');
    });
});
