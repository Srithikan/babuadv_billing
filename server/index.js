const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const migrateExistingBills = require('./utils/migrateBills');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Static folders for uploads and generated bills
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const generatedDir = path.join(__dirname, 'generated_bills');
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir);

// Run migration for existing flat files into Bank/Month folders
migrateExistingBills();

app.use('/uploads', express.static(uploadsDir));
app.use('/api/download', express.static(generatedDir));

// Routes
const banksRouter = require('./routes/banks');
const billingRouter = require('./routes/billing');
const libraryRouter = require('./routes/library');

app.use('/api/banks', banksRouter);
app.use('/api/billing', billingRouter);
app.use('/api/library', libraryRouter);

app.get('/', (req, res) => {
    res.send('Lawyer Billing System API is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
