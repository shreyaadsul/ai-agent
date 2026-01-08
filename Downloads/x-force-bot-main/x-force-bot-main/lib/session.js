import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE = path.join(__dirname, 'sessions.json');

/**
 * Persistent session store using a Map backed by a JSON file.
 * Keys are typically phone numbers.
 * Values are objects containing user state and data.
 */
class PersistentMap extends Map {
    constructor() {
        super();
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(SESSION_FILE)) {
                const data = fs.readFileSync(SESSION_FILE, 'utf8');
                if (data) {
                    // Map serializes to array of arrays [[key, val], ...]
                    const parsed = JSON.parse(data);
                    for (const [key, value] of parsed) {
                        super.set(Number(key) || key, value); // Ensure numeric keys if possible, matching typical phone number usage
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    }

    save() {
        try {
            // Serialize Map to array entries
            const data = JSON.stringify([...this]);
            fs.writeFileSync(SESSION_FILE, data, 'utf8');
        } catch (err) {
            console.error('Failed to save sessions:', err);
        }
    }

    set(key, value) {
        const res = super.set(key, value);
        this.save();
        return res;
    }

    delete(key) {
        const result = super.delete(key);
        this.save();
        return result;
    }

    clear() {
        super.clear();
        this.save();
    }
}

const session = new PersistentMap();

export default session;
