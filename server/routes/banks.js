const express = require('express');
const router = express.Router();
const supabase = require('../db_supabase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for Template Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const { getBankSplitMode, setBankSplitMode } = require('../utils/bankConfigStore');

// GET all banks with their pricing
router.get('/', async (req, res) => {
    try {
        let banks = null;
        let error = null;

        // Try selecting with bill_split and column_key first
        const resWithColKey = await supabase
            .from('banks')
            .select(`
                id,
                name,
                template_path,
                bill_split,
                pricing (
                    category,
                    price,
                    column_key
                )
            `);

        if (resWithColKey.error) {
            // Fall back to query without bill_split/column_key if column does not exist in Supabase
            const resFallback = await supabase
                .from('banks')
                .select(`
                    id,
                    name,
                    template_path,
                    pricing (
                        category,
                        price
                    )
                `);
            banks = resFallback.data;
            error = resFallback.error;
        } else {
            banks = resWithColKey.data;
        }

        if (error) throw error;

        // Merge bill_split fallback
        if (banks) {
            banks = banks.map(b => ({
                ...b,
                bill_split: getBankSplitMode(b.id, b.bill_split)
            }));
        }

        res.json(banks || []);
    } catch (err) {
        console.error("Error fetching banks:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET download uploaded template for a bank institution
router.get('/:id/template', async (req, res) => {
    const { id } = req.params;

    try {
        const { data: bank, error } = await supabase
            .from('banks')
            .select('id, name, template_path')
            .eq('id', id)
            .single();

        if (error || !bank) {
            return res.status(404).json({ error: 'Bank institution not found' });
        }

        if (!bank.template_path) {
            return res.status(404).json({ error: 'No template uploaded for this bank institution' });
        }

        if (bank.template_path.startsWith('DATA:')) {
            const parts = bank.template_path.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : `${bank.name}_Template.docx`;
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
            const buffer = Buffer.from(base64Str, 'base64');

            const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            const downloadFilename = originalName.endsWith('.docx') ? originalName : `${safeName}_Template.docx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
            return res.send(buffer);
        }

        const filePath = path.join(__dirname, '../uploads', bank.template_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Template file not found on server' });
        }

        const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
        const ext = path.extname(bank.template_path) || '.docx';
        const downloadFilename = `${safeName}_Template${ext}`;

        res.download(filePath, downloadFilename);
    } catch (err) {
        console.error('Error serving bank template download:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST create a new bank (with optional template)
router.post('/', upload.single('template'), async (req, res) => {
    const { name, bill_split, template_data } = req.body;
    const templatePath = req.file ? req.file.filename : (template_data || null);

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Bank name is required' });
    }

    const trimmedName = name.trim();
    const splitMode = bill_split || 'bank';

    try {
        // Check if bank with same name exists
        const { data: existing, error: checkError } = await supabase
            .from('banks')
            .select('id, name, template_path')
            .ilike('name', trimmedName);

        if (existing && existing.length > 0) {
            // If bank exists and a new template was uploaded, update the existing bank's template
            if (templatePath) {
                const { data: updatedData, error: updateError } = await supabase
                    .from('banks')
                    .update({ template_path: templatePath })
                    .eq('id', existing[0].id)
                    .select();

                if (updateError) throw updateError;
                setBankSplitMode(existing[0].id, splitMode);
                return res.status(200).json({ ...updatedData[0], bill_split: splitMode });
            }
            return res.status(400).json({ error: `A bank institution named "${trimmedName}" already exists.` });
        }

        let newBank = null;
        try {
            const { data, error } = await supabase
                .from('banks')
                .insert([{ name: trimmedName, template_path: templatePath, bill_split: splitMode }])
                .select();
            if (error) throw error;
            newBank = data[0];
        } catch (dbErr) {
            const { data, error } = await supabase
                .from('banks')
                .insert([{ name: trimmedName, template_path: templatePath }])
                .select();
            if (error) throw error;
            newBank = data[0];
        }

        setBankSplitMode(newBank.id, splitMode);
        res.status(201).json({ ...newBank, bill_split: splitMode });
    } catch (err) {
        console.error('Error saving bank:', err);
        res.status(500).json({ error: err.message || 'Failed to save bank' });
    }
});

// PUT update bank (name or template or bill_split)
router.put('/:id', upload.single('template'), async (req, res) => {
    const { id } = req.params;
    const { name, bill_split, template_data } = req.body;
    const templatePath = req.file ? req.file.filename : (template_data || undefined);

    const updates = {};
    if (name) updates.name = name;
    if (templatePath) updates.template_path = templatePath;
    if (bill_split) {
        updates.bill_split = bill_split;
        setBankSplitMode(id, bill_split);
    }

    if (Object.keys(updates).length === 0) {
        return res.json({ message: 'No changes provided' });
    }

    try {
        let updatedBank = null;
        try {
            const { data, error } = await supabase
                .from('banks')
                .update(updates)
                .eq('id', id)
                .select();
            if (error) throw error;
            updatedBank = data[0];
        } catch (dbErr) {
            // Fallback if bill_split column doesn't exist in Supabase table
            const fallbackUpdates = { ...updates };
            delete fallbackUpdates.bill_split;

            if (Object.keys(fallbackUpdates).length > 0) {
                const { data, error } = await supabase
                    .from('banks')
                    .update(fallbackUpdates)
                    .eq('id', id)
                    .select();
                if (error) throw error;
                updatedBank = data[0];
            } else {
                const { data } = await supabase.from('banks').select('*').eq('id', id);
                updatedBank = data ? data[0] : { id };
            }
        }

        const finalSplit = getBankSplitMode(id, updatedBank?.bill_split || bill_split);
        res.json({ message: 'Bank updated successfully', bank: { ...updatedBank, bill_split: finalSplit } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST/PUT Update pricing for a bank
router.post('/:id/pricing', async (req, res) => {
    const { id } = req.params;
    const { category, price, column_key } = req.body;

    if (!category || price === undefined) {
        return res.status(400).json({ error: 'Category and price are required' });
    }

    try {
        const payload = {
            bank_id: id,
            category: category.trim(),
            price: parseFloat(price)
        };
        if (column_key !== undefined && column_key !== null) {
            payload.column_key = column_key.trim() || null;
        }

        // Try upserting with column_key first
        let { error } = await supabase
            .from('pricing')
            .upsert(payload, { onConflict: 'bank_id, category' });

        if (error && error.message && error.message.includes('column_key')) {
            // Fallback to upsert without column_key if column doesn't exist in Supabase table
            delete payload.column_key;
            const resFallback = await supabase
                .from('pricing')
                .upsert(payload, { onConflict: 'bank_id, category' });
            error = resFallback.error;
        }

        if (error) throw error;
        res.json({ message: 'Pricing updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE single pricing category entry for a bank
router.delete('/:id/pricing', async (req, res) => {
    const { id } = req.params;
    const category = req.query.category || req.body?.category;

    if (!category) {
        return res.status(400).json({ error: 'Category is required' });
    }

    try {
        const { error } = await supabase
            .from('pricing')
            .delete()
            .eq('bank_id', id)
            .ilike('category', category.trim());

        if (error) throw error;
        res.json({ message: 'Pricing entry deleted successfully' });
    } catch (err) {
        console.error('Error deleting pricing entry:', err);
        res.status(500).json({ error: err.message });
    }
});



// DELETE bank
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Delete pricing first
        const { error: pError } = await supabase
            .from('pricing')
            .delete()
            .eq('bank_id', id);

        if (pError) throw pError;

        // Then delete bank
        const { error: bError } = await supabase
            .from('banks')
            .delete()
            .eq('id', id);

        if (bError) throw bError;

        res.json({ message: 'Bank deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
