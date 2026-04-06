const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Initialization
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Create tables
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                password TEXT,
                role TEXT
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                price INTEGER,
                desc TEXT,
                image TEXT
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                user_name TEXT,
                address TEXT,
                status TEXT,
                method TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT,
                product_name TEXT,
                qty INTEGER,
                price INTEGER,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            )`);

            // Seed Admin User
            db.get(`SELECT * FROM users WHERE name = 'Lake'`, (err, row) => {
                if (!row) {
                    db.run(`INSERT INTO users (name, password, role) VALUES ('Lake', 'J4dedLak3', 'admin')`);
                }
            });

            // Seed Products if empty
            db.get(`SELECT count(*) as count FROM products`, (err, row) => {
                if (row.count === 0) {
                    const defaultImage = "Images/NasiGoreng.png";
                    const products = [
                        { name: "Nasi Goreng", price: 15000, desc: "Nasi goreng klasik dengan bumbu rahasia andalan, dilengkapi kerupuk dan acar." },
                        { name: "Mie Goreng", price: 15000, desc: "Mie kenyal digoreng dengan bumbu manis gurih, taburan bawang goreng." },
                        { name: "Mie Rebus", price: 15000, desc: "Mie disajikan dengan kuah kaldu kental hangat nan lezat." },
                        { name: "Bihun Goreng", price: 15000, desc: "Bihun jagung diolah dengan bumbu spesial, ringan namun memuaskan." },
                        { name: "Bihun Rebus", price: 15000, desc: "Hangatnya kuah kaldu berpadu sempurna dengan bihun lembut." },
                        { name: "Kwetiau Goreng", price: 15000, desc: "Kwetiau goreng ala Tionghoa dengan citarasa gurih kuat." },
                        { name: "Kwetiau Rebus", price: 15000, desc: "Kwetiau kuah gurih segar, cocok disantap di malam dingin." }
                    ];
                    
                    const stmt = db.prepare(`INSERT INTO products (name, price, desc, image) VALUES (?, ?, ?, ?)`);
                    products.forEach(p => {
                        stmt.run(p.name, p.price, p.desc, defaultImage);
                    });
                    stmt.finalize();
                    console.log('Seeded products.');
                }
            });
        });
    }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '/')));

// --- API ROUTES ---

// Auth endpoints
app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    db.get(`SELECT id, name, role FROM users WHERE LOWER(name) = LOWER(?) AND password = ?`, [name, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Nama atau Kata Sandi salah' });
        res.json(row);
    });
});

app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    db.run(`INSERT INTO users (name, password, role) VALUES (?, ?, 'user')`, [name, password], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: 'Nama pengguna sudah terdaftar' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, name, role: 'user' });
    });
});

// Products endpoint
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Checkout endpoint
app.post('/api/checkout', (req, res) => {
    const { order_id, user_name, address, method, items } = req.body;
    // Note: in a real app we'd attach user_id properly, for now user_name string is fine or we look it up.
    
    db.run(`INSERT INTO orders (id, user_name, address, status, method) VALUES (?, ?, ?, 'pending', ?)`,
        [order_id, user_name, address, method],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const stmt = db.prepare(`INSERT INTO order_items (order_id, product_name, qty, price) VALUES (?, ?, ?, ?)`);
            items.forEach(item => {
                stmt.run(order_id, item.name, item.qty, item.price);
            });
            stmt.finalize();
            
            res.status(201).json({ success: true, order_id });
        }
    );
});

// Orders endpoint
app.get('/api/orders', (req, res) => {
    const userName = req.query.user; // if passed, filter by user name. if empty/admin, show all
    
    let query = `SELECT * FROM orders ORDER BY created_at DESC`;
    let params = [];
    
    if (userName) {
        query = `SELECT * FROM orders WHERE LOWER(user_name) = LOWER(?) ORDER BY created_at DESC`;
        params = [userName];
    }
    
    db.all(query, params, (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Fetch all items for these orders
        if(orders.length === 0) return res.json([]);
        
        const orderIds = orders.map(o => o.id);
        const placeholders = orderIds.map(() => '?').join(',');
        
        db.all(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds, (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Attach items to orders
            orders.forEach(o => {
                o.items = items.filter(i => i.order_id === o.id);
            });
            
            res.json(orders);
        });
    });
});

// Admin update order
app.put('/api/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, updated: this.changes });
    });
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
