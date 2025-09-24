// Minimal node-cron mock to prevent timers
const jobs = new Set();

export const schedule = (expr, fn, options = {}) => {
    const job = {
        expr,
        options,
        running: false,
        start: () => { job.running = true; },
        stop: () => { job.running = false; },
        fireOnTick: () => { try { fn && fn(); } catch { } },
    };
    jobs.add(job);
    return job;
};

export const validate = () => true;

export const __cleanupCron = () => {
    for (const j of jobs) {
        try { j.stop(); } catch { }
    }
    jobs.clear();
};

export default { schedule, validate };
