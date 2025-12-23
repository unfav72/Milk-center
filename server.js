// server.js - Milk Distribution System Server
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'milk_data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize data file
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ records: [] }));
    }
}

// Read data
async function readData() {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
}

// Write data
async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// API Routes

// Get all records
app.get('/api/records', async (req, res) => {
    try {
        const data = await readData();
        res.json(data.records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

// Add new record
app.post('/api/records', async (req, res) => {
    try {
        const data = await readData();
        const newRecord = {
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString(),
            ...req.body
        };
        data.records.push(newRecord);
        await writeData(data);
        res.status(201).json(newRecord);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add record' });
    }
});

// Update record
app.put('/api/records/:id', async (req, res) => {
    try {
        const data = await readData();
        const index = data.records.findIndex(r => r.id === parseInt(req.params.id));
        if (index === -1) {
            return res.status(404).json({ error: 'Record not found' });
        }
        data.records[index] = { ...data.records[index], ...req.body };
        await writeData(data);
        res.json(data.records[index]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update record' });
    }
});

// Delete record
app.delete('/api/records/:id', async (req, res) => {
    try {
        const data = await readData();
        data.records = data.records.filter(r => r.id !== parseInt(req.params.id));
        await writeData(data);
        res.json({ message: 'Record deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const data = await readData();
        const { startDate, endDate } = req.query;
        
        let filtered = data.records;
        if (startDate && endDate) {
            filtered = data.records.filter(r => r.date >= startDate && r.date <= endDate);
        }
        
        const stats = {
            totalRecords: filtered.length,
            totalQuantity: filtered.reduce((sum, r) => sum + r.quantity, 0),
            totalAmount: filtered.reduce((sum, r) => sum + r.amount, 0),
            morningRecords: filtered.filter(r => r.shift === 'morning').length,
            eveningRecords: filtered.filter(r => r.shift === 'evening').length,
            uniqueCustomers: [...new Set(filtered.map(r => r.phone))].length
        };
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate statistics' });
    }
});

// Get customer attendance
app.get('/api/attendance/:phone', async (req, res) => {
    try {
        const data = await readData();
        const customerRecords = data.records.filter(r => r.phone === req.params.phone);
        
        if (customerRecords.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        const summary = {
            name: customerRecords[0].name,
            phone: req.params.phone,
            totalVisits: customerRecords.length,
            totalQuantity: customerRecords.reduce((sum, r) => sum + r.quantity, 0),
            totalAmount: customerRecords.reduce((sum, r) => sum + r.amount, 0),
            records: customerRecords
        };
        
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance' });
    }
});

// Get all unique customers
app.get('/api/customers', async (req, res) => {
    try {
        const data = await readData();
        const customersMap = new Map();
        
        data.records.forEach(r => {
            if (!customersMap.has(r.phone)) {
                customersMap.set(r.phone, { name: r.name, phone: r.phone });
            }
        });
        
        res.json(Array.from(customersMap.values()));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Export to CSV
app.get('/api/export/csv', async (req, res) => {
    try {
        const data = await readData();
        let csv = 'Date,Time,Shift,Name,Phone,Quantity(ml),Amount(₹)\n';
        data.records.forEach(r => {
            csv += `${r.date},${r.time},${r.shift},${r.name},${r.phone},${r.quantity},${r.amount}\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=milk_distribution_report.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: 'Failed to export CSV' });
    }
});

// Generate message for customer
app.get('/api/message/:id', async (req, res) => {
    try {
        const data = await readData();
        const record = data.records.find(r => r.id === parseInt(req.params.id));
        
        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }
        
        const liters = (record.quantity / 1000).toFixed(2);
        const shiftTamil = record.shift === 'morning' ? 'காலை' : 'மாலை';
        
        const message = {
            english: `Dear ${record.name}, you have purchased ${liters} liters of milk for ₹${record.amount} in the ${record.shift} shift.`,
            tamil: `அன்புள்ள ${record.name}, நீங்கள் ${shiftTamil} ஷிப்ட்டில் ₹${record.amount}க்கு ${liters} லிட்டர் பால் வாங்கியுள்ளீர்கள்.`
        };
        
        res.json(message);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate message' });
    }
});

// Start server
async function startServer() {
    await initDataFile();
    app.listen(PORT, () => {
        console.log(`🥛 Milk Distribution Server running on http://localhost:${PORT}`);
        console.log(`📊 API available at http://localhost:${PORT}/api`);
    });
}

startServer();