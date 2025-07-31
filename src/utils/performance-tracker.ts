class PerformanceTracker {
    private timings: Record<string, number[]> = {};
    private lastSummaryTime: number = performance.now();
    private readonly SUMMARY_INTERVAL_MS = 10000; // 10 seconds

    public record(name: string, duration: number) {
        if (!this.timings[name]) {
            this.timings[name] = [];
        }
        this.timings[name].push(duration);
    }

    public summarize() {
        const now = performance.now();
        if (now - this.lastSummaryTime < this.SUMMARY_INTERVAL_MS) {
            return;
        }
        this.lastSummaryTime = now;

        const summary = Object.entries(this.timings)
            .map(([name, values]) => {
                if (values.length === 0) return null;
                const sum = values.reduce((a, b) => a + b, 0);
                const avg = sum / values.length;
                const max = Math.max(...values);
                const min = Math.min(...values);
                return `[${name}] avg: ${avg.toFixed(2)}ms | min: ${min.toFixed(2)}ms | max: ${max.toFixed(2)}ms | calls: ${values.length}`;
            })
            .filter(Boolean);

        if (summary.length > 0) {
            console.groupCollapsed(`--- Performance Summary (last 10s) ---`);
            summary.forEach(line => console.log(line));
            console.groupEnd();
        }

        // Reset timings
        this.timings = {};
    }
}

export const perfTracker = new PerformanceTracker();
