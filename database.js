const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class SimpleDB {
    constructor(filename) {
        this.filepath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(this.filepath)) {
            fs.writeFileSync(this.filepath, '{}');
        }
    }

    _read() {
        try {
            return JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
        } catch {
            return {};
        }
    }

    _write(data) {
        fs.writeFileSync(this.filepath, JSON.stringify(data, null, 2));
    }

    get(key) {
        return this._read()[key] || null;
    }

    set(key, value) {
        const data = this._read();
        data[key] = value;
        this._write(data);
    }

    delete(key) {
        const data = this._read();
        delete data[key];
        this._write(data);
    }

    getAll() {
        return this._read();
    }

    find(predicate) {
        const data = this._read();
        const results = [];
        for (const [key, value] of Object.entries(data)) {
            if (predicate(value, key)) results.push({ key, ...value });
        }
        return results;
    }

    cleanup(field, maxAge) {
        const data = this._read();
        const now = Date.now();
        for (const [key, value] of Object.entries(data)) {
            if (value[field] && (now - value[field]) > maxAge) {
                delete data[key];
            }
        }
        this._write(data);
    }
}

module.exports = {
    sessions: new SimpleDB('sessions.json'),
    orders: new SimpleDB('orders.json'),
    tables: new SimpleDB('tables.json'),
    blacklist: new SimpleDB('blacklist.json'),
    rateLimit: new SimpleDB('ratelimit.json'),
    menu: new SimpleDB('menu.json')
};