(function () {
    const MODEL_IDS  = [12, 13, 14];
    const BATCH_SIZES = { 12: 32, 13: 64, 14: 128 };
    const COLORS     = { 12: "#4a8fa8", 13: "#c4732d", 14: "#8c4009" };
    const GREY       = "#c0bdb9";
    const FONT       = "Hanken Grotesk, sans-serif";

    // ── Shared state ──────────────────────────────────────────────────────────
    let selectedModel   = null;
    let hoveredModelId  = null;
    let hoveredEpochIdx = null;
    let activeChartIdx  = null;
    let leaveTimer      = null;

    const updaters = [];

    function lineOpacity(id) {
        if (selectedModel   !== null) return id === selectedModel   ? 0.92 : 0.06;
        if (hoveredModelId  !== null) return id === hoveredModelId  ? 0.92 : 0.18;
        return 0.88;
    }
    function lineStroke(id) {
        if (selectedModel  !== null && id !== selectedModel)  return GREY;
        if (hoveredModelId !== null && id !== hoveredModelId) return GREY;
        return COLORS[id];
    }
    function legendOpacity(id) {
        if (selectedModel !== null) return id === selectedModel ? 1 : 0.28;
        return 1;
    }
    function broadcast() { updaters.forEach(u => u()); }

    // ── Data loading ──────────────────────────────────────────────────────────
    function initCharts() {
        if (typeof d3 === "undefined") { setTimeout(initCharts, 80); return; }

        d3.csv("data/sgd_output.csv").then(output => {

            const seriesMap = {};
            MODEL_IDS.forEach(id => {
                seriesMap[id] = { epoch: [], batch: [], full: [] };
            });
            output.forEach(row => {
                const id = +String(row.model_id).trim();
                if (!MODEL_IDS.includes(id)) return;
                seriesMap[id].epoch.push(+row.epoch);
                seriesMap[id].batch.push(row.sharpness_H_batch !== "" ? +String(row.sharpness_H_batch).trim() : null);
                seriesMap[id].full.push(row.sharpness_H_full  !== "" ? +String(row.sharpness_H_full).trim()  : null);
            });

            const MODELS = MODEL_IDS.map(id => ({
                id,
                batchSize: BATCH_SIZES[id],
                label: "B = " + BATCH_SIZES[id],
                color: COLORS[id],
                series: seriesMap[id]
            }));

            // 2/η threshold — all three models share lr=0.05
            const THRESH = 2 / 0.05; // 40

            [
                { containerId: "batch-sharpness-chart", title: "Batch Sharpness",        yKey: "batch", yLabel: "Sharpness", yDomain: [20, 55], chartIdx: 0 },
                { containerId: "batch-full-chart",      title: "Full Hessian Sharpness",  yKey: "full",  yLabel: "Sharpness", yDomain: [20, 45], chartIdx: 1 },
            ].forEach(cfg => drawChart({ ...cfg, models: MODELS, thresh: THRESH }));

        }).catch(() => {});
    }

    // ── Chart drawing ─────────────────────────────────────────────────────────
    function drawChart({ containerId, title, yKey, yLabel, yDomain, models, thresh, chartIdx }) {
        if (!document.getElementById(containerId)) return;

        const W = 340, H = 280;
        const M = { top: 36, right: 20, bottom: 50, left: 50 };
        const iw = W - M.left - M.right;
        const ih = H - M.top  - M.bottom;

        const svg = d3.select("#" + containerId).append("svg")
            .attr("width", W).attr("height", H)
            .style("background", "#fff")
            .style("border", "1.5px solid #e8ddd4")
            .style("border-radius", "8px")
            .style("display", "block")
            .style("cursor", "crosshair");

        svg.append("text")
            .attr("x", W / 2).attr("y", 22)
            .attr("text-anchor", "middle")
            .attr("font-family", FONT).attr("font-weight", "500").attr("font-size", "12.5px")
            .attr("fill", "#111827").text(title);

        const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

        const xScale = d3.scaleLinear().domain([1, 1000]).range([0, iw]);
        const yScale = d3.scaleLinear().domain(yDomain).range([ih, 0]).clamp(true);
        const bisect = d3.bisector(d => d).center;
        const epochs = models[0].series.epoch;

        // Grid
        g.append("g")
            .call(d3.axisLeft(yScale).ticks(4).tickSize(-iw).tickFormat(""))
            .call(ax => ax.select(".domain").remove())
            .call(ax => ax.selectAll("line").attr("stroke", "#f0ebe5").attr("stroke-width", 1));

        // X axis
        g.append("g").attr("transform", `translate(0,${ih})`)
            .call(d3.axisBottom(xScale).ticks(5))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        // Y axis
        g.append("g")
            .call(d3.axisLeft(yScale).ticks(4))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        // Axis labels
        g.append("text").attr("x", iw / 2).attr("y", ih + 32)
            .attr("text-anchor", "middle").attr("font-family", FONT)
            .attr("font-size", "10px").attr("fill", "#999").text("Epoch");
        g.append("text").attr("transform", "rotate(-90)")
            .attr("x", -ih / 2).attr("y", -36)
            .attr("text-anchor", "middle").attr("font-family", FONT)
            .attr("font-size", "10px").attr("fill", "#999").text(yLabel);

        // 2/η threshold line (shared — all models same lr)
        if (thresh <= yDomain[1] * 1.08) {
            g.append("line")
                .attr("x1", 0).attr("x2", iw)
                .attr("y1", yScale(thresh)).attr("y2", yScale(thresh))
                .attr("stroke", "#aaa").attr("stroke-width", 1)
                .attr("stroke-dasharray", "5,4").attr("opacity", 0.5);
            g.append("text")
                .attr("x", iw - 2).attr("y", yScale(thresh) - 4)
                .attr("text-anchor", "end").attr("font-family", FONT)
                .attr("font-size", "9px").attr("fill", "#aaa").text("2/η");
        }

        // Lines
        const lineFn = d3.line()
            .x(d => xScale(d.e)).y(d => yScale(d.v))
            .defined(d => d.v != null && !isNaN(d.v))
            .curve(d3.curveMonotoneX);

        const paths = {};
        models.forEach(m => {
            const pts = m.series.epoch.map((e, i) => ({ e, v: m.series[yKey][i] }));
            paths[m.id] = g.append("path")
                .datum(pts)
                .attr("fill", "none")
                .attr("stroke", m.color).attr("stroke-width", 1.8)
                .attr("opacity", 0.88).attr("d", lineFn)
                .style("cursor", "pointer")
                .style("transition", "opacity 220ms ease, stroke 220ms ease")
                .on("click", () => {
                    selectedModel = (selectedModel === m.id) ? null : m.id;
                    broadcast();
                });
        });

        // Dots
        const dots = {};
        models.forEach(m => {
            dots[m.id] = g.append("circle")
                .attr("r", 3.5)
                .attr("fill", m.color).attr("stroke", "#fff").attr("stroke-width", 1.5)
                .style("display", "none").style("pointer-events", "none");
        });

        // Vertical cursor
        const cursor = g.append("line")
            .attr("y1", 0).attr("y2", ih)
            .attr("stroke", "#999").attr("stroke-width", 1)
            .attr("stroke-dasharray", "4,3")
            .style("display", "none").style("pointer-events", "none");

        // Tooltip
        const TIP_W = 130, TIP_LINE = 15, TIP_PAD = 8;
        const tipG = svg.append("g").style("display", "none").style("pointer-events", "none");
        const tipBg = tipG.append("rect")
            .attr("rx", 5).attr("fill", "rgba(255,255,255,0.96)")
            .attr("stroke", "#e0d8d0").attr("stroke-width", 1.2)
            .style("filter", "drop-shadow(0 1px 5px rgba(0,0,0,0.08))");
        const tipEpochText = tipG.append("text")
            .attr("font-family", FONT).attr("font-size", "10px")
            .attr("font-weight", "600").attr("fill", "#555");
        const tipRows = models.map(m => {
            const rg = tipG.append("g");
            rg.append("rect").attr("class", "swatch").attr("width", 8).attr("height", 8).attr("rx", 1.5).attr("y", -7);
            rg.append("text").attr("class", "rowlabel").attr("x", 13)
                .attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#444");
            return { g: rg, modelId: m.id };
        });

        // Legend
        const legendY = M.top + ih + M.bottom - 10;
        const legendG = svg.append("g").attr("transform", `translate(${M.left + 2},${legendY})`);
        const legendItems = {};
        models.forEach((m, i) => {
            const lx = i * 94;
            const ig = legendG.append("g")
                .attr("transform", `translate(${lx},0)`)
                .style("cursor", "pointer")
                .on("click", () => { selectedModel = (selectedModel === m.id) ? null : m.id; broadcast(); })
                .on("mouseenter", () => { hoveredModelId = m.id;  broadcast(); })
                .on("mouseleave", () => { hoveredModelId = null;  broadcast(); });
            ig.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 0).attr("y2", 0)
                .attr("stroke", m.color).attr("stroke-width", 2);
            ig.append("text").attr("x", 20).attr("y", 3.5)
                .attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#555").text(m.label);
            legendItems[m.id] = ig;
        });

        // Mouse overlay
        g.append("rect")
            .attr("width", iw).attr("height", ih)
            .attr("fill", "none").attr("pointer-events", "all")
            .on("mousemove", function (event) {
                clearTimeout(leaveTimer);
                const [mx, my] = d3.pointer(event);
                let idx = bisect(epochs, xScale.invert(mx));
                idx = Math.max(0, Math.min(idx, epochs.length - 1));
                hoveredEpochIdx = idx;
                activeChartIdx  = chartIdx;

                const visibleModels = selectedModel !== null
                    ? models.filter(m => m.id === selectedModel) : models;
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
            .on("mouseleave", function () {
                leaveTimer = setTimeout(() => {
                    hoveredEpochIdx = null; hoveredModelId = null; activeChartIdx = null;
                    broadcast();
                }, 40);
            });

        // Update function
        function update() {
            const isSource = activeChartIdx === chartIdx;
            models.forEach(m => {
                paths[m.id].attr("stroke", lineStroke(m.id)).attr("opacity", lineOpacity(m.id));
                legendItems[m.id].attr("opacity", legendOpacity(m.id));
            });

            if (hoveredEpochIdx !== null) {
                const ep = epochs[hoveredEpochIdx];
                const cx = xScale(ep);

                cursor.style("display", null).attr("x1", cx).attr("x2", cx)
                    .attr("opacity", isSource ? 0.85 : 0.22);

                const visibleModels = selectedModel !== null
                    ? models.filter(m => m.id === selectedModel) : models;

                models.forEach(m => {
                    const val = m.series[yKey][hoveredEpochIdx];
                    const visible = visibleModels.includes(m) && val != null && !isNaN(val);
                    dots[m.id].style("display", visible ? null : "none");
                    if (visible) {
                        dots[m.id].attr("cx", cx).attr("cy", yScale(val))
                            .attr("fill", lineStroke(m.id)).attr("opacity", lineOpacity(m.id));
                    }
                });

                const rows = visibleModels
                    .map(m => ({ m, val: m.series[yKey][hoveredEpochIdx] }))
                    .filter(r => r.val != null && !isNaN(r.val));

                if (rows.length > 0) {
                    const tipH = TIP_PAD * 2 + TIP_LINE * (rows.length + 1) - 2;
                    tipBg.attr("width", TIP_W).attr("height", tipH);
                    tipEpochText.attr("x", TIP_PAD).attr("y", TIP_PAD + 9).text("Epoch: " + ep);
                    tipRows.forEach(tr => tr.g.style("display", "none"));
                    rows.forEach((row, i) => {
                        const tr = tipRows.find(t => t.modelId === row.m.id);
                        if (!tr) return;
                        const yOff = TIP_PAD + TIP_LINE * (i + 1) + 9;
                        tr.g.style("display", null).attr("transform", `translate(${TIP_PAD},${yOff})`);
                        tr.g.select(".swatch").attr("fill", lineStroke(row.m.id));
                        tr.g.select(".rowlabel")
                            .text(row.m.label + ":  " + row.val.toFixed(1))
                            .attr("fill", lineStroke(row.m.id));
                    });
                    const svgX = cx + M.left;
                    const tipX = (svgX + 14 + TIP_W > W - 4) ? svgX - TIP_W - 10 : svgX + 14;
                    tipG.style("display", null).attr("transform", `translate(${tipX},${M.top + 4})`);
                } else {
                    tipG.style("display", "none");
                }
            } else {
                cursor.style("display", "none");
                tipG.style("display", "none");
                models.forEach(m => dots[m.id].style("display", "none"));
            }
        }

        updaters.push(update);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCharts);
    } else {
        initCharts();
    }
})();