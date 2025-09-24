// Minimal BullMQ mock to avoid real Redis connections during tests
export class Queue {
    constructor(name, opts) {
        this.name = name;
        this.opts = opts;
    }
    add() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
}

export default { Queue };
