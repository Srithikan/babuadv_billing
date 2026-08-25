const fs = require('fs');
const path = require('path');
const configFilePath = path.join(__dirname, '../uploads/bank_config.json');

function loadBankConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            const raw = fs.readFileSync(configFilePath, 'utf8');
            return JSON.parse(raw) || {};
        }
    } catch (e) {
        console.error('Error loading bank_config.json:', e);
    }
    return {};
}

function saveBankConfig(config) {
    try {
        const dir = path.dirname(configFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving bank_config.json:', e);
    }
}

function getBankSplitMode(bankId, supabaseBillSplit) {
    if (supabaseBillSplit) return supabaseBillSplit;
    const config = loadBankConfig();
    return config[bankId]?.bill_split || 'bank';
}

function setBankSplitMode(bankId, billSplit) {
    const config = loadBankConfig();
    if (!config[bankId]) config[bankId] = {};
    config[bankId].bill_split = billSplit;
    saveBankConfig(config);
}

module.exports = {
    loadBankConfig,
    saveBankConfig,
    getBankSplitMode,
    setBankSplitMode
};
