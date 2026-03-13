(function () {
    // ── Model IDs for time-series charts ─────────────────────────────────────
    const MODEL_IDS = [100, 300, 800];
    const COLORS = { 100: "#4a8fa8", 300: "#c4732d", 800: "#8c4009" };

    // Adam LR groups for scatter, ordered descending to match Python [::-1]
    const ADAM_LRS = [0.001, 0.0003, 0.0001];
    // Applied to website palette: 1st color, 2nd color, 3rd color
    const ADAM_COLORS = { "0.001": "#4a8fa8", "0.0003": "#c4732d", "0.0001": "#8c4009" };

    const GREY = "#c0bdb9";
    const FONT = "Hanken Grotesk, sans-serif";

    // ── Shared interaction state ──────────────────────────────────────────────
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

    // ── Rolling mean helper ───────────────────────────────────────────────────
    function rollingMean(arr, window, minPeriods) {
        return arr.map((_, i) => {
            const start = Math.max(0, i - window + 1);
            const slice = arr.slice(start, i + 1);
            if (slice.length < minPeriods) return null;
            return slice.reduce((a, b) => a + b, 0) / slice.length;
        });
    }

    // ── Data loading ──────────────────────────────────────────────────────────
    function initCharts() {
        if (typeof d3 === "undefined") { setTimeout(initCharts, 80); return; }

        Promise.all([
            d3.csv("data/muon_metadata.csv"),
            d3.csv("data/muon_output.csv")
        ]).then(([metadata, output]) => {

            const lrMap = {};
            const adamLrMap = {};
            metadata.forEach(row => {
                const id = +row.model_id;
                lrMap[id] = +row.learning_rate;
                adamLrMap[id] = +row.learning_rate_adam;
            });

            const seriesMap = {};
            MODEL_IDS.forEach(id => {
                seriesMap[id] = { epoch: [], loss: [], sharp: [] };
            });

            const allSeriesMap = {};
            metadata.forEach(row => {
                allSeriesMap[+row.model_id] = { sharp: [] };
            });

            output.forEach(row => {
                const id = +String(row.model_id).trim();
                const ep = +row.epoch;
                const loss = row.train_loss !== undefined && String(row.train_loss).trim() !== "" ? +row.train_loss : null;
                const sh = row.sharpness_H !== undefined && String(row.sharpness_H).trim() !== "" ? +row.sharpness_H : null;

                if (MODEL_IDS.includes(id)) {
                    seriesMap[id].epoch.push(ep);
                    seriesMap[id].loss.push(loss);
                    seriesMap[id].sharp.push(sh);
                }

                if (allSeriesMap[id] && sh !== null) {
                    allSeriesMap[id].sharp.push(sh);
                }
            });

            const MODELS = MODEL_IDS.map(id => {
                const lr = lrMap[id];
                const allEpochs = seriesMap[id].epoch;
                const allLoss = seriesMap[id].loss;
                const allSharp = seriesMap[id].sharp;
                return {
                    id, lr,
                    label: "η = " + lr.toFixed(2),
                    color: COLORS[id],
                    thresh: 2 / lr,
                    series: {
                        lossEpoch: allEpochs.filter((_, i) => i % 5 === 0),
                        loss: allLoss.filter((_, i) => i % 5 === 0),
                        sharpEpoch: allEpochs.filter((_, i) => allSharp[i] != null),
                        sharp: allSharp.filter(v => v != null),
                    }
                };
            });

            const scatterPoints = [];
            metadata.forEach(row => {
                const id = +row.model_id;
                const muonLr = +row.learning_rate;
                const adamLr = +row.learning_rate_adam;
                const rawSharp = (allSeriesMap[id] || {}).sharp || [];

                const smoothed = rollingMean(rawSharp, 5, 2);
                const validSmoothed = smoothed.filter(v => v != null && !isNaN(v));

                if (validSmoothed.length === 0) return;

                const maxSharp = Math.max(...validSmoothed);
                scatterPoints.push({ id, muonLr, adamLr, maxSharp });
            });

            [
                { containerId: "muon-loss-chart", title: "Train Loss", yKey: "loss", yLabel: "MSE Loss", logScale: true, yDomain: [0.0005, 0.2], thresholds: false, chartIdx: 0 },
                // SET thresholds: false to remove the dashed lines on the sharpness graph
                { containerId: "muon-sharp-chart", title: "Sharpness", yKey: "sharp", yLabel: "Sharpness", logScale: false, yDomain: [0, 60], thresholds: false, chartIdx: 1 },
            ].forEach(cfg => drawLineChart({ ...cfg, models: MODELS }));

            drawScatterChart({
                containerId: "muon-scatter-chart",
                title: "Maximum Sharpness Attained",
                points: scatterPoints,
                xLabel: "Muon Learning Rate",
                yLabel: "Max Sharpness of Hessian",
                legendTitle: "Adam LR",
                chartIdx: 2
            });

        }).catch(err => console.warn("Muon data load failed:", err));
    }

    // ── Line chart (Train Loss & Sharpness) ───────────────────────────────────
    function drawLineChart({ containerId, title, yKey, yLabel, yDomain, thresholds, logScale, models, chartIdx }) {
        if (!document.getElementById(containerId)) return;

        const W = 340, H = 280;
        const M = { top: 38, right: 22, bottom: 72, left: 54 };
        const iw = W - M.left - M.right;
        const ih = H - M.top - M.bottom;

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
            .attr("font-family", FONT).attr("font-weight", "500").attr("font-size", "13px")
            .attr("fill", "#111827").text(title);

        const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

        const xScale = d3.scaleLinear().domain([1, 500]).range([0, iw]);
        const yScale = logScale
            ? d3.scaleLog().domain(yDomain).range([ih, 0]).clamp(true)
            : d3.scaleLinear().domain(yDomain).range([ih, 0]).clamp(true);
        const yTickFormat = logScale
            ? v => v < 0.01 ? d3.format(".0e")(v) : d3.format(".2~f")(v)
            : null;

        g.append("g")
            .call(d3.axisLeft(yScale).ticks(logScale ? 5 : 5, logScale ? yTickFormat : "").tickSize(-iw).tickFormat(""))
            .call(ax => ax.select(".domain").remove())
            .call(ax => ax.selectAll("line").attr("stroke", "#f0ebe5").attr("stroke-width", 1));

        g.append("g").attr("transform", `translate(0,${ih})`)
            .call(d3.axisBottom(xScale).ticks(5))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        g.append("g")
            .call(d3.axisLeft(yScale).ticks(logScale ? 5 : 5, logScale ? yTickFormat : undefined))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        g.append("text").attr("x", iw / 2).attr("y", ih + 33)
            .attr("text-anchor", "middle").attr("font-family", FONT)
            .attr("font-size", "10px").attr("fill", "#999").text("Epoch");
        g.append("text").attr("transform", "rotate(-90)")
            .attr("x", -ih / 2).attr("y", -42)
            .attr("text-anchor", "middle").attr("font-family", FONT)
            .attr("font-size", "10px").attr("fill", "#999").text(yLabel);

        if (thresholds) {
            models.forEach(m => {
                if (m.thresh <= yDomain[1] * 1.08) {
                    g.append("line")
                        .attr("x1", 0).attr("x2", iw)
                        .attr("y1", yScale(m.thresh)).attr("y2", yScale(m.thresh))
                        .attr("stroke", m.color).attr("stroke-width", 1)
                        .attr("stroke-dasharray", "5,4").attr("opacity", 0.55);
                }
            });
        }

        const lineFn = d3.line()
            .x(d => xScale(d.e)).y(d => yScale(d.v))
            .defined(d => d.v != null && !isNaN(d.v) && (logScale ? d.v > 0 : true))
            .curve(d3.curveLinear);

        const epochKey = yKey === "loss" ? "lossEpoch" : "sharpEpoch";

        const paths = {};
        models.forEach(m => {
            const pts = m.series[epochKey].map((e, i) => ({ e, v: m.series[yKey][i] }));
            paths[m.id] = g.append("path")
                .datum(pts).attr("fill", "none")
                .attr("stroke", m.color).attr("stroke-width", 1.8)
                .attr("opacity", 0.88).attr("d", lineFn)
                .style("cursor", "pointer")
                .style("transition", "opacity 220ms ease, stroke 220ms ease")
                .on("click", () => { selectedModel = (selectedModel === m.id) ? null : m.id; broadcast(); });
        });

        const dots = {};
        models.forEach(m => {
            dots[m.id] = g.append("circle").attr("r", 3.5)
                .attr("fill", m.color).attr("stroke", "#fff").attr("stroke-width", 1.5)
                .style("display", "none").style("pointer-events", "none");
        });

        const cursor = g.append("line")
            .attr("y1", 0).attr("y2", ih)
            .attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "4,3")
            .style("display", "none").style("pointer-events", "none");

        const TIP_W = 148, TIP_LINE = 15, TIP_PAD = 9;
        const tipG = svg.append("g").style("display", "none").style("pointer-events", "none");
        const tipBg = tipG.append("rect").attr("rx", 5)
            .attr("fill", "rgba(255,255,255,0.96)")
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

        const legendY = M.top + ih + M.bottom - 17;
        const legendG = svg.append("g").attr("transform", `translate(${M.left + 4},${legendY})`);
        const legendItems = {};
        models.forEach((m, i) => {
            const ig = legendG.append("g")
                .attr("transform", `translate(${i * 104},0)`)
                .style("cursor", "pointer")
                .on("click", () => { selectedModel = (selectedModel === m.id) ? null : m.id; broadcast(); })
                .on("mouseenter", () => { hoveredModelId = m.id; broadcast(); })
                .on("mouseleave", () => { hoveredModelId = null; broadcast(); });
            ig.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 0).attr("y2", 0)
                .attr("stroke", m.color).attr("stroke-width", 2);
            ig.append("text").attr("x", 20).attr("y", 3.5)
                .attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#555").text(m.label);
            legendItems[m.id] = ig;
        });

        const epochs = models[0].series[epochKey];
        const bisect = d3.bisector(d => d).center;

        g.append("rect")
            .attr("width", iw).attr("height", ih)
            .attr("fill", "none").attr("pointer-events", "all")
            .on("mousemove", function (event) {
                clearTimeout(leaveTimer);
                const [mx, my] = d3.pointer(event);
                let idx = bisect(epochs, xScale.invert(mx));
                idx = Math.max(0, Math.min(idx, epochs.length - 1));
                hoveredEpoch = epochs[idx];
                activeChartIdx = chartIdx;
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
            .on("mouseleave", function () {
                leaveTimer = setTimeout(() => {
                    hoveredEpoch = null; hoveredModelId = null; activeChartIdx = null;
                    broadcast();
                }, 40);
            });

        function update() {
            models.forEach(m => {
                paths[m.id].attr("stroke", lineStroke(m.id)).attr("opacity", lineOpacity(m.id));
                legendItems[m.id].attr("opacity", legendOpacity(m.id));
            });

            if (hoveredEpoch !== null) {
                let idx = bisect(epochs, hoveredEpoch);
                idx = Math.max(0, Math.min(idx, epochs.length - 1));
                const ep = epochs[idx];
                const cx = xScale(ep);
                const isSource = activeChartIdx === chartIdx;

                cursor.style("display", null)
                    .attr("x1", cx).attr("x2", cx)
                    .attr("opacity", isSource ? 0.85 : 0.22);

                const visibleModels = selectedModel !== null ? models.filter(m => m.id === selectedModel) : models;
                models.forEach(m => {
                    const val = m.series[yKey][idx];
                    const visible = visibleModels.includes(m) && val != null && !isNaN(val);
                    dots[m.id].style("display", visible ? null : "none");
                    if (visible) {
                        dots[m.id].attr("cx", cx).attr("cy", yScale(val))
                            .attr("fill", lineStroke(m.id)).attr("opacity", lineOpacity(m.id));
                    }
                });

                const rows = visibleModels
                    .map(m => ({ m, val: m.series[yKey][idx] }))
                    .filter(r => r.val != null && !isNaN(r.val));

                if (rows.length > 0) {
                    const tipH = TIP_PAD * 2 + TIP_LINE * (rows.length + 1) - 2;
                    tipBg.attr("width", TIP_W).attr("height", tipH);
                    tipEpochText.attr("x", TIP_PAD).attr("y", TIP_PAD + 9).text("Epoch: " + ep);
                    tipRows.forEach(tr => tr.g.style("display", "none"));
                    rows.forEach((row, i) => {
                        const tr = tipRows.find(t => t.modelId === row.m.id);
                        if (!tr) return;
                        tr.g.style("display", null)
                            .attr("transform", `translate(${TIP_PAD},${TIP_PAD + TIP_LINE * (i + 1) + 9})`);
                        tr.g.select(".swatch").attr("fill", lineStroke(row.m.id));
                        const valStr = yKey === "loss"
                            ? (row.val < 0.01 ? row.val.toExponential(2) : row.val.toFixed(4))
                            : row.val.toFixed(1);
                        tr.g.select(".rowlabel")
                            .text(row.m.label + ":  " + valStr)
                            .attr("fill", lineStroke(row.m.id));
                    });
                    const svgX = cx + M.left;
                    const tipX = (svgX + 14 + TIP_W > W - 4) ? svgX - TIP_W - 10 : svgX + 14;
                    tipG.style("display", null).attr("transform", `translate(${tipX},${M.top + 6})`);
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

    // ── Scatter chart (Max Sharpness vs Muon LR) ─────────────────────────────
    function drawScatterChart({ containerId, title, points, xLabel, yLabel, legendTitle, chartIdx }) {
        if (!document.getElementById(containerId)) return;

        const W = 340, H = 280;
        const M = { top: 38, right: 22, bottom: 72, left: 58 };
        const iw = W - M.left - M.right;
        const ih = H - M.top - M.bottom;

        const svg = d3.select("#" + containerId).append("svg")
            .attr("width", W).attr("height", H)
            .style("background", "#fff")
            .style("border", "1.5px solid #e8ddd4")
            .style("border-radius", "8px")
            .style("display", "block");

        svg.append("text")
            .attr("x", W / 2).attr("y", 22)
            .attr("text-anchor", "middle")
            .attr("font-family", FONT).attr("font-weight", "500").attr("font-size", "13px")
            .attr("fill", "#111827").text(title);

        const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

        const validPoints = points.filter(p => p.maxSharp != null && !isNaN(p.maxSharp) && isFinite(p.maxSharp));
        const xExtent = d3.extent(validPoints, d => d.muonLr);
        const yMax = d3.max(validPoints, d => d.maxSharp);

        const xScale = d3.scaleLinear()
            .domain([0, xExtent[1] * 1.05])
            .range([0, iw]);

        const yScale = d3.scaleLinear()
            .domain([0, yMax * 1.08])
            .range([ih, 0]);

        g.append("g")
            .call(d3.axisLeft(yScale).ticks(5).tickSize(-iw).tickFormat(""))
            .call(ax => ax.select(".domain").remove())
            .call(ax => ax.selectAll("line").attr("stroke", "#f0ebe5").attr("stroke-width", 1));

        g.append("g").attr("transform", `translate(0,${ih})`)
            .call(d3.axisBottom(xScale).ticks(6))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        g.append("g")
            .call(d3.axisLeft(yScale).ticks(5))
            .call(ax => ax.select(".domain").attr("stroke", "#d4ccc5"))
            .call(ax => ax.selectAll("text").attr("font-family", FONT).attr("font-size", "10px").attr("fill", "#777"))
            .call(ax => ax.selectAll("line").attr("stroke", "#d4ccc5"));

        g.append("text").attr("x", iw / 2).attr("y", ih + 40)
            .attr("text-anchor", "middle").attr("font-family", FONT)
            .attr("font-size", "10px").attr("fill", "#999").text(xLabel);
        g.append("text").attr("transform", "rotate(-90)")
            .attr("x", -ih / 2).attr("y", -44)
            .attr("text-anchor", "middle").attr("font-family", FONT)
            .attr("font-size", "10px").attr("fill", "#999").text(yLabel);

        // ── Optimized Scatter rendering ───────────────────────────────────────
        let hoveredAdamLr = null;

        const TIP_W = 154, TIP_LINE = 15, TIP_PAD = 9;
        const tipG = svg.append("g").style("display", "none").style("pointer-events", "none");
        const tipBg = tipG.append("rect").attr("rx", 5)
            .attr("fill", "rgba(255,255,255,0.96)")
            .attr("stroke", "#e0d8d0").attr("stroke-width", 1.2)
            .style("filter", "drop-shadow(0 1px 5px rgba(0,0,0,0.08))")
            .attr("width", TIP_W).attr("height", TIP_LINE * 3 + TIP_PAD * 2);
        const tipLines = [
            tipG.append("text").attr("font-family", FONT).attr("font-size", "9.5px").attr("font-weight", "600").attr("fill", "#555"),
            tipG.append("text").attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#555"),
            tipG.append("text").attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#555"),
        ];

        // We wrap points inside <g> elements and apply color/opacity at the group level!
        const dotGroups = {};

        ADAM_LRS.forEach(alr => {
            const groupPts = validPoints.filter(p => Math.abs(p.adamLr - alr) < 1e-6);
            const key = String(alr);

            // Group styling avoids 3000 DOM updates per hover.
            const circleGroup = g.append("g")
                .attr("fill", ADAM_COLORS[key])
                .attr("opacity", 0.70)
                .style("transition", "opacity 220ms ease, fill 220ms ease");

            dotGroups[alr] = circleGroup;

            circleGroup.selectAll("circle")
                .data(groupPts)
                .enter().append("circle")
                .attr("cx", d => xScale(d.muonLr))
                .attr("cy", d => yScale(d.maxSharp))
                .attr("r", 2.5)
                .style("cursor", "crosshair")
                // NO stroke or individual opacity assignments to keep performance high
                .on("mouseenter", function (event, d) {
                    hoveredAdamLr = d.adamLr;
                    updateScatter();

                    const cx = xScale(d.muonLr);
                    const cy = yScale(d.maxSharp);
                    tipLines[0].attr("x", TIP_PAD).attr("y", TIP_PAD + 9).text("Model " + d.id);
                    tipLines[1].attr("x", TIP_PAD).attr("y", TIP_PAD + 9 + TIP_LINE).text("Muon η: " + d.muonLr.toFixed(3));
                    tipLines[2].attr("x", TIP_PAD).attr("y", TIP_PAD + 9 + TIP_LINE * 2).text("Max Sharp: " + d.maxSharp.toFixed(1));

                    const svgX = cx + M.left;
                    const svgY = cy + M.top;
                    const tipX = svgX + 14 + TIP_W > W - 4 ? svgX - TIP_W - 10 : svgX + 10;
                    const tipY = svgY - 20;
                    tipG.style("display", null).attr("transform", `translate(${tipX},${tipY})`);
                })
                .on("mouseleave", function () {
                    hoveredAdamLr = null;
                    updateScatter();
                    tipG.style("display", "none");
                });
        });

        // Fast update: modifies 3 DOM elements rather than 3000
        function updateScatter() {
            ADAM_LRS.forEach(alr => {
                const isHovered = hoveredAdamLr !== null && Math.abs(alr - hoveredAdamLr) < 1e-6;
                const isOtherHovered = hoveredAdamLr !== null && !isHovered;

                dotGroups[alr]
                    .attr("fill", isOtherHovered ? GREY : ADAM_COLORS[String(alr)])
                    .attr("opacity", isOtherHovered ? 0.12 : (isHovered ? 0.9 : 0.70));
            });

            legendItems.forEach(({ g: lg, alr }) => {
                const isOtherHovered = hoveredAdamLr !== null && Math.abs(alr - hoveredAdamLr) > 1e-6;
                lg.style("transition", "opacity 220ms ease")
                    .attr("opacity", isOtherHovered ? 0.28 : 1);
            });
        }

        // ── Legend ────────────────────────────────────────────────────────────
        const legendY = M.top + ih + M.bottom - 17;
        const legendG = svg.append("g").attr("transform", `translate(${M.left},${legendY})`);

        legendG.append("text")
            .attr("x", 0).attr("y", 3.5)
            .attr("font-family", FONT).attr("font-size", "9.5px")
            .attr("font-weight", "600").attr("fill", "#777")
            .text(legendTitle + ":");

        const legendItems = [];
        ADAM_LRS.forEach((alr, i) => {
            const key = String(alr);
            const lx = 55 + i * 65;
            const ig = legendG.append("g")
                .attr("transform", `translate(${lx},0)`)
                .style("cursor", "crosshair")
                .on("mouseenter", () => { hoveredAdamLr = alr; updateScatter(); })
                .on("mouseleave", () => { hoveredAdamLr = null; updateScatter(); });

            ig.append("circle").attr("cx", 4).attr("cy", 0).attr("r", 4)
                .attr("fill", ADAM_COLORS[key]);
            ig.append("text").attr("x", 12).attr("y", 3.5)
                .attr("font-family", FONT).attr("font-size", "9.5px").attr("fill", "#555")
                .text(alr);

            legendItems.push({ g: ig, alr });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCharts);
    } else {
        initCharts();
    }
})();