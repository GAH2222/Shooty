window.startGame = function(skinIndex) {
    document.getElementById("menu").style.display = "none";
    const canvas = document.getElementById("gameCanvas");
    canvas.style.display = "block";

    const socket = io("https://YOUR-RENDER-URL"); // change to your Render URL
    setupChat(socket);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const loader = new THREE.GLTFLoader();

    let playerObj;
    let velocity = new THREE.Vector3();
    let grounded = { value: false };
    let canDoubleJump = { value: false };
    let dashCooldown = { value: 0 };
    const keys = {};

    loader.load("assets/Shawty1.glb", gltf => {
        playerObj = gltf.scene;
        scene.add(playerObj);
        camera.position.set(0, 2, 5);
    });

    loader.load("assets/the first map!.glb", gltf => {
        scene.add(gltf.scene);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5,10,7);
    scene.add(light);

    window.addEventListener("keydown", e => keys[e.code] = true);
    window.addEventListener("keyup", e => keys[e.code] = false);

    function animate() {
        requestAnimationFrame(animate);
        if (playerObj) {
            applyMovement(playerObj, keys, velocity, grounded, canDoubleJump, dashCooldown);
            playerObj.position.add(velocity);
            velocity.y -= 0.01;
            if (playerObj.position.y <= 0) { grounded.value = true; playerObj.position.y = 0; velocity.y = 0; }
            socket.emit("move", {
                x: playerObj.position.x,
                y: playerObj.position.y,
                z: playerObj.position.z,
                rotY: playerObj.rotation.y,
                skin: skinIndex
            });
        }
        renderer.render(scene, camera);
    }
    animate();
}

