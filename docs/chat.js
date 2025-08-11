window.setupChat = function(socket) {
    const chatContainer = document.getElementById("chatContainer");
    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");

    let chatOpen = false;

    window.addEventListener("keydown", e => {
        if (e.code === "KeyT") {
            chatOpen = true;
            chatContainer.style.display = "flex";
            chatInput.focus();
        } else if (e.code === "Enter" && chatOpen) {
            const msg = chatInput.value;
            if (msg.trim() !== "") {
                socket.emit("chatMessage", msg);
                chatInput.value = "";
            }
            chatOpen = false;
            chatContainer.style.display = "none";
        }
    });

    socket.on("chatMessage", data => {
        const div = document.createElement("div");
        div.textContent = `${data.id}: ${data.msg}`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

