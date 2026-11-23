const canvas = document.getElementById("stage") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2");
console.log("petri booting", { webgl2: !!gl });
