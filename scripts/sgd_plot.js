(function () {
    const MODEL_IDS = [6, 7, 8];

    const COLORS = {
        6: "#4a8fa8",
        7: "#c4732d",
        8: "#8c4009"
    };

    function initCharts() {
        if (typeof d3 === "undefined") { setTimeout(initCharts, 80); return; }

        Promise.all([
            d3.csv("data/sgd_metadata.csv"),
            d3.csv("data/sgd_output.csv")
        ]).then(function ([metadata, output]) {

            // Build lookup: model_id -> learning_rate
            const lrMap = {};
            metadata.forEach(row => {
                const id = +row.model_id;
                if (MODEL_IDS.includes(id)) {
                    lrMap[id] = +row.learning_rate;
                }
            });

            // Group output rows by model_id, keeping only target models
            const seriesMap = {};
            MODEL_IDS.forEach(id => {
                seriesMap[id] = { epoch: [], loss: [], batch: [], full: [] };
            });

            output.forEach(row => {
                const id = +row.model_id;
                if (!MODEL_IDS.includes(id)) return;
                seriesMap[id].epoch.push(+row.epoch);
                seriesMap[id].loss.push(row.train_loss ? +row.train_loss : null);
                seriesMap[id].batch.push(row.sharpness_H_batch ? +row.sharpness_H_batch : null);
                seriesMap[id].full.push(row.sharpness_H_full ? +row.sharpness_H_full : null);
            });

            // Build MODELS array with resolved learning rates and colors
            const MODELS = MODEL_IDS.map(id => ({
                id,
                lr: lrMap[id],
                label: "η = " + lrMap[id],
                color: COLORS[id],
                thresh: 2 / lrMap[id],
                series: seriesMap[id]
            }));

            drawChart({
                containerId: "sgd-loss-chart",
                title: "Training Loss",
                yKey: "loss",
                yLabel: "MSE Loss",
                yDomain: [0, 0.5],
                thresholds: false,
                models: MODELS
            });
            drawChart({
                containerId: "sgd-batch-chart",
                title: "Batch Sharpness",
                yKey: "batch",
                yLabel: "Sharpness",
                yDomain: [0, 62],
                thresholds: true,
                models: MODELS
            });
            drawChart({
                containerId: "sgd-full-chart",
                title: "Full Hessian Sharpness",
                yKey: "full",
                yLabel: "Sharpness",
                yDomain: [0, 62],
                thresholds: true,
                models: MODELS
            });

        }).catch(function (err) {
            console.error("sgd-charts: failed to load CSV files", err);
        });
    }

    function drawChart({ containerId, title, yKey, yLabel, yDomain, thresholds, models }) {
        const W = 340, H = 235;
        const margin = { top: 38, right: 22, bottom: 42, left: 52 };
        const iw = W - margin.left - margin.right;
        const ih = H - margin.top - margin.bottom;

        const svg = d3.select("#" + containerId)
            .append("svg")
            .attr("width", W).attr("height", H)
            .style("background", "#fff")
            .style("border", "1.5px solid #e8ddd4")
            .style("border-radius", "8px")
            .style("display", "block");

        const g = svg.append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        svg.append("text")
            .attr("x", W / 2).attr("y", 22)
            .attr("text-anchor", "middle")
            .attr("font-family", "Hanken Grotesk, sans-serif")
            .attr("font-weight", "500").attr("font-size", "13px")
            .attr("fill", "#111827").text(title);

        const xScale = d3.scaleLinear().domain([1, 1000]).range([0, iw]);
        const yScale = d3.scaleLinear().domain(yDomain).range([ih, 0]).clamp(true);

        // Grid lines
        g.append("g")
            .call(d3.axisLeft(yScale).ticks(4).tickSize(-iw).tickFormat(""))
            .call(ax => ax.select(".domain").remove())
            .call(ax => ax.selectAll("line").attr("stroke", "#f0ebe5").attr("stroke-width", 1));

        // X axis
        g.append("g")
            .attr("transform", "translate(0," + ih + ")")
            .call(d3.axisBottom(xScale).ticks(5))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", "Hanken Grotesk, sans-serif").attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        // Y axis
        g.append("g")
            .call(d3.axisLeft(yScale).ticks(4))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", "Hanken Grotesk, sans-serif").attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        // Axis labels
        g.append("text")
            .attr("x", iw / 2).attr("y", ih + 33)
            .attr("text-anchor", "middle")
            .attr("font-family", "Hanken Grotesk, sans-serif")
            .attr("font-size", "10px").attr("fill", "#999")
            .text("Epoch");

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -ih / 2).attr("y", -38)
            .attr("text-anchor", "middle")
            .attr("font-family", "Hanken Grotesk, sans-serif")
            .attr("font-size", "10px").attr("fill", "#999")
            .text(yLabel);

        const line = d3.line()
            .x(d => xScale(d.e))
            .y(d => yScale(d.v))
            .defined(d => d.v != null)
            .curve(d3.curveMonotoneX);

        models.forEach(m => {
            const pts = m.series.epoch.map((e, i) => ({ e, v: m.series[yKey][i] }));

            if (thresholds && m.thresh <= yDomain[1] * 1.08) {
                g.append("line")
                    .attr("x1", 0).attr("x2", iw)
                    .attr("y1", yScale(m.thresh)).attr("y2", yScale(m.thresh))
                    .attr("stroke", m.color).attr("stroke-width", 1)
                    .attr("stroke-dasharray", "5,4").attr("opacity", 0.6);
            }

            g.append("path")
                .datum(pts)
                .attr("fill", "none")
                .attr("stroke", m.color)
                .attr("stroke-width", 1.8)
                .attr("opacity", 0.88)
                .attr("d", line);
        });

        // Legend
        const legendG = svg.append("g")
            .attr("transform", "translate(" + (margin.left + 6) + "," + (H - 50) + ")");
        models.forEach((m, i) => {
            const lx = i * 104;
            legendG.append("line")
                .attr("x1", lx).attr("x2", lx + 16)
                .attr("y1", 0).attr("y2", 0)
                .attr("stroke", m.color).attr("stroke-width", 2);
            legendG.append("text")
                .attr("x", lx + 20).attr("y", 3.5)
                .attr("font-family", "Hanken Grotesk, sans-serif")
                .attr("font-size", "9.5px").attr("fill", "#555")
                .text(m.label);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCharts);
    } else {
        initCharts();
    }
})();