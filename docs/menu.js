document.getElementById("joinBtn").addEventListener("click", () => {
    const selectedSkin = document.getElementById("skinSelect").value;
    window.startGame(parseInt(selectedSkin));
});

