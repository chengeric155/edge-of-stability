const revealSelectors = [
    '.hero-title-container',
    '.hero-text-wrapper',
    '.authors',
    '.section-two-column',
    '.content-section > .section-title',
    '.content-section > .section-text-full',
    '.content-section > .image-grid-3',
    '.content-section > .adam-visuals',
    '.content-section > .window-box',
    '.homepage > .window-box',
    '.footer',
];

const revealTargets = [];

revealSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
        if (revealTargets.includes(element)) {
            return;
        }

        revealTargets.push(element);
    });
});

revealTargets.forEach((element, index) => {
    element.classList.add('reveal-on-scroll');
    element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 80}ms`);
});

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
    revealTargets.forEach((element) => {
        element.classList.add('revealed');
    });
} else {
    const observer = new IntersectionObserver((entries, scrollObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            entry.target.classList.add('revealed');
            scrollObserver.unobserve(entry.target);
        });
    }, {
        threshold: 0.22,
        rootMargin: '0px 0px -14% 0px',
    });

    revealTargets.forEach((element) => {
        observer.observe(element);
    });
}
