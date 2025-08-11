window.applyMovement = function(player, keys, velocity, grounded, canDoubleJump, dashCooldown) {
    const speed = 0.15;
    if (keys["KeyW"]) player.position.z -= speed;
    if (keys["KeyS"]) player.position.z += speed;
    if (keys["KeyA"]) player.position.x -= speed;
    if (keys["KeyD"]) player.position.x += speed;

    if (keys["Space"]) {
        if (grounded.value) {
            velocity.y = 0.35;
            grounded.value = false;
            canDoubleJump.value = true;
        } else if (canDoubleJump.value) {
            velocity.y = 0.35;
            canDoubleJump.value = false;
        }
    }

    if (keys["KeyQ"] && dashCooldown.value <= 0) {
        velocity.z -= 1;
        dashCooldown.value = 60;
    }

    dashCooldown.value = Math.max(0, dashCooldown.value - 1);
}

