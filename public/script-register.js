
document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const first_name = document.getElementById('first_name').value;
    const last_name = document.getElementById('last_name').value;
    const username = document.getElementById('username').value;
    const email = document.getElementById('email_address').value;
    const password = document.getElementById('password').value;
    const role = 'user';

    console.log(first_name, last_name, username, email, password, role);

    try{
        const response = await fetch ('/register' , {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password, role, first_name, last_name })
        })
        if(response.ok){
            document.getElementById('register-success').style.display = 'block';
        }else if(response.status === 400){
            document.getElementById('register-error').innerHTML = 'A verified account with the same email address already exists'
            document.getElementById('register-error').style.display = 'block';
        }else{
            document.getElementById('register-error').style.display = 'block';
        }

    } catch (err){
        console.log("Register attempt failed", err);
        document.getElementById('register-error').style.display = 'block';
    }
})

function passawordRequirementsCheck(){
    var emailAddress = document.getElementById("email_address").value;
    var password = document.getElementById("password").value;
    var confirmPassword = document.getElementById("confirm_password").value;
    var username = document.getElementById('username').value;
    var uppercaseCheck = /[A-Z]/;
    var lowecaseCheck = /[a-z]/;
    var numberCheck = /[0-9]/;
    var emailAddressCheck = /[@.]/;

    var format = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/

    if(format.test(username)){
        alert('Do not user any non alpha numeric characters in your username!')
        return;
    }

    if(!emailAddressCheck.test(emailAddress)){
        alert("Please provide correct email address.")
        return;
    }

    if(password.length < 8){
        alert("Password must be at least 8 characters.")
        return;
    }
    

    if(!uppercaseCheck.test(password) || !lowecaseCheck.test(password) || !numberCheck.test(password)){
        alert("Your password must contain at least: 8 characters, 1 lowercase letter,  1 uppercase later, 1 number");
        return;
    }

    if(confirmPassword != password){
        alert("Passwords do not match.");
        return;
        
    } 
    
}
