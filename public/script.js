// logowanie użytkownika

document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.getElementById('username');
    const password = document.getElementById('password');

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })

        if(response.ok){
            window.location.href = '/dashboard';
        }else{
            document.getElementById('login-error').style.display = 'block';
        }
    }catch (err) {
        console.error('Error loggin in ', err);
        document.getElementById('login-error').style.display = 'block';
    };
});