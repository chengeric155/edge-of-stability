(function () {
    const FONT = "Hanken Grotesk, sans-serif";
    const GREY = "#c0bdb9";
    const BASE_PATH = "data/adam_data/";

    function extractVal(filename, prefix) {
        return parseFloat(filename.replace(prefix, "").replace(".csv", ""));
    }

    class ChartGroup {
        constructor(files, prefix, labelsMap, colors, containers, thresholdFn) {
            this.files = files;
            this.prefix = prefix;
            this.labelsMap = labelsMap;
            this.colors = colors;
            this.containers = containers;
            this.thresholdFn = thresholdFn; // Function to calculate threshold line for a model

            this.selectedModel = null;
            this.hoveredModelId = null;
            this.hoveredEpoch = null;
            this.activeChartIdx = null;
            this.leaveTimer = null;
            this.updaters = [];
            this.models = [];

            this.loadAndDraw();
        }

        lineOpacity(id) {
            if (this.selectedModel !== null) return id === this.selectedModel ? 0.92 : 0.06;
            if (this.hoveredModelId !== null) return id === this.hoveredModelId ? 0.92 : 0.18;
            return 0.88;
        }

        lineStroke(id) {
            if (this.selectedModel !== null && id !== this.selectedModel) return GREY;
            if (this.hoveredModelId !== null && id !== this.hoveredModelId) return GREY;
            return this.colors[id];
        }

        legendOpacity(id) {
            return (this.selectedModel !== null && id !== this.selectedModel) ? 0.28 : 1;
        }

        broadcast() { this.updaters.forEach(u => u()); }

        loadAndDraw() {
            const promises = this.files.map(f => d3.csv(BASE_PATH + f).then(data => ({ file: f, data })));

            Promise.all(promises).then(results => {
                this.models = results.map((res, idx) => {
                    const val = extractVal(res.file, this.prefix);
                    const d = res.data;
                    const epochs = [], loss = [], sharpH = [], sharpA = [];

                    d.forEach(row => {
                        epochs.push(+row.step);
                        loss.push(+row.train_loss);
                        sharpH.push(row.lambda_H !== "" ? +row.lambda_H : null);
                        sharpA.push(row.lambda_A !== "" ? +row.lambda_A : null);
                    });

                    const modelId = val;
                    return {
                        id: modelId,
                        label: this.labelsMap(val),
                        threshold: this.thresholdFn ? this.thresholdFn(val) : null,
                        color: "#ccc",
                        series: {
                            lossEpoch: epochs, loss: loss,
                            sharpHEpoch: epochs.filter((_, i) => sharpH[i] !== null), sharpH: sharpH.filter(v => v !== null),
                            sharpAEpoch: epochs.filter((_, i) => sharpA[i] !== null), sharpA: sharpA.filter(v => v !== null)
                        }
                    };
                });

                this.models.sort((a, b) => a.id - b.id);
                const colorVals = Object.values(this.colors);
                this.models.forEach((m, i) => {
                    const c = colorVals[i % colorVals.length];
                    m.color = c;
                    this.colors[m.id] = c;
                });

                this.containers.forEach((cfg, i) => {
                    this.drawLineChart({ ...cfg, models: this.models, chartIdx: i });
                });
            });
        }

        drawLineChart({ containerId, title, yKey, epKey, yLabel, yDomain, logScale, models, chartIdx }) {
            const cont = document.getElementById(containerId);
            if (!cont) return;

            const W = 340, H = 280, M = { top: 38, right: 22, bottom: 72, left: 62 };
            const iw = W - M.left - M.right, ih = H - M.top - M.bottom;

            const svg = d3.select(cont).append("svg").attr("width", W).attr("height", H)
                .style("background", "#fff").style("border", "1.5px solid #e8ddd4")
                .style("border-radius", "8px").style("cursor", "crosshair");

            svg.append("text").attr("x", W / 2).attr("y", 22).attr("text-anchor", "middle")
                .attr("font-family", FONT).attr("font-weight", "500").attr("font-size", "13px")
                .attr("fill", "#111827").text(title);

            const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
            const maxEpoch = d3.max(models[0].series[epKey]);
            const xScale = d3.scaleLinear().domain([0, maxEpoch]).range([0, iw]);
            const yScale = logScale ? d3.scaleLog().domain(yDomain).range([ih, 0]).clamp(true) : d3.scaleLinear().domain(yDomain).range([ih, 0]).clamp(true);

            g.append("g").call(d3.axisLeft(yScale).ticks(5).tickSize(-iw).tickFormat("")).call(ax => ax.select(".domain").remove()).call(ax => ax.selectAll("line").attr("stroke", "#f0ebe5"));
            g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(xScale).ticks(5)).call(ax => { ax.select(".domain").attr("stroke", "#d4ccc5"); ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"); });
            g.append("g").call(d3.axisLeft(yScale).ticks(5, logScale ? ".1e" : ".1s")).call(ax => { ax.select(".domain").attr("stroke", "#d4ccc5"); ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"); });

            // DRAW DATA LINES
            const lineFn = d3.line().x(d => xScale(d.e)).y(d => yScale(d.v)).defined(d => d.v !== null && !isNaN(d.v));
            const paths = {}, dots = {}, thresholdLines = {};

            models.forEach(m => {
                const pts = m.series[epKey].map((e, i) => ({ e, v: m.series[yKey][i] }));
                paths[m.id] = g.append("path").datum(pts).attr("fill", "none").attr("stroke", m.color).attr("stroke-width", 1.8).attr("opacity", 0.88).attr("d", lineFn)
                    .style("transition", "opacity 220ms ease, stroke 220ms ease").on("click", () => { this.selectedModel = (this.selectedModel === m.id) ? null : m.id; this.broadcast(); });

                // DRAW THRESHOLD LINE (if in a sharpness plot)
                if (m.threshold && (yKey === 'sharpA' || yKey === 'sharpH')) {
                    thresholdLines[m.id] = g.append("line")
                        .attr("x1", 0).attr("x2", iw)
                        .attr("y1", yScale(m.threshold)).attr("y2", yScale(m.threshold))
                        .attr("stroke", m.color).attr("stroke-width", 1.2).attr("stroke-dasharray", "4,4")
                        .attr("opacity", 0.4).style("pointer-events", "none");
                }

                dots[m.id] = g.append("circle").attr("r", 3.5).attr("fill", m.color).attr("stroke", "#fff").attr("stroke-width", 1.5).style("display", "none").style("pointer-events", "none");
            });

            const cursor = g.append("line").attr("y1", 0).attr("y2", ih).attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "4,3").style("display", "none");
            const TIP_W = 155, TIP_LINE = 15, TIP_PAD = 9;
            const tipG = svg.append("g").style("display", "none").style("pointer-events", "none");
            const tipBg = tipG.append("rect").attr("rx", 5).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "#e0d8d0").attr("stroke-width", 1.2).style("filter", "drop-shadow(0 1px 5px rgba(0,0,0,0.08))");
            const tipEpochText = tipG.append("text").attr("font-family", FONT).attr("font-size", "10px").attr("font-weight", "600").attr("fill", "#555");
            const tipRows = models.map(m => {
                const rg = tipG.append("g");
                rg.append("rect").attr("class", "swatch").attr("width", 8).attr("height", 8).attr("rx", 1.5).attr("y", -7);
                rg.append("text").attr("class", "rowlabel").attr("x", 13).attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#444");
                return { g: rg, modelId: m.id };
            });

            const legendG = svg.append("g").attr("transform", `translate(${M.left + 4},${H - 18})`);
            const legendItems = {};
            const xOffset = models.length > 3 ? 70 : 90;
            models.forEach((m, i) => {
                const ig = legendG.append("g").attr("transform", `translate(${i * xOffset}, 0)`).style("cursor", "pointer")
                    .on("mouseenter", () => { this.hoveredModelId = m.id; this.broadcast(); }).on("mouseleave", () => { this.hoveredModelId = null; this.broadcast(); })
                    .on("click", () => { this.selectedModel = (this.selectedModel === m.id) ? null : m.id; this.broadcast(); });
                ig.append("line").attr("x1", 0).attr("x2", 16).attr("stroke", m.color).attr("stroke-width", 2);
                ig.append("text").attr("x", 20).attr("y", 4).attr("font-family", FONT).attr("font-size", "10px").text(m.label);
                legendItems[m.id] = ig;
            });

            const bisect = d3.bisector(d => d).center;
            g.append("rect").attr("width", iw).attr("height", ih).attr("fill", "none").attr("pointer-events", "all")
                .on("mousemove", (event) => {
                    clearTimeout(this.leaveTimer);
                    const [mx, my] = d3.pointer(event);
                    const epArr = models[0].series[epKey];
                    let idx = bisect(epArr, xScale.invert(mx));
                    idx = Math.max(0, Math.min(idx, epArr.length - 1));
                    this.hoveredEpoch = epArr[idx];
                    this.activeChartIdx = chartIdx;
                    this.broadcast();
                })
                .on("mouseleave", () => {
                    this.leaveTimer = setTimeout(() => { this.hoveredEpoch = null; this.hoveredModelId = null; this.activeChartIdx = null; this.broadcast(); }, 50);
                });

            this.updaters.push(() => {
                models.forEach(m => {
                    paths[m.id].attr("stroke", this.lineStroke(m.id)).attr("opacity", this.lineOpacity(m.id));
                    legendItems[m.id].attr("opacity", this.legendOpacity(m.id));
                    if (thresholdLines[m.id]) thresholdLines[m.id].attr("opacity", this.lineOpacity(m.id) * 0.4);
                });
                if (this.hoveredEpoch !== null) {
                    const epArr = models[0].series[epKey];
                    let idx = bisect(epArr, this.hoveredEpoch);
                    idx = Math.max(0, Math.min(idx, epArr.length - 1));
                    const ep = epArr[idx];
                    const cx = xScale(ep);
                    cursor.style("display", null).attr("x1", cx).attr("x2", cx).attr("opacity", this.activeChartIdx === chartIdx ? 0.8 : 0.2);
                    const visibleModels = this.selectedModel !== null ? models.filter(m => m.id === this.selectedModel) : models;
                    models.forEach(m => {
                        const val = m.series[yKey][idx];
                        const isVisible = visibleModels.includes(m) && val != null && !isNaN(val);
                        dots[m.id].style("display", isVisible ? null : "none");
                        if (isVisible) dots[m.id].attr("cx", cx).attr("cy", yScale(val)).attr("fill", this.lineStroke(m.id)).attr("opacity", this.lineOpacity(m.id));
                    });
                    const rows = visibleModels.map(m => ({ m, val: m.series[yKey][idx] })).filter(r => r.val != null && !isNaN(r.val));
                    if (rows.length > 0) {
                        const tipH = TIP_PAD * 2 + TIP_LINE * (rows.length + 1) + 4;
                        tipBg.attr("width", TIP_W).attr("height", tipH);
                        tipEpochText.attr("x", TIP_PAD).attr("y", TIP_PAD + 9).text("Step: " + ep);
                        tipRows.forEach(tr => tr.g.style("display", "none"));
                        rows.forEach((row, i) => {
                            const tr = tipRows.find(t => t.modelId === row.m.id);
                            if (!tr) return;
                            tr.g.style("display", null).attr("transform", `translate(${TIP_PAD},${TIP_PAD + TIP_LINE * (i + 1) + 9})`);
                            tr.g.select(".swatch").attr("fill", this.lineStroke(row.m.id));
                            const valStr = (row.val > 1000) ? row.val.toExponential(2) : row.val.toFixed(4);
                            tr.g.select(".rowlabel").text(row.m.label + ": " + valStr).attr("fill", this.lineStroke(row.m.id));
                        });
                        const svgX = cx + M.left;
                        const tipX = (svgX + 14 + TIP_W > W - 4) ? svgX - TIP_W - 10 : svgX + 14;
                        tipG.style("display", null).attr("transform", `translate(${tipX},${M.top + 6})`);
                    } else { tipG.style("display", "none"); }
                } else {
                    cursor.style("display", "none"); tipG.style("display", "none");
                    models.forEach(m => dots[m.id].style("display", "none"));
                }
            });
        }
    }

    function initCharts() {
        if (typeof d3 === "undefined") { setTimeout(initCharts, 80); return; }
        const PALETTE_1 = { 0: "#4a8fa8", 1: "#c4732d", 2: "#8c4009" };
        const PALETTE_2 = { 0: "#3d7a5b", 1: "#8c6e3d", 2: "#7a3d3d" };
        const PALETTE_3 = { 0: "#5c4a8a", 1: "#a84a6b", 2: "#4a7a8a" };

        // 1. ETA GROUP - Threshold: 2(1 + 0.9) / (eta * 0.1) = 38 / eta
        new ChartGroup(
            ["eta0.0001.csv", "eta0.00032.csv", "eta0.001.csv"],
            "eta",
            val => "η = " + val,
            PALETTE_1,
            [
                { containerId: "adam-eta-loss", title: "Train Loss", yKey: "loss", epKey: "lossEpoch", yLabel: "MSE Loss", logScale: true, yDomain: [0.1, 3] },
                { containerId: "adam-eta-sharp", title: "Preconditioned Sharpness", yKey: "sharpA", epKey: "sharpAEpoch", yLabel: "λ_max(P⁻¹H)", logScale: true, yDomain: [10000, 1500000] }
            ],
            eta => 38 / eta
        );

        // 2. BETA GROUP - Assuming base eta = 0.0001. Threshold: 2(1 + beta) / (0.0001 * (1 - beta))
        new ChartGroup(
            ["beta0.814.csv", "beta0.903.csv", "beta0.95.csv"],
            "beta",
            val => "β = " + val,
            PALETTE_2,
            [
                { containerId: "adam-beta-loss", title: "Train Loss", yKey: "loss", epKey: "lossEpoch", yLabel: "MSE Loss", logScale: true, yDomain: [0.1, 3] },
                { containerId: "adam-beta-sharp", title: "Preconditioned Sharpness", yKey: "sharpA", epKey: "sharpAEpoch", yLabel: "λ_max(P⁻¹H)", logScale: true, yDomain: [100000, 1500000] }
            ],
            beta => 2 * (1 + beta) / (0.0001 * (1 - beta))
        );

        // 3. PRECONDITIONED GROUP - Threshold: 38 / eta
        new ChartGroup(
            ["precond_eta0.001.csv", "precond_eta0.002.csv", "precond_eta0.004.csv"],
            "precond_eta",
            val => "η = " + val,
            PALETTE_3,
            [
                { containerId: "adam-precond-raw", title: "Hessian Sharpness", yKey: "sharpH", epKey: "sharpHEpoch", yLabel: "λ_max(H)", logScale: false, yDomain: [0, 3000] },
                { containerId: "adam-precond-scaled", title: "Preconditioned Sharpness", yKey: "sharpA", epKey: "sharpAEpoch", yLabel: "λ_max(P⁻¹H)", logScale: true, yDomain: [25000, 600000] }
            ],
            // eta => 38 / eta
        );
    }

    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", initCharts); }
    else { initCharts(); }
})();