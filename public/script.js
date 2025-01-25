let audioPlayer = null;

function initializeAudioPlayer() {
    if (!audioPlayer) {
        audioPlayer = new Audio();
        audioPlayer.controls = true;
        audioPlayer.style.position = "fixed";
        audioPlayer.style.bottom = "0";
        audioPlayer.style.width = "100%";
        document.body.appendChild(audioPlayer);
    }
}

async function playSong(songUrl) {
    if (!audioPlayer) initializeAudioPlayer();
    audioPlayer.src = songUrl;
    audioPlayer.play();
}

async function fetchSongsAndPlay(songId) {
    try {
        const response = await fetch(`/api/songs/${songId}`);
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            playSong(url);
        } else {
            console.error("Error fetching audio:", response.statusText);
        }
    } catch (err) {
        console.error("Error playing song:", err);
    }
}
