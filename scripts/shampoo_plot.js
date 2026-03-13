(function () {
    // Using models 3, 4, 5 as requested
    const MODEL_IDS = [3, 4, 5];
    const COLORS = { 3: "#4a8fa8", 4: "#c4732d", 5: "#8c4009" };
    const GREY = "#c0bdb9";
    const FONT = "Hanken Grotesk, sans-serif";

    let selectedModel = null;
    let hoveredModelId = null;
    let hoveredEpoch = null;
    let activeChartIdx = null;
    let leaveTimer = null;
    const updaters = [];

    function lineOpacity(id) {
        if (selectedModel !== null) return id === selectedModel ? 0.92 : 0.06;
        if (hoveredModelId !== null) return id === hoveredModelId ? 0.92 : 0.18;
        return 0.88;
    }
    function lineStroke(id) {
        if (selectedModel !== null && id !== selectedModel) return GREY;
        if (hoveredModelId !== null && id !== hoveredModelId) return GREY;
        return COLORS[id];
    }
    function legendOpacity(id) {
        return (selectedModel !== null && id !== selectedModel) ? 0.28 : 1;
    }
    function broadcast() { updaters.forEach(u => u()); }

    function initCharts() {
        if (typeof d3 === "undefined") { setTimeout(initCharts, 80); return; }

        Promise.all([
            d3.csv("data/shampoo_metadata.csv"),
            d3.csv("data/shampoo_output.csv")
        ]).then(([metadata, output]) => {
            const lrMap = {};
            metadata.forEach(row => { lrMap[+row.model_id] = +row.learning_rate; });

            const seriesMap = {};
            MODEL_IDS.forEach(id => {
                seriesMap[id] = { epoch: [], loss: [], sharpH: [], sharpP: [] };
            });

            output.forEach(row => {
                const id = +row.model_id;
                if (!MODEL_IDS.includes(id)) return;
                const ep = +row.epoch;
                seriesMap[id].epoch.push(ep);
                seriesMap[id].loss.push(+row.train_loss);
                seriesMap[id].sharpH.push(row.sharpness_H ? +row.sharpness_H : null);
                seriesMap[id].sharpP.push(row.sharpness_P ? +row.sharpness_P : null);
            });

            const MODELS = MODEL_IDS.map(id => {
                const s = seriesMap[id];
                return {
                    id, lr: lrMap[id],
                    label: "η = " + lrMap[id].toFixed(4),
                    color: COLORS[id],
                    series: {
                        loss: s.loss,
                        lossEpoch: s.epoch,
                        sharpH: s.sharpH.filter(v => v !== null),
                        sharpHEpoch: s.epoch.filter((_, i) => s.sharpH[i] !== null),
                        sharpP: s.sharpP.filter(v => v !== null),
                        sharpPEpoch: s.epoch.filter((_, i) => s.sharpP[i] !== null),
                    }
                };
            });

            [
                { containerId: "shampoo-loss", title: "Train Loss", yKey: "loss", epKey: "lossEpoch", yLabel: "MSE Loss", logScale: true, yDomain: [0.0003, 0.12], chartIdx: 0 },
                { containerId: "shampoo-sharp-h", title: "Hessian Sharpness", yKey: "sharpH", epKey: "sharpHEpoch", yLabel: "λ_max(H)", logScale: false, yDomain: [0, 40], chartIdx: 1 },
                { containerId: "shampoo-sharp-p", title: "Preconditioned Sharpness", yKey: "sharpP", epKey: "sharpPEpoch", yLabel: "λ_max(P⁻¹H)", logScale: false, yDomain: [0, 650000], chartIdx: 2 }
            ].forEach(cfg => drawLineChart({ ...cfg, models: MODELS }));
        });
    }

    function drawLineChart({ containerId, title, yKey, epKey, yLabel, yDomain, logScale, models, chartIdx }) {
        const cont = document.getElementById(containerId);
        if (!cont) return;

        const W = 340, H = 280;
        const M = { top: 38, right: 22, bottom: 72, left: 62 };
        const iw = W - M.left - M.right, ih = H - M.top - M.bottom;

        const svg = d3.select(cont).append("svg").attr("width", W).attr("height", H)
            .style("background", "#fff").style("border", "1.5px solid #e8ddd4")
            .style("border-radius", "8px").style("cursor", "crosshair");

        svg.append("text").attr("x", W / 2).attr("y", 22).attr("text-anchor", "middle")
            .attr("font-family", FONT).attr("font-weight", "500").attr("font-size", "13px")
            .attr("fill", "#111827").text(title);

        const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
        const xScale = d3.scaleLinear().domain([0, 500]).range([0, iw]);
        const yScale = logScale ? d3.scaleLog().domain(yDomain).range([ih, 0]).clamp(true) : d3.scaleLinear().domain(yDomain).range([ih, 0]).clamp(true);

        // Grid & Axes
        g.append("g").call(d3.axisLeft(yScale).ticks(5).tickSize(-iw).tickFormat("")).call(ax => ax.select(".domain").remove()).call(ax => ax.selectAll("line").attr("stroke", "#f0ebe5"));
        g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(xScale).ticks(5)).call(ax => { ax.select(".domain").attr("stroke", "#d4ccc5"); ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"); });
        g.append("g").call(d3.axisLeft(yScale).ticks(5, logScale ? ".0e" : "")).call(ax => { ax.select(".domain").attr("stroke", "#d4ccc5"); ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"); });

        const lineFn = d3.line().x(d => xScale(d.e)).y(d => yScale(d.v)).defined(d => d.v !== null && !isNaN(d.v)).curve(d3.curveLinear);

        const paths = {};
        const dots = {};
        models.forEach(m => {
            const pts = m.series[epKey].map((e, i) => ({ e, v: m.series[yKey][i] }));
            paths[m.id] = g.append("path").datum(pts).attr("fill", "none").attr("stroke", m.color).attr("stroke-width", 1.8).attr("opacity", 0.88).attr("d", lineFn)
                .style("transition", "opacity 220ms ease, stroke 220ms ease").on("click", () => { selectedModel = (selectedModel === m.id) ? null : m.id; broadcast(); });
            dots[m.id] = g.append("circle").attr("r", 3.5).attr("fill", m.color).attr("stroke", "#fff").attr("stroke-width", 1.5).style("display", "none").style("pointer-events", "none");
        });

        const cursor = g.append("line").attr("y1", 0).attr("y2", ih).attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "4,3").style("display", "none");

        // ── TOOLTIP CONSTRUCTION ─────────────────────────────────────────────
        const TIP_W = 148, TIP_LINE = 15, TIP_PAD = 9;
        const tipG = svg.append("g").style("display", "none").style("pointer-events", "none");
        const tipBg = tipG.append("rect").attr("rx", 5).attr("fill", "rgba(255,255,255,0.96)").attr("stroke", "#e0d8d0").attr("stroke-width", 1.2).style("filter", "drop-shadow(0 1px 5px rgba(0,0,0,0.08))");
        const tipEpochText = tipG.append("text").attr("font-family", FONT).attr("font-size", "10px").attr("font-weight", "600").attr("fill", "#555");
        const tipRows = models.map(m => {
            const rg = tipG.append("g");
            rg.append("rect").attr("class", "swatch").attr("width", 8).attr("height", 8).attr("rx", 1.5).attr("y", -7);
            rg.append("text").attr("class", "rowlabel").attr("x", 13).attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#444");
            return { g: rg, modelId: m.id };
        });

        // Legend
        const legendG = svg.append("g").attr("transform", `translate(${M.left + 4},${H - 18})`);
        const legendItems = {};
        models.forEach((m, i) => {
            const ig = legendG.append("g").attr("transform", `translate(${i * 90}, 0)`).style("cursor", "pointer")
                .on("mouseenter", () => { hoveredModelId = m.id; broadcast(); }).on("mouseleave", () => { hoveredModelId = null; broadcast(); })
                .on("click", () => { selectedModel = (selectedModel === m.id) ? null : m.id; broadcast(); });
            ig.append("line").attr("x1", 0).attr("x2", 16).attr("stroke", m.color).attr("stroke-width", 2);
            ig.append("text").attr("x", 20).attr("y", 4).attr("font-family", FONT).attr("font-size", "10px").text(m.label);
            legendItems[m.id] = ig;
        });

        const bisect = d3.bisector(d => d).center;
        g.append("rect").attr("width", iw).attr("height", ih).attr("fill", "none").attr("pointer-events", "all")
            .on("mousemove", function (event) {
                clearTimeout(leaveTimer);
                const [mx, my] = d3.pointer(event);
                const epArr = models[0].series[epKey];
                let idx = bisect(epArr, xScale.invert(mx));
                idx = Math.max(0, Math.min(idx, epArr.length - 1));
                hoveredEpoch = epArr[idx];
                activeChartIdx = chartIdx;

                // Detect proximity to line for fading effect
                const visibleModels = selectedModel !== null ? models.filter(m => m.id === selectedModel) : models;
                let closestId = null, closestDist = Infinity;
                visibleModels.forEach(m => {
                    const val = m.series[yKey][idx];
                    if (val == null || isNaN(val)) return;
                    const d = Math.abs(yScale(val) - my);
                    if (d < closestDist) { closestDist = d; closestId = m.id; }
                });
                hoveredModelId = closestDist < 40 ? closestId : null;

                broadcast();
            })
            .on("mouseleave", () => {
                leaveTimer = setTimeout(() => {
                    hoveredEpoch = null;
                    hoveredModelId = null;
                    activeChartIdx = null;
                    broadcast();
                }, 50);
            });

        updaters.push(() => {
            // Apply stroke and opacity updates across all lines
            models.forEach(m => {
                paths[m.id].attr("stroke", lineStroke(m.id)).attr("opacity", lineOpacity(m.id));
                legendItems[m.id].attr("opacity", legendOpacity(m.id));
            });

            if (hoveredEpoch !== null) {
                const epArr = models[0].series[epKey];
                let idx = bisect(epArr, hoveredEpoch);
                idx = Math.max(0, Math.min(idx, epArr.length - 1));
                const ep = epArr[idx];
                const cx = xScale(ep);

                cursor.style("display", null).attr("x1", cx).attr("x2", cx).attr("opacity", activeChartIdx === chartIdx ? 0.8 : 0.2);

                const visibleModels = selectedModel !== null ? models.filter(m => m.id === selectedModel) : models;

                models.forEach(m => {
                    const val = m.series[yKey][idx];
                    const isVisible = visibleModels.includes(m) && val != null && !isNaN(val);
                    dots[m.id].style("display", isVisible ? null : "none");
                    if (isVisible) dots[m.id].attr("cx", cx).attr("cy", yScale(val)).attr("fill", lineStroke(m.id)).attr("opacity", lineOpacity(m.id));
                });

                // Update Tooltip Box
                const rows = visibleModels.map(m => ({ m, val: m.series[yKey][idx] })).filter(r => r.val != null && !isNaN(r.val));
                if (rows.length > 0) {
                    const tipH = TIP_PAD * 2 + TIP_LINE * (rows.length + 1) - 2;
                    tipBg.attr("width", TIP_W).attr("height", tipH);
                    tipEpochText.attr("x", TIP_PAD).attr("y", TIP_PAD + 9).text("Epoch: " + ep);
                    tipRows.forEach(tr => tr.g.style("display", "none"));
                    rows.forEach((row, i) => {
                        const tr = tipRows.find(t => t.modelId === row.m.id);
                        if (!tr) return;
                        tr.g.style("display", null).attr("transform", `translate(${TIP_PAD},${TIP_PAD + TIP_LINE * (i + 1) + 9})`);
                        tr.g.select(".swatch").attr("fill", lineStroke(row.m.id));
                        const valStr = yKey === "loss" ? (row.val < 0.01 ? row.val.toExponential(2) : row.val.toFixed(4)) : row.val.toLocaleString(undefined, { maximumFractionDigits: 1 });
                        tr.g.select(".rowlabel").text(row.m.label + ": " + valStr).attr("fill", lineStroke(row.m.id));
                    });
                    const svgX = cx + M.left;
                    const tipX = (svgX + 14 + TIP_W > W - 4) ? svgX - TIP_W - 10 : svgX + 14;
                    tipG.style("display", null).attr("transform", `translate(${tipX},${M.top + 6})`);
                } else { tipG.style("display", "none"); }
            } else {
                cursor.style("display", "none");
                tipG.style("display", "none");
                models.forEach(m => dots[m.id].style("display", "none"));
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCharts);
    } else {
        initCharts();
    }
})();