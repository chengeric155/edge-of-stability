document.addEventListener('DOMContentLoaded', () => {
    // Wait for fonts/mathjax
    setTimeout(initPlot, 500);
});

function initPlot() {
    const lrSlider = document.getElementById('lrSlider');
    const sharpSlider = document.getElementById('sharpSlider');
    const lrValLabel = document.getElementById('lrVal');
    const sharpValLabel = document.getElementById('sharpVal');
    const statusIndicator = document.getElementById('statusIndicator');

    function drawPlot() {
        const lr = parseFloat(lrSlider.value);
        const sharpness = parseFloat(sharpSlider.value);

        // Update labels
        lrValLabel.textContent = lr.toFixed(2);
        sharpValLabel.textContent = sharpness.toFixed(1);

        // Threshold check
        const threshold = 2 / sharpness;
        const isConverging = lr < threshold;
        const color = isConverging ? "green" : "red";
        const statusText = isConverging ? "Converging" : "Diverging";

        statusIndicator.innerHTML = `Status: <strong style="color: ${color}">${statusText}</strong> (Threshold: \\(\\eta < ${threshold.toFixed(2)}\\))`;

        // Ensure MathJax re-renders the dynamically inserted LaTeX
        if (window.MathJax) MathJax.typesetPromise([statusIndicator]);

        // Generate the Loss Landscape (Parabola)
        const xBackground = [];
        const yBackground = [];
        for (let x = -10.5; x <= 10.5; x += 0.1) {
            xBackground.push(x);
            yBackground.push(0.5 * sharpness * x * x);
        }

        // Simulate Gradient Descent
        let x = 10; // Start far to the right
        const xTrajectory = [x];
        const yTrajectory = [0.5 * sharpness * x * x];

        for (let t = 0; t < 20; t++) {
            // Update rule: x_{t+1} = x_t(1 - \eta \lambda)
            x = x * (1 - lr * sharpness);

            // Cap at a large value so the plot doesn't stretch to infinity visually
            if (Math.abs(x) > 20) break;

            xTrajectory.push(x);
            yTrajectory.push(0.5 * sharpness * x * x);
        }

        // Plotly Configuration
        const traceBackground = {
            x: xBackground,
            y: yBackground,
            type: 'scatter',
            mode: 'lines',
            line: { color: 'black', width: 2 },
            name: 'Loss Landscape',
            hoverinfo: 'none'
        };

        const traceTrajectory = {
            x: xTrajectory,
            y: yTrajectory,
            type: 'scatter',
            mode: 'lines+markers',
            marker: { size: 8, color: color },
            line: { color: color, width: 2, dash: 'dot' },
            name: 'GD Trajectory'
        };

        const layout = {
            autosize: true, // Allow Plotly to determine size based on container
            margin: { l: 60, r: 20, t: 10, b: 40 }, // Increased left margin (l) to give Y-axis room
            showlegend: false,
            xaxis: {
                range: [-11, 11],
                title: {
                    text: 'Parameter (x)',
                    font: { family: 'Hanken Grotesk, sans-serif', size: 14 }
                },
                dtick: 5
            },
            yaxis: {
                range: [-10, 500],
                title: {
                    text: 'Loss f(x)',
                    standoff: 15, // This moves the title away from the axis (to the left)
                    font: { family: 'Hanken Grotesk, sans-serif', size: 14 }
                }
            },
            // Apply font to the tick labels (the numbers)
            font: { family: 'Hanken Grotesk, sans-serif' },
            plot_bgcolor: '#fafaf8',
            paper_bgcolor: '#fafaf8'
        };

        Plotly.react('gdPlot', [traceBackground, traceTrajectory], layout, {
            displayModeBar: false,
            responsive: true
        });
    }

    // Event listeners
    lrSlider.addEventListener('input', drawPlot);
    sharpSlider.addEventListener('input', drawPlot);

    window.addEventListener('resize', () => {
        Plotly.Plots.resize('gdPlot');
    });
    
    // Initial draw
    drawPlot();
}