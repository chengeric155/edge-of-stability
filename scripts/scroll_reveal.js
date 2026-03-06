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
    const revealElement = (element, scrollObserver) => {
        element.classList.add('revealed');

        if (scrollObserver) {
            scrollObserver.unobserve(element);
        }
    };

    const observer = new IntersectionObserver((entries, scrollObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            revealElement(entry.target, scrollObserver);
        });
    }, {
        threshold: 0.22,
        rootMargin: '0px 0px -14% 0px',
    });

    revealTargets.forEach((element) => {
        observer.observe(element);
    });

    const footer = document.querySelector('.footer');

    if (footer) {
        const revealFooterNearPageEnd = () => {
            const reachedPageEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;

            if (!reachedPageEnd || footer.classList.contains('revealed')) {
                return;
            }

            revealElement(footer, observer);
            window.removeEventListener('scroll', revealFooterNearPageEnd);
            window.removeEventListener('resize', revealFooterNearPageEnd);
        };

        window.addEventListener('scroll', revealFooterNearPageEnd, { passive: true });
        window.addEventListener('resize', revealFooterNearPageEnd);
        revealFooterNearPageEnd();
    }
}
