const canvas = document.getElementById('dotCanvas');
const container = document.getElementById('dotGridContainer');
const ctx = canvas.getContext('2d');

const COLS = 24;
const ROWS = 7;
const DOT_RADIUS = 4;

let dots = [];
let isHovered = false;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    initDots(rect.width, rect.height);
}

function initDots(w, h) {
    const padX = 50;
    const padY = 10;
    const usableW = w - padX * 2;
    const usableH = h - padY * 2;
    const stableY = h / 2;

    dots = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const baseX = padX + (c / (COLS - 1)) * usableW;
            const baseY = padY + (r / (ROWS - 1)) * usableH;
            dots.push({
                baseX,
                baseY,
                stableX: baseX,
                stableY,
                x: baseX,
                y: baseY,
                phase: Math.random() * Math.PI * 2,
                phaseX: Math.random() * Math.PI * 2,
                speedY: 0.35 + Math.random() * 0.55,
                speedX: 0.25 + Math.random() * 0.4,
                ampY: 20 + Math.random() * 30,
                ampX: 5 + Math.random() * 8,
                lerp: 0,
            });
        }
    }
}

let t = 0;

function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);
    t += 0.013;

    const lerpSpeed = isHovered ? 0.06 : 0.025;

    for (const d of dots) {
        const idleX = d.baseX + Math.sin(t * d.speedX + d.phaseX) * d.ampX;
        const idleY = d.baseY + Math.sin(t * d.speedY + d.phase) * d.ampY;

        d.lerp += ((isHovered ? 1 : 0) - d.lerp) * lerpSpeed * 1.6;
        d.lerp = Math.max(0, Math.min(1, d.lerp));

        d.x += ((idleX * (1 - d.lerp) + d.stableX * d.lerp) - d.x) * lerpSpeed;
        d.y += ((idleY * (1 - d.lerp) + d.stableY * d.lerp) - d.y) * lerpSpeed;

        const r = Math.round(140 + (17 - 140) * d.lerp);
        const g = Math.round(64 + (24 - 64) * d.lerp);
        const b = Math.round(9 + (39 - 9) * d.lerp);
        const alpha = 0.45 + 0.55 * d.lerp;

        ctx.beginPath();
        ctx.arc(d.x, d.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
    }

    requestAnimationFrame(draw);
}

container.addEventListener('mouseenter', () => isHovered = true);
container.addEventListener('mouseleave', () => isHovered = false);
container.addEventListener('touchstart', (e) => { e.preventDefault(); isHovered = true; }, { passive: false });
container.addEventListener('touchend', () => isHovered = false);

window.addEventListener('resize', resize);

document.fonts.ready.then(() => {
    resize();
    draw();
});