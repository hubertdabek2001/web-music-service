INSERT INTO users (
    username,
    email,
    password,
    role,
    first_name,
    last_name
  )
VALUES (
    'pola123',
    'polak@polak.com',
    'polak123',
    'user',
    'albert',
    'polski'
  );


CREATE TABLE new_playlist (
    playlist_id SERIAL PRIMARY KEY,
    playlist_name VARCHAR(255) NOT NULL,
    playlist_description TEXT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

delete from new_playlist
delete from playlist

DROP TABLE NEW_PLAYLIST
DROP TABLE playlist

CREATE TABLE playlist (
    playlist_song_id SERIAL PRIMARY KEY,
    playlist_id INT NOT NULL,
    song_id INT REFERENCES song(song_id) ON DELETE CASCADE, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (playlist_id) REFERENCES new_playlist(playlist_id)
);

CREATE TABLE playlist_songs (
    playlist_songs_id SERIAL PRIMARY KEY,
    playlist_id INT REFERENCES new_playlist(playlist_id) ON DELETE CASCADE,
    song_id INT REFERENCES song(song_id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW() -- Dla śledzenia czasu dodania
);

INSERT INTO song (
    title,
    release_date,
    genre_id,
    url,
    album_id,
    author_id,
    song_id
  )
VALUES (
    'title:text',
    'release_date:date',
    genre_id:integer,
    'url:text',
    album_id:integer,
    author_id:integer,
    song_id:integer
  );

INSERT INTO playlist (playlist_id, song_id)
VALUES (1, 10);

SELECT s.song_id, s.title, s.url, a.author_name as author
             FROM song s
             JOIN playlist ps ON s.song_id = ps.song_id
             JOIN author a ON s.author_id = a.author_id
             WHERE ps.playlist_id = 1