
// logowanie użytkownika


document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    console.log("Username: ", username);
    console.log("Password: ", password);
    try {
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })

        if(response.ok){
            window.location.href = '/dashboard';
        }else{
            document.getElementById('login-error').style.display = 'block';
        }
    }catch (error) {
        console.error('Error loggin in ', error);
        document.getElementById('login-error').style.display = 'block';
    };
});