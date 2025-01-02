async function checkCurrentUser(){
    try{
        const response = await fetch('/api/current-user', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials:"include"
        });

        if(response.ok){
            const user = await response.json();
            document.getElementById('dashboard-username').innerHTML = `<a href="">${user.first_name}</a>`;
            
            
        }else {

        }
    }catch (err) {
        console.error('Error checking user:', error);
        
    }
}
document.addEventListener('DOMContentLoaded', checkCurrentUser);