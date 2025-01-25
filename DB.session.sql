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

  SELECT requests.request_id,
                requests.title,
                requests.album,
                requests.author,
                requests.release_date,
                requests.status,
                requests.created_at,
                STRING_SPLIT(requests.url, '/') AS s3key,
                genre.genre_id,
                genre.genre_name
                FROM requests 
                INNER JOIN genre on requests.genre_id = genre.genre_id 
                WHERE request_id = 7