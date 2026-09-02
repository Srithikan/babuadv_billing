const express = require('express');
const router = express.Router();
const supabase = require('../db_supabase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const xlsx = require('xlsx');
const { convertDocxToPdf } = require('../utils/docxToPdf');
const { addDigitalSignature } = require('../utils/signPdf');
const { getBankSplitMode } = require('../utils/bankConfigStore');

const upload = multer({ dest: 'uploads/temp/' });

// Helper to get bank info by name (case insensitive)
async function getBankByName(name) {
    // Supabase ilike is case-insensitive
    const { data, error } = await supabase
        .from('banks')
        .select('*')
        .ilike('name', name)
        .maybeSingle(); // Use maybeSingle to avoid error if not found, just null

    if (error) throw error;
    return data;
}

async function getPricing(bankId) {
    let { data, error } = await supabase
        .from('pricing')
        .select('category, price, column_key')
        .eq('bank_id', bankId);

    if (error && error.message && error.message.includes('column_key')) {
        const fallbackRes = await supabase
            .from('pricing')
            .select('category, price')
            .eq('bank_id', bankId);
        data = fallbackRes.data;
        error = fallbackRes.error;
    }

    if (error) throw error;

    const pricing = {};
    const columnKeys = {};

    if (data) {
        data.forEach(r => {
            if (r.category) {
                const catKey = r.category.toLowerCase().trim();
                pricing[catKey] = Number(r.price);
                if (r.column_key && r.column_key.trim()) {
                    columnKeys[catKey] = r.column_key.trim();
                }
            }
        });
    }
    return { pricing, columnKeys };
}

router.post('/generate', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const results = [];
    const errors = [];

    // 1. Parse File based on type
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    try {
        if (fileExt === '.xlsx' || fileExt === '.xls') {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0]; // Assume first sheet
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet);
            results.push(...data);
            processData();
        } else {
            // CSV Handling
            fs.createReadStream(req.file.path)
                .pipe(parse({ columns: true, trim: true }))
                .on('data', (data) => results.push(data))
                .on('error', (err) => {
                    return res.status(500).json({ error: 'Error parsing CSV', details: err.message });
                })
                .on('end', () => {
                    processData();
                });
        }
    } catch (e) {
        return res.status(500).json({ error: 'Error reading file', details: e.message });
    }

    async function processData() {
        // Group by Bank ID/Name (normalized against DB bank records)
        const banksData = {};
        const { data: allDbBanks } = await supabase.from('banks').select('*');
        const dbBanks = allDbBanks || [];

        function normalizeStr(str) {
            if (!str) return '';
            return String(str)
                .toLowerCase()
                .replace(/[_.\-\s]+/g, ' ')
                .trim();
        }

        function extractAppIdPrefix(appId) {
            if (!appId) return '';
            const str = String(appId).trim();
            // Remove trailing numeric digits, e.g. "icici_kcc_440" -> "icici_kcc", "axis_prime_243" -> "axis_prime"
            const match = str.match(/^(.*?)(?:[_\-\s]*\d+)?$/);
            return match && match[1] ? match[1] : str;
        }

        function extractCleanAppId(rawId, bankObj) {
            if (!rawId) return '';
            let str = String(rawId).trim();
            if (!str) return '';

            if (bankObj && bankObj.name) {
                const bNorm = bankObj.name.toLowerCase().replace(/[_.\-\s]+/g, '');
                const cleanStr = str.replace(/[_.\-\s]+/g, '');
                if (cleanStr.toLowerCase().startsWith(bNorm)) {
                    let charCount = 0;
                    let normCount = 0;
                    for (let i = 0; i < str.length; i++) {
                        if (/[_.\-\s]/.test(str[i])) {
                            charCount++;
                        } else {
                            charCount++;
                            normCount++;
                            if (normCount === bNorm.length) {
                                break;
                            }
                        }
                    }
                    let remainder = str.slice(charCount).replace(/^[_.\-\s]+/, '');
                    if (remainder) return remainder;
                }
            }

            const match = str.match(/[_\-\s]+([A-Za-z0-9]+)$/);
            if (match && match[1]) {
                return match[1];
            }

            return str;
        }

        function isWordBoundaryMatch(cand, bNorm) {
            if (!cand || !bNorm) return false;
            if (cand === bNorm) return true;
            const escaped = bNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('^' + escaped + '(?:\\s|_|-|\\d|$)', 'i');
            return regex.test(cand);
        }

        function findDbBank(rawBankName, rawOpinionId) {
            const bankNameCandidates = [];
            const appIdCandidates = [];

            if (rawBankName) {
                bankNameCandidates.push(normalizeStr(rawBankName));
            }

            if (rawOpinionId) {
                const prefix = extractAppIdPrefix(rawOpinionId);
                if (prefix) appIdCandidates.push(normalizeStr(prefix));
                appIdCandidates.push(normalizeStr(rawOpinionId));
            }

            // Combine candidate pools, prioritizing explicit Bank_Name candidates first
            const candidatePools = [bankNameCandidates, appIdCandidates].filter(pool => pool.length > 0);
            if (candidatePools.length === 0) return null;

            // Pass 1: Exact match pass (prioritize candidate pools first, then longest matching DB bank name)
            for (const pool of candidatePools) {
                const exactMatches = [];
                for (const cand of pool) {
                    if (!cand) continue;
                    const found = dbBanks.filter(b => b.name && normalizeStr(b.name) === cand);
                    exactMatches.push(...found);
                }
                if (exactMatches.length > 0) {
                    exactMatches.sort((a, b) => normalizeStr(b.name).length - normalizeStr(a.name).length);
                    return exactMatches[0];
                }
            }

            // Pass 2: Strict Forward Prefix Match (Candidate starts with registered DB Bank Name + word boundary)
            // e.g. Excel bank name "UJJIVAN BUSINESS PVT LTD" starts with DB bank "UJJIVAN BUSINESS"
            for (const pool of candidatePools) {
                const matches = [];
                for (const b of dbBanks) {
                    if (!b.name) continue;
                    const bNorm = normalizeStr(b.name);
                    if (!bNorm) continue;

                    const escB = bNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp('^' + escB + '(?:\\s|_|-|\\d|$)', 'i');

                    for (const cand of pool) {
                        if (!cand) continue;
                        if (regex.test(cand)) {
                            matches.push({ bank: b, bNorm });
                            break;
                        }
                    }
                }

                if (matches.length > 0) {
                    matches.sort((a, b) => b.bNorm.length - a.bNorm.length);
                    return matches[0].bank;
                }
            }

            return null;
        }

        const generatedFiles = [];
        const processingErrors = [];
        const skippedRecords = [];

        for (const [index, rawRow] of results.entries()) {
            // Normalization / Mapping Logic
            const getVal = (keys) => {
                // Pass 1: Look for first non-empty, non-N/A value
                for (const k of keys) {
                    const match = Object.keys(rawRow).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
                    if (match && rawRow[match] !== undefined && rawRow[match] !== null) {
                        const val = String(rawRow[match]).trim();
                        if (val !== '' && val.toUpperCase() !== 'N/A' && val.toUpperCase() !== 'NA' && val.toUpperCase() !== 'N / A') {
                            return rawRow[match];
                        }
                    }
                }
                // Pass 2: Fallback to first non-empty match even if N/A
                for (const k of keys) {
                    const match = Object.keys(rawRow).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
                    if (match && rawRow[match] !== undefined && rawRow[match] !== null) {
                        const val = String(rawRow[match]).trim();
                        if (val !== '') return rawRow[match];
                    }
                }
                return undefined;
            };

            const row = {
                ...rawRow,
                Bank_Name: getVal(['Bank_Name', 'Bank Name', 'Bank', 'BankName']),
                Client_Name: getVal(['Client_Name', 'Client Name', 'Borrower Name', 'Applicant Name', 'Name of the Applicant', 'Name of Applicant', 'Applicant', 'Customer Name', 'Party Name']),
                Application_Type: getVal(['Application_Type', 'Application Type', 'ApplicationType', 'Opinion/Vetting/EC', 'Opinion / Vetting / EC', 'Opinion/Vetting', 'Service Type', 'Work Type', 'Type of Work']),
                Application_ID: getVal(['Application_ID', 'Application ID', 'Opinion_ID', 'Opinion ID', 'Login Id', 'File No', 'Ref No', 'Serial No']),
                Bank_Application_Number: getVal(['Bank Application Number', 'Bank Application No', 'Bank Application No.', 'LAN Number', 'Lan No.', 'Lan No', 'LAN No', 'Bank App No']),
                Opinion_ID: getVal(['Application_ID', 'Application ID', 'Opinion_ID', 'Opinion ID', 'Bank Application Number', 'Bank Application No', 'LAN Number', 'Lan No.', 'Login Id', 'File No', 'Ref No']),
                Opinion_Date: getVal(['Opinion_Date', 'Opinion Date', 'Created Date', 'Date', 'Received Date']),
                Branch: getVal(['Branch', 'Branch Name', 'Branch_Name', 'Office Branch', 'Branch Office', 'Zone', 'District', 'Taluk', 'Location']) || rawRow['Branch'] || '',
            };

            let rawBankName = row['Bank_Name'];
            const rawOpinionId = row['Application_ID'] || row['Opinion_ID'];

            const matchedBank = findDbBank(rawBankName, rawOpinionId);

            if (!rawBankName && matchedBank) {
                rawBankName = matchedBank.name;
                row['Bank_Name'] = matchedBank.name;
            }

            if (!rawBankName && !matchedBank) {
                errors.push(`Row ${index + 1}: Missing or unmapped Bank Name (Application ID: "${rawOpinionId || 'N/A'}")`);
                skippedRecords.push({
                    Row: index + 1,
                    Bank_Name: rawBankName || 'N/A',
                    Client_Name: row['Client_Name'] || 'N/A',
                    Application_ID: rawOpinionId || 'N/A',
                    Reason: 'Missing or unmapped Bank Name'
                });
                continue;
            }

            const effectiveBankName = matchedBank ? matchedBank.name : rawBankName;
            const bankKey = matchedBank ? `bank_${matchedBank.id}` : `raw_${normalizeStr(rawBankName)}`;

            if (!banksData[bankKey]) {
                banksData[bankKey] = {
                    bankObj: matchedBank,
                    rawName: effectiveBankName,
                    opinions: []
                };
            }
            banksData[bankKey].opinions.push(row);
        }

        // Separate registered bank groups from unregistered ones
        const registeredBankGroups = {};
        for (const [bankKey, bankGroup] of Object.entries(banksData)) {
            let bank = bankGroup.bankObj;
            if (!bank) {
                bank = await getBankByName(bankGroup.rawName);
            }

            if (!bank) {
                processingErrors.push(`Bank "${bankGroup.rawName}" not found in system.`);
                bankGroup.opinions.forEach((op, opIdx) => {
                    skippedRecords.push({
                        Row: op.hasIndex || opIdx + 1,
                        Bank_Name: bankGroup.rawName || 'N/A',
                        Client_Name: op['Client_Name'] || op['Client Name'] || op['Borrower Name'] || op['Applicant Name'] || 'N/A',
                        Application_ID: op['Application_ID'] || op['Opinion_ID'] || op['Bank Application Number'] || 'N/A',
                        Reason: `Bank "${bankGroup.rawName}" is not registered in Bank Manager`
                    });
                });
                continue;
            }

            if (!bank.template_path) {
                processingErrors.push(`Bank "${bank.name}" has no template assigned.`);
                bankGroup.opinions.forEach((op, opIdx) => {
                    skippedRecords.push({
                        Row: op.hasIndex || opIdx + 1,
                        Bank_Name: bank.name,
                        Client_Name: op['Client_Name'] || op['Client Name'] || op['Borrower Name'] || op['Applicant Name'] || 'N/A',
                        Application_ID: op['Application_ID'] || op['Opinion_ID'] || op['Bank Application Number'] || 'N/A',
                        Reason: `Bank "${bank.name}" has no DOCX template assigned in Bank Manager`
                    });
                });
                continue;
            }

            bankGroup.bankObj = bank;
            registeredBankGroups[bankKey] = bankGroup;
        }

        // Process each registered bank group
        for (const [bankKey, bankGroup] of Object.entries(registeredBankGroups)) {
            const opinions = bankGroup.opinions;
            const bank = bankGroup.bankObj;
            try {
                const { pricing, columnKeys } = await getPricing(bank.id);
                const pricingKeys = Object.keys(pricing);
                const hasConfiguredPricing = pricingKeys.length > 0;

                // Filter opinions to only include those matching configured pricing categories if bank has pricing configured
                let bankOpinionsToProcess = opinions;
                if (hasConfiguredPricing) {
                    bankOpinionsToProcess = opinions.filter(op => {
                        const getVal = (keyName) => {
                            const searchInfo = Object.keys(op).find(k => k.toLowerCase().trim() === keyName.toLowerCase().trim());
                            return searchInfo ? op[searchInfo] : undefined;
                        };
                        const appTypeRaw = getVal('Application_Type') || getVal('Application Type') || getVal('ApplicationType') || getVal('Opinion/Vetting/EC') || getVal('Opinion / Vetting / EC') || getVal('Opinion/Vetting') || getVal('Service Type') || getVal('Work Type') || getVal('Type of Work') || getVal('Service') || getVal('Work') || '';
                        const pricingString = String(appTypeRaw).trim();
                        if (!pricingString) return false;

                        const categories = pricingString.split(/[+&/,]/).map(s => s.trim()).filter(Boolean);
                        return categories.some(subCat => {
                            const key = subCat.toLowerCase().trim();
                            if (pricing[key] !== undefined) return true;
                            const matchedKey = pricingKeys.find(pk => pk.includes(key) || key.includes(pk));
                            return !!matchedKey;
                        });
                    });

                    if (bankOpinionsToProcess.length === 0 && opinions.length > 0) {
                        const warnMsg = `Bank "${bank.name}": None of the ${opinions.length} records matched the configured pricing categories (${pricingKeys.join(', ')}). Bill skipped.`;
                        if (!processingErrors.includes(warnMsg)) {
                            processingErrors.push(warnMsg);
                        }
                        continue;
                    }
                }

                // Calculation Logic
                let grandTotal = 0;
                const categoryTotals = {};

                const { ToWords } = require('to-words');
                const toWords = new ToWords({
                    localeCode: 'en-IN',
                    converterOptions: {
                        currency: true,
                        ignoreDecimal: false,
                        ignoreZeroCurrency: false,
                        doNotAddOnly: false,
                    }
                });

                function cleanClientName(name) {
                    if (!name) return '';
                    let str = String(name).trim();
                    str = str.replace(/\s*-\s*(VACANT|RESIDENT|RESIDENTIAL|AGRI|AGRICULTURAL|SITE|LAND|HOUSE|COMMERCIAL|PROPERTY|BUILDING).*$/i, '');
                    str = str.replace(/\s*-\s*[^-]+$/, '');
                    return str.trim() || String(name).trim();
                }

                const processedOpinions = bankOpinionsToProcess.map((op, idx) => {
                    // Helper to get value case-insensitively
                    const getValue = (keyName) => {
                        const searchInfo = Object.keys(op).find(k => k.toLowerCase().trim() === keyName.toLowerCase().trim());
                        return searchInfo ? op[searchInfo] : undefined;
                    }

                    // Sanitize undefined/null to empty string
                    const safeOp = {};
                    for (const key in op) {
                        safeOp[key] = (op[key] === undefined || op[key] === null) ? '' : op[key];
                    }

                    const appTypeRaw = getValue('Application_Type') || getValue('Application Type') || getValue('ApplicationType') || getValue('Opinion/Vetting/EC') || getValue('Opinion / Vetting / EC') || getValue('Opinion/Vetting') || getValue('Service Type') || getValue('Work Type') || getValue('Type of Work') || getValue('Service') || getValue('Work') || '';
                    const propertyTypeRaw = getValue('Nature of Property') || getValue('Nature Of Property') || getValue('Nature of property') || getValue('Opinion_Category') || getValue('Opinion Category') || getValue('Type of Property') || getValue('Property Type') || getValue('Loan Type') || '';

                    // Pricing calculation is EXCLUSIVELY based on Application Type
                    const pricingString = String(appTypeRaw).trim();
                    const displayAppType = String(appTypeRaw).trim() || 'N/A';
                    const displayPropertyType = String(propertyTypeRaw).trim() || 'N/A';

                    let itemTotal = 0;
                    let tsrCount = 1;

                    if (!pricingString) {
                        const warnMsg = `Row ${idx + 1}: Missing Application Type (e.g. Legal Opinion, Vetting, EC). Defaulted to ₹0.`;
                        if (!processingErrors.includes(warnMsg)) {
                            processingErrors.push(warnMsg);
                        }
                    } else {
                        // Split logic for TSR Counting & Pricing
                        // Split by +, &, /, or ,
                        const categories = pricingString.split(/[+&/,]/).map(s => s.trim()).filter(Boolean);
                        tsrCount = categories.length || 1;

                        // Sum price for each sub-service based strictly on Application Type
                        const serviceBreakdown = {};
                        categories.forEach(subCat => {
                            const key = subCat.toLowerCase().trim();
                            let price = pricing[key];

                            if (price === undefined) {
                                // Try fuzzy search or fallback matching
                                const matchedKey = Object.keys(pricing).find(pk => pk.includes(key) || key.includes(pk));
                                if (matchedKey) {
                                    price = pricing[matchedKey];
                                } else {
                                    price = 0;
                                    if (!hasConfiguredPricing) {
                                        const warnMsg = `Application Type / Service "${subCat}" has no price configured for "${bank.name}". Defaulted to ₹0.`;
                                        if (!processingErrors.includes(warnMsg)) {
                                            processingErrors.push(warnMsg);
                                        }
                                    }
                                }
                            }

                            itemTotal += price;
                            serviceBreakdown[key] = (serviceBreakdown[key] || 0) + price;

                            // Add to global totals
                            if (!categoryTotals[subCat]) {
                                categoryTotals[subCat] = { count: 0, amount: 0 };
                            }
                            categoryTotals[subCat].count++;
                            categoryTotals[subCat].amount += price;
                        });
                        safeOp.serviceBreakdown = serviceBreakdown;
                    }

                    grandTotal += itemTotal;

                    // Extract explicit Bank Application Number if present in Excel (e.g. KCC00000592719, LAP08202630565, 83006025, MMA00082637)
                    const explicitBankAppNo = getValue('Bank Application Number') || getValue('Bank Application No') || getValue('Bank Application No.') || getValue('LAN Number') || getValue('Lan No.') || getValue('Lan No') || getValue('LAN No') || getValue('Bank App No');
                    const rawAppId = getValue('Application_ID') || getValue('Application ID') || getValue('Opinion_ID') || getValue('Opinion ID') || getValue('Login Id') || getValue('File No') || getValue('Ref No') || '';

                    let lanNoVal = '';
                    if (explicitBankAppNo !== undefined && explicitBankAppNo !== null && String(explicitBankAppNo).trim() !== '') {
                        lanNoVal = String(explicitBankAppNo).trim();
                    } else {
                        lanNoVal = extractCleanAppId(rawAppId, bank);
                    }

                    const rawClientName = safeOp.Client_Name || safeOp['Borrower / Applicant'] || safeOp['Borrower/Applicant'] || safeOp['Borrower Name'] || safeOp['Applicant Name'] || safeOp['Client Name'] || safeOp['Applicant'] || '';
                    const cleanedClientName = cleanClientName(rawClientName);
                    const propVal = displayPropertyType !== 'N/A' ? displayPropertyType : displayAppType;

                    return {
                        hasIndex: idx + 1,
                        ...safeOp,
                        Opinion_Category: displayAppType,
                        Amount: itemTotal,
                        'No. of TSR': tsrCount,
                        TSR_Count: tsrCount,

                        // Application Type & Opinion/Vetting/EC aliases
                        'Application Type': displayAppType,
                        'ApplicationType': displayAppType,
                        'Opinion/Vetting/EC': displayAppType,
                        'Opinion / Vetting / EC': displayAppType,
                        'Opinion/Vetting': displayAppType,
                        'Service Type': displayAppType,

                        // LAN No. & Login ID aliases (Prioritizes explicit Bank Application Number, e.g. KCC00000592719)
                        'Lan No.': lanNoVal,
                        'Lan No': lanNoVal,
                        'LAN No': lanNoVal,
                        'LAN Number': lanNoVal,
                        'Bank Application Number': lanNoVal,
                        'Login Id': lanNoVal,
                        'Application ID': lanNoVal,
                        'Opinion ID': lanNoVal,
                        'File No': lanNoVal,

                        // Full / Raw Application ID aliases (e.g. icici_kcc_423)
                        'Full Application ID': rawAppId,
                        'Raw Application ID': rawAppId,

                        // Property Type & Loan Type aliases
                        'Nature of Property': propVal,
                        'Nature Of Property': propVal,
                        'Nature of property': propVal,
                        'Property Nature': propVal,
                        'Type of Property': propVal,
                        'Loan Type': propVal,
                        'Property Type': propVal,

                        // Aliases for user template flexibility
                        'S.No': idx + 1,
                        'S. No': idx + 1,
                        'Serial No': idx + 1,

                        'Borrower Name': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Applicant Name': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Client Name': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Client_Name': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Borrower / Applicant': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Borrower/Applicant': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Name of the Applicant': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Name of Applicant': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,
                        'Applicant': cleanedClientName || safeOp['Borrower / Applicant'] || safeOp.Client_Name,

                        'Branch': safeOp.Branch || '',
                        'Branch Name': safeOp.Branch || safeOp['Branch Name'] || '',
                        'Branch_Name': safeOp.Branch || safeOp['Branch_Name'] || '',
                        'Office Branch': safeOp.Branch || safeOp['Office Branch'] || '',
                        'Branch Office': safeOp.Branch || safeOp['Branch Office'] || '',
                        'Bank Name': safeOp.Bank_Name,

                        // Fallback for "undefined" strings
                        'undefined': ''
                    };
                });

                // -----------------------------------------------------------
                // Merge rows that share the same Bank Application Number or Client Name + Branch
                // e.g. SATHYA - VACANT (1362004) + SATHYA - AGRI (1362004)
                //   → SATHYA | Vacant Property + Resident Property | TSR=2 | Amount=sum
                // -----------------------------------------------------------
                const mergedOpinions = (() => {
                    const grouped = new Map();
                    const order = [];

                    for (const op of processedOpinions) {
                        const lanKey = String(op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || '').trim();
                        const rawName = op['Client_Name'] || op['Borrower Name'] || op['Applicant Name'] || '';
                        const cleanName = cleanClientName(rawName).toLowerCase().replace(/\s+/g, '');
                        const branchKey = String(op['Branch'] || op['Branch Name'] || '').toLowerCase().trim();

                        let groupKey = '';
                        if (lanKey && lanKey.toLowerCase() !== 'n/a' && lanKey.toLowerCase() !== 'na') {
                            groupKey = `lan_${lanKey}`;
                        } else if (cleanName) {
                            groupKey = `name_${cleanName}_${branchKey}`;
                        } else {
                            groupKey = Symbol();
                        }

                        if (grouped.has(groupKey)) {
                            grouped.get(groupKey).push(op);
                        } else {
                            grouped.set(groupKey, [op]);
                            order.push(groupKey);
                        }
                    }

                    const result = [];
                    for (const key of order) {
                        const group = grouped.get(key);
                        if (group.length === 1) {
                            // Single row — pass through unchanged
                            result.push(group[0]);
                        } else {
                            // Multiple rows with same LAN No / Client Name — merge into one
                            const first = group[0];

                            // Collect unique property types from each row
                            const propertyTypes = [];
                            let totalAmount = 0;
                            let totalTSR = 0;
                            for (const row of group) {
                                const pt = String(
                                    row['Nature of Property'] ||
                                    row['Nature Of Property'] ||
                                    row['Type of Property'] ||
                                    row['Property Type'] ||
                                    row['Opinion_Category'] ||
                                    row['Application Type'] ||
                                    ''
                                ).trim();
                                if (pt && !propertyTypes.includes(pt)) {
                                    propertyTypes.push(pt);
                                }
                                 totalAmount += Number(row['Amount']) || 0;
                                totalTSR += Number(row['TSR_Count']) || 0;
                            }
                            const combinedPropertyType = propertyTypes.join(' + ');

                            const combinedBreakdown = {};
                            for (const row of group) {
                                if (row.serviceBreakdown) {
                                    for (const [sKey, sPrice] of Object.entries(row.serviceBreakdown)) {
                                        combinedBreakdown[sKey] = (combinedBreakdown[sKey] || 0) + sPrice;
                                    }
                                }
                            }

                            // Clean client name — strip trailing " - SUFFIX"
                            const rawName = first['Client_Name'] || first['Borrower Name'] || first['Applicant Name'] || '';
                            const cleanedName = cleanClientName(rawName);

                            const merged = {
                                ...first,
                                serviceBreakdown: combinedBreakdown,
                                // Summed values
                                Amount: totalAmount,
                                'No. of TSR': totalTSR,
                                TSR_Count: totalTSR,

                                // Combined property/opinion type
                                'Nature of Property': combinedPropertyType,
                                'Nature Of Property': combinedPropertyType,
                                'Nature of property': combinedPropertyType,
                                'Property Nature': combinedPropertyType,
                                'Type of Property': combinedPropertyType,
                                'Loan Type': combinedPropertyType,
                                'Property Type': combinedPropertyType,
                                'Opinion_Category': combinedPropertyType,
                                'Application Type': combinedPropertyType,
                                'ApplicationType': combinedPropertyType,
                                'Opinion/Vetting/EC': combinedPropertyType,
                                'Opinion / Vetting / EC': combinedPropertyType,
                                'Opinion/Vetting': combinedPropertyType,
                                'Service Type': combinedPropertyType,

                                // Cleaned client name (without " - VACANT" / " - AGRI" suffix)
                                'Client_Name': cleanedName,
                                'Borrower Name': cleanedName,
                                'Applicant Name': cleanedName,
                                'Client Name': cleanedName,
                                'Name of the Applicant': cleanedName,
                                'Name of Applicant': cleanedName,
                                'Applicant': cleanedName,
                            };
                            result.push(merged);
                        }
                    }

                    // Re-index S.No sequentially after merging
                    return result.map((op, idx) => ({
                        ...op,
                        hasIndex: idx + 1,
                        'S.No': idx + 1,
                        'S. No': idx + 1,
                        'Serial No': idx + 1,
                    }));
                })();

                // Compute Product Groups for Product-wise Detailed Bills / Summary Table
                const productGroups = Object.entries(categoryTotals).map(([catName, catData], catIdx) => {
                    const catItems = mergedOpinions.filter(op => {
                        const propType = String(
                            op['Application Type'] || op['Nature of Property'] || op['Opinion_Category'] || op['Service Type'] || ''
                        ).toLowerCase();
                        const targetCat = catName.toLowerCase().trim();
                        return propType.includes(targetCat) || targetCat.includes(propType);
                    });

                    const itemsToUse = catItems.length > 0 ? catItems : mergedOpinions;
                    const letterIndex = String.fromCharCode(65 + catIdx); // A, B, C...
                    const unitPriceVal = catData.count > 0 ? Math.round(catData.amount / catData.count) : 0;
                    const formattedFees = unitPriceVal > 0 ? `${unitPriceVal.toLocaleString('en-IN')}/-` : 'Nil';
                    const formattedTotal = `${catData.amount.toLocaleString('en-IN')}/-`;

                    return {
                        sno: catIdx + 1,
                        'S.No': letterIndex,
                        'S. No': letterIndex,
                        'S. No.': letterIndex,
                        'S.No.': letterIndex,
                        'S.NO': letterIndex,
                        snoLetter: letterIndex,
                        sno_letter: letterIndex,
                        Letter: letterIndex,

                        product_name: catName.toUpperCase(),
                        productName: catName.toUpperCase(),
                        Product: catName.toUpperCase(),
                        PRODUCT: catName.toUpperCase(),
                        name: catName.toUpperCase(),
                        Description: catName,
                        description: catName,
                        Particulars: catName,
                        Particular: catName,
                        'Product / Loan Type': catName.toUpperCase(),
                        'Product/Loan Type': catName.toUpperCase(),
                        'Product / LoanType': catName.toUpperCase(),
                        'Loan Type': catName.toUpperCase(),

                        count: catData.count,
                        Count: catData.count,
                        Quantity: catData.count,
                        quantity: catData.count,
                        Qty: catData.count,
                        qty: catData.count,
                        'No. of TSR': catData.count,
                        'No. of TSRs': catData.count,
                        'TSR_Count': catData.count,
                        'TSR Count': catData.count,

                        unitPrice: unitPriceVal,
                        'Unit Price': unitPriceVal,
                        'Unit Price (in Rs.)': unitPriceVal,
                        Fees: formattedFees,
                        fees: formattedFees,

                        subtotal: catData.amount,
                        Subtotal: catData.amount,
                        total: catData.amount,
                        Total: formattedTotal,
                        Amount: catData.amount,
                        GRAND_TOTAL: catData.amount,
                        items: itemsToUse.map((op, idx) => ({
                            ...op,
                            sno: idx + 1,
                            'S.No': idx + 1,
                            'S. No': idx + 1,
                            'S.NO': idx + 1,
                            date: op['Submission Date'] || op['Effective Billing Date'] || op['Login Date'] || op['Date'] || op['Login_Date'] || op['Invoice Date'] || '',
                            Date: op['Submission Date'] || op['Effective Billing Date'] || op['Login Date'] || op['Date'] || op['Login_Date'] || op['Invoice Date'] || '',
                            DATE: op['Submission Date'] || op['Effective Billing Date'] || op['Login Date'] || op['Date'] || op['Login_Date'] || op['Invoice Date'] || '',
                            'Submission Date': op['Submission Date'] || op['Effective Billing Date'] || op['Login Date'] || op['Date'] || op['Login_Date'] || op['Invoice Date'] || '',
                            'SubmissionDate': op['Submission Date'] || op['Effective Billing Date'] || op['Login Date'] || op['Date'] || op['Login_Date'] || op['Invoice Date'] || '',

                            app_id: op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Bank Application No'] || op['App ID'] || op['Login ID'] || op['Application ID'] || op['App_ID'] || op['LAN'] || '',
                            App_ID: op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Bank Application No'] || op['App ID'] || op['Login ID'] || op['Application ID'] || op['App_ID'] || op['LAN'] || '',
                            APP_ID: op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Bank Application No'] || op['App ID'] || op['Login ID'] || op['Application ID'] || op['App_ID'] || op['LAN'] || '',
                            'Bank Application No': op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Bank Application No'] || op['App ID'] || op['Login ID'] || op['Application ID'] || op['App_ID'] || op['LAN'] || '',
                            'Bank Application No.': op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Bank Application No'] || op['App ID'] || op['Login ID'] || op['Application ID'] || op['App_ID'] || op['LAN'] || '',
                            'Bank Application Number': op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Bank Application No'] || op['App ID'] || op['Login ID'] || op['Application ID'] || op['App_ID'] || op['LAN'] || '',

                            applicant_name: op['Borrower / Applicant'] || op['Client_Name'] || op['Applicant Name'] || op['Borrower Name'] || op['Applicant'] || '',
                            Applicant_Name: op['Borrower / Applicant'] || op['Client_Name'] || op['Applicant Name'] || op['Borrower Name'] || op['Applicant'] || '',
                            APPLICANT_NAME: op['Borrower / Applicant'] || op['Client_Name'] || op['Applicant Name'] || op['Borrower Name'] || op['Applicant'] || '',
                            'Borrower / Applicant': op['Borrower / Applicant'] || op['Client_Name'] || op['Applicant Name'] || op['Borrower Name'] || op['Applicant'] || '',
                            'Borrower/Applicant': op['Borrower / Applicant'] || op['Client_Name'] || op['Applicant Name'] || op['Borrower Name'] || op['Applicant'] || '',

                            amount: op['Amount'] || 0,
                            Amount: op['Amount'] || 0,
                            AMOUNT: op['Amount'] || 0
                        }))
                    };
                });

                // Compute Summary Counters & Column Fee Breakdown
                let freshCaseCount = 0;
                let apfCount = 0;
                let vettingCount = 0;
                let modtCount = 0;

                let totalLsrFee = 0;
                let totalApfFee = 0;
                let totalVettingFee = 0;
                let totalModtFee = 0;

                const columnKeyMap = columnKeys || {};
                const configuredColKeys = new Set(Object.values(columnKeyMap));

                const enrichedOpinions = mergedOpinions.map((op, idx) => {
                    const catRaw = String(
                        op['Application Type'] || op['Opinion_Category'] || op['Service Type'] || op['Nature of Property'] || ''
                    ).trim();
                    const catLower = catRaw.toLowerCase();
                    const catUpper = catRaw.toUpperCase();
                    const amt = Number(op.Amount) || 0;

                    // 1. Determine dynamic column key from bank pricing configuration
                    let configuredColKey = columnKeyMap[catLower];
                    if (!configuredColKey && catLower) {
                        const matchedCat = Object.keys(columnKeyMap).find(k => catLower.includes(k) || k.includes(catLower));
                        if (matchedCat) {
                            configuredColKey = columnKeyMap[matchedCat];
                        }
                    }

                    // 2. Build default fee columns object
                    const dynamicFeeCols = {};

                    // Pre-fill configured column keys as '--' for all rows
                    configuredColKeys.forEach(colKey => {
                        dynamicFeeCols[colKey] = '--';
                        dynamicFeeCols[colKey.replace(/_/g, ' ')] = '--';
                        dynamicFeeCols[`${colKey}_Fees`] = '--';
                        dynamicFeeCols[`${colKey} Fees`] = '--';
                    });

                    // 3. Populate fee columns per sub-service breakdown
                    let lsrFee = '--';
                    let apfFee = '--';
                    let vettingFee = '--';
                    let modtFee = '--';
                    let chequeFee = '--';
                    let sroEcFee = '--';

                    if (op.serviceBreakdown && Object.keys(op.serviceBreakdown).length > 0) {
                        for (const [subCatKey, subPrice] of Object.entries(op.serviceBreakdown)) {
                            const sUpper = subCatKey.toUpperCase();
                            if (sUpper.includes('APF')) {
                                apfFee = subPrice;
                            } else if (sUpper.includes('VETTING')) {
                                vettingFee = subPrice;
                            } else if (sUpper.includes('MODT') || sUpper.includes('SALE') || sUpper.includes('DRAFT')) {
                                modtFee = subPrice;
                            } else if (sUpper.includes('EC') || sUpper.includes('SRO')) {
                                sroEcFee = subPrice;
                            } else if (sUpper.includes('CHEQUE') || sUpper.includes('HAND OVER') || sUpper.includes('HANDOVER')) {
                                chequeFee = subPrice;
                            } else {
                                lsrFee = subPrice;
                            }

                            // Custom column tag if configured in DB
                            const cKey = columnKeyMap[subCatKey] || columnKeyMap[subCatKey.toLowerCase()];
                            if (cKey) {
                                dynamicFeeCols[cKey] = subPrice;
                                dynamicFeeCols[cKey.replace(/_/g, ' ')] = subPrice;
                                dynamicFeeCols[`${cKey}_Fees`] = subPrice;
                                dynamicFeeCols[`${cKey} Fees`] = subPrice;
                                dynamicFeeCols[`${cKey}_Fee`] = subPrice;
                                dynamicFeeCols[`${cKey} Fee`] = subPrice;
                                dynamicFeeCols[`${cKey}_Charges`] = subPrice;
                                dynamicFeeCols[`${cKey} Charges`] = subPrice;
                            }
                        }
                    } else {
                        // Fallback single column assignment
                        if (catUpper.includes('APF')) {
                            apfFee = amt;
                        } else if (catUpper.includes('VETTING')) {
                            vettingFee = amt;
                        } else if (catUpper.includes('MODT') || catUpper.includes('SALE') || catUpper.includes('DRAFT')) {
                            modtFee = amt;
                        } else if (catUpper.includes('EC') || catUpper.includes('SRO')) {
                            sroEcFee = amt;
                        } else if (catUpper.includes('CHEQUE') || catUpper.includes('HAND OVER') || catUpper.includes('HANDOVER')) {
                            chequeFee = amt;
                        } else {
                            lsrFee = amt;
                        }

                        if (configuredColKey) {
                            dynamicFeeCols[configuredColKey] = amt;
                            dynamicFeeCols[configuredColKey.replace(/_/g, ' ')] = amt;
                            dynamicFeeCols[`${configuredColKey}_Fees`] = amt;
                            dynamicFeeCols[`${configuredColKey} Fees`] = amt;
                            dynamicFeeCols[`${configuredColKey}_Fee`] = amt;
                            dynamicFeeCols[`${configuredColKey} Fee`] = amt;
                            dynamicFeeCols[`${configuredColKey}_Charges`] = amt;
                            dynamicFeeCols[`${configuredColKey} Charges`] = amt;
                        }
                    }

                    const appNo = op['Lan No.'] || op['Lan No'] || op['LAN No'] || op['Bank Application Number'] || op['Application ID'] || op['Login Id'] || op['File No'] || '';
                    const location = op['Branch'] || op['Branch Name'] || op['Location'] || op['Office Branch'] || 'Madurai';
                    const custName = op['Client_Name'] || op['Borrower Name'] || op['Applicant Name'] || op['Borrower / Applicant'] || '';

                    return {
                        ...op,
                        'S.No': idx + 1,
                        'S. No': idx + 1,
                        'S.NO': idx + 1,
                        APPLICATION_NO: appNo,
                        'APPLICATION NO.': appNo,
                        'Application No': appNo,
                        'Application No.': appNo,
                        'Bank Application No': appNo,
                        'Bank Application No.': appNo,
                        'Bank Application Number': appNo,
                        'Ref. No.': appNo,
                        'Ref. No': appNo,
                        'Ref No.': appNo,
                        'Ref No': appNo,
                        'Ref_No': appNo,
                        'Ref_No.': appNo,
                        'REF_NO': appNo,
                        'Ref.No.': appNo,
                        'Ref.No': appNo,
                        'Ref': appNo,
                        'REF': appNo,
                        'Ref No / App ID': appNo,
                        'Ref. No. / App ID': appNo,
                        LOCATION: location,
                        'Location': location,
                        'Branch': location,
                        'Branch Name': location,
                        'Branch_Name': location,
                        Name: custName,
                        NAME: custName,
                        'Name': custName,
                        'Name of Applicant': custName,
                        'Name of the Applicant': custName,
                        CUSTOMER_NAME: custName,
                        'NAME OF CUSTOMER': custName,
                        'Customer Name': custName,
                        'Applicant Name': custName,
                        'Applicant_Name': custName,
                        'Owner Name': custName,
                        'Owner_Name': custName,
                        'Owner': custName,
                        'Party Name': custName,

                        // Dynamic fees from pricing config
                        ...dynamicFeeCols,

                        // Standard fallbacks
                        LSR: lsrFee,
                        LSR_FEE: lsrFee,
                        'LSR FEE': lsrFee,
                        'Lsr Fee': lsrFee,
                        Opinion_Fees: lsrFee,
                        'Opinion Fees': lsrFee,
                        'Opinion Fee': lsrFee,
                        Opinion_Fee: lsrFee,
                        'Opinion Charges': lsrFee,
                        Opinion_Charges: lsrFee,
                        APF: apfFee,
                        APF_FEE: apfFee,
                        'APF FEE': apfFee,
                        'Apf Fee': apfFee,
                        VETTING: vettingFee,
                        VETTING_FEE: vettingFee,
                        'VETTING FEE': vettingFee,
                        'Vetting Fee': vettingFee,
                        Vetting_Fees: vettingFee,
                        'Vetting Fees': vettingFee,
                        'Vetting _FEES': vettingFee,
                        'Vetting _Fees': vettingFee,
                        'Vetting _Fee': vettingFee,
                        'Vetting_FEES': vettingFee,
                        Vetting_Fee: vettingFee,
                        'Vetting': vettingFee,
                        'Vetting Charges': vettingFee,
                        Vetting_Charges: vettingFee,
                        MODT: modtFee,
                        MODT_FEE: modtFee,
                        'MODT FEE': modtFee,
                        MODT_Fees: modtFee,
                        'MODT Fees': modtFee,
                        MODT_Fee: modtFee,
                        'Modt Fee': modtFee,
                        'MODT & Sale': modtFee,
                        'MODT & SALE': modtFee,
                        SRO_EC: sroEcFee,
                        'SRO EC': sroEcFee,
                        'SRO_EC_Fees': sroEcFee,
                        'SRO EC Fees': sroEcFee,
                        'SRO EC Charges': sroEcFee,
                        Cheque_Hand_Over_Fees: chequeFee,
                        'Cheque Hand Over_Fees': chequeFee,
                        'Cheque Hand Over Fees': chequeFee,
                        'Cheque Hand Over Fee': chequeFee,
                        TOTAL: amt,
                        TOTAL_FEE: amt,
                        'TOTAL FEE': amt
                    };
                });

                // Helper to extract exact pricing and counts per category from categoryTotals
                function getCatInfo(...keys) {
                    for (const k of keys) {
                        const search = k.toLowerCase().trim();
                        const found = Object.entries(categoryTotals).find(([catName]) => {
                            const cn = catName.toLowerCase().trim();
                            return cn.includes(search) || search.includes(cn);
                        });
                        if (found) {
                            const [name, data] = found;
                            const uPrice = data.count > 0 ? Math.round(data.amount / data.count) : 0;
                            return {
                                count: data.count,
                                unitPrice: uPrice,
                                formattedFees: uPrice > 0 ? `${uPrice.toLocaleString('en-IN')}/-` : 'Nil',
                                total: data.amount,
                                formattedTotal: data.amount > 0 ? `${data.amount.toLocaleString('en-IN')}/-` : '--'
                            };
                        }
                    }
                    return { count: 0, unitPrice: 0, formattedFees: 'Nil', total: 0, formattedTotal: '--' };
                }

                const opinionInfo = getCatInfo('legal opinion', 'opinion', 'tsr');
                const vettingInfo = getCatInfo('vetting report', 'vetting');
                const sroEcInfo = getCatInfo('sro ec', 'ec', 'sro');
                const apfInfo = getCatInfo('apf');
                const modtInfo = getCatInfo('modt', 'sale', 'draft');

                // Build branchGroups for Branch-wise looping templates
                const branchMap = new Map();
                const branchOrder = [];

                for (const op of enrichedOpinions) {
                    const rawBranch = String(op['Branch'] || op['Branch Name'] || op['LOCATION'] || 'MAIN').trim();
                    const cleanBranchKey = rawBranch.toUpperCase();

                    if (!branchMap.has(cleanBranchKey)) {
                        branchMap.set(cleanBranchKey, { rawName: rawBranch, items: [] });
                        branchOrder.push(cleanBranchKey);
                    }
                    branchMap.get(cleanBranchKey).items.push(op);
                }

                const branchGroups = branchOrder.map((branchKey, bIdx) => {
                    const bData = branchMap.get(branchKey);
                    const rawBranchName = bData.rawName;
                    const bOpinions = bData.items;

                    // Re-index S.No starting from 1 for each branch
                    const indexedOpinions = bOpinions.map((op, i) => ({
                        ...op,
                        sno: i + 1,
                        'S.No': i + 1,
                        'S. No': i + 1,
                        'S.NO': i + 1,
                        'Serial No': i + 1,
                    }));

                    // Branch totals
                    const branchGrandTotal = indexedOpinions.reduce((sum, op) => sum + (Number(op.Amount) || 0), 0);

                    // Branch category totals
                    const branchCatTotals = {};
                    indexedOpinions.forEach(op => {
                        if (op.serviceBreakdown && Object.keys(op.serviceBreakdown).length > 0) {
                            for (const [sKey, sPrice] of Object.entries(op.serviceBreakdown)) {
                                if (!branchCatTotals[sKey]) branchCatTotals[sKey] = { count: 0, amount: 0 };
                                branchCatTotals[sKey].count++;
                                branchCatTotals[sKey].amount += sPrice;
                            }
                        } else {
                            const catRaw = String(op['Application Type'] || op['Opinion_Category'] || 'opinion').toLowerCase().trim();
                            if (!branchCatTotals[catRaw]) branchCatTotals[catRaw] = { count: 0, amount: 0 };
                            branchCatTotals[catRaw].count++;
                            branchCatTotals[catRaw].amount += (Number(op.Amount) || 0);
                        }
                    });

                    function getBranchCatInfo(...keys) {
                        for (const k of keys) {
                            const search = k.toLowerCase().trim();
                            const found = Object.entries(branchCatTotals).find(([catName]) => {
                                const cn = catName.toLowerCase().trim();
                                return cn.includes(search) || search.includes(cn);
                            });
                            if (found) {
                                const [name, data] = found;
                                return {
                                    count: data.count,
                                    total: data.amount,
                                    formattedTotal: data.amount > 0 ? `${data.amount.toLocaleString('en-IN')}/-` : '--'
                                };
                            }
                        }
                        return { count: 0, total: 0, formattedTotal: '--' };
                    }

                    const bOpinionInfo = getBranchCatInfo('legal opinion', 'opinion', 'tsr');
                    const bVettingInfo = getBranchCatInfo('vetting report', 'vetting');
                    const bSroEcInfo = getBranchCatInfo('sro ec', 'ec', 'sro');
                    const bApfInfo = getBranchCatInfo('apf');
                    const bModtInfo = getBranchCatInfo('modt', 'sale', 'draft');

                    const branchObj = {
                        sno: bIdx + 1,
                        'S.No': bIdx + 1,
                        'S. No': bIdx + 1,
                        'S.NO': bIdx + 1,

                        'Branch Name': rawBranchName,
                        'Branch_Name': rawBranchName,
                        'BRANCH_NAME': `${rawBranchName.toUpperCase()} BRANCH`,
                        'Branch': rawBranchName,
                        'LOCATION': rawBranchName,
                        'Location': rawBranchName,
                        'Office Branch': rawBranchName,

                        opinions: indexedOpinions,
                        branches: indexedOpinions,
                        items: indexedOpinions,

                        GRAND_TOTAL: `${branchGrandTotal.toLocaleString('en-IN')}/-`,
                        GRAND_TOTAL_RAW: branchGrandTotal,
                        GRAND_TOTAL_IN_WORDS: toWords.convert(branchGrandTotal),
                        TOTAL_CASES: indexedOpinions.length,

                        // Branch Counts
                        Opinion_COUNT: bOpinionInfo.count > 0 ? bOpinionInfo.count : 'Nil',
                        OPINION_COUNT: bOpinionInfo.count > 0 ? bOpinionInfo.count : 'Nil',
                        'Opinion COUNT': bOpinionInfo.count > 0 ? bOpinionInfo.count : 'Nil',
                        TSR_COUNT: bOpinionInfo.count || 0,
                        VETTING_COUNT: bVettingInfo.count > 0 ? bVettingInfo.count : 'Nil',
                        Vetting_COUNT: bVettingInfo.count > 0 ? bVettingInfo.count : 'Nil',
                        'Vetting COUNT': bVettingInfo.count > 0 ? bVettingInfo.count : 'Nil',
                        APF_COUNT: bApfInfo.count > 0 ? bApfInfo.count : 'Nil',
                        MODT_COUNT: bModtInfo.count > 0 ? bModtInfo.count : 'Nil',
                        SRO_EC_COUNT: bSroEcInfo.count > 0 ? bSroEcInfo.count : 'Nil',

                        // Fees (inherited from bank level unit pricing)
                        Opinion_FEES: opinionInfo.formattedFees,
                        OPINION_FEES: opinionInfo.formattedFees,
                        Vetting_FEES: vettingInfo.formattedFees,
                        VETTING_FEES: vettingInfo.formattedFees,
                        VETTING_UNIT_PRICE: vettingInfo.formattedFees,
                        SRO_EC_FEES: sroEcInfo.formattedFees,
                    };

                    // Add dynamic category variables for this branch
                    Object.entries(branchCatTotals).forEach(([catName, catData]) => {
                        const key = catName.toUpperCase().replace(/[\s_\-.]+/g, '_');
                        const formattedTotal = `${catData.amount.toLocaleString('en-IN')}/-`;
                        branchObj[`${key}_COUNT`] = catData.count;
                        branchObj[`${key}_TOTAL`] = formattedTotal;
                        branchObj[`${key}_AMOUNT`] = formattedTotal;
                    });

                    return branchObj;
                });

                // Prepare Template Data
                const today = new Date();
                const branchNameStr = enrichedOpinions[0]?.LOCATION ? `${enrichedOpinions[0].LOCATION.toUpperCase()} BRANCH` : 'MADURAI BRANCH';

                const rawFirstBranch = enrichedOpinions[0]?.LOCATION || 'MADURAI';
                const templateData = {
                    BANK_NAME: bank.name,
                    BRANCH_NAME: branchNameStr,
                    'Branch Name': rawFirstBranch,
                    'Branch_Name': rawFirstBranch,
                    'Branch': rawFirstBranch,
                    'Office Branch': rawFirstBranch,
                    BILL_DATE: today.toLocaleDateString('en-GB'), // DD/MM/YYYY format commonly used in India
                    // Aliases
                    'Invoice Date': today.toLocaleDateString('en-GB'),
                    'Date': today.toLocaleDateString('en-GB'),

                    INVOICE_NUMBER: `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${bank.name.substring(0, 3).toUpperCase()}`,
                    BILL_MONTH_YEAR: today.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase(),

                    // Counters for Summary Table
                    FRESH_CASE_COUNT: opinionInfo.count > 0 ? opinionInfo.count : (freshCaseCount > 0 ? freshCaseCount : 'Nil'),
                    TSR_COUNT: opinionInfo.count || freshCaseCount,
                    Opinion_COUNT: opinionInfo.count || freshCaseCount,
                    OPINION_COUNT: opinionInfo.count || freshCaseCount,
                    'Opinion COUNT': opinionInfo.count || freshCaseCount,
                    APF_COUNT: apfInfo.count > 0 ? apfInfo.count : 'Nil',
                    VETTING_COUNT: vettingInfo.count > 0 ? vettingInfo.count : (vettingCount > 0 ? vettingCount : 'Nil'),
                    Vetting_COUNT: vettingInfo.count > 0 ? vettingInfo.count : (vettingCount > 0 ? vettingCount : 'Nil'),
                    'Vetting COUNT': vettingInfo.count > 0 ? vettingInfo.count : (vettingCount > 0 ? vettingCount : 'Nil'),
                    MODT_COUNT: modtInfo.count > 0 ? modtInfo.count : 'Nil',
                    SRO_EC_COUNT: sroEcInfo.count > 0 ? sroEcInfo.count : 'Nil',
                    'SRO EC_COUNT': sroEcInfo.count > 0 ? sroEcInfo.count : 'Nil',
                    'SRO EC COUNT': sroEcInfo.count > 0 ? sroEcInfo.count : 'Nil',
                    EC_COUNT: sroEcInfo.count > 0 ? sroEcInfo.count : 'Nil',
                    TOTAL_CASES: enrichedOpinions.length,

                    // Unit Prices
                    TSR_FEES: opinionInfo.formattedFees,
                    TSR_UNIT_PRICE: opinionInfo.formattedFees,
                    Opinion_FEES: opinionInfo.formattedFees,
                    OPINION_FEES: opinionInfo.formattedFees,
                    'Opinion FEES': opinionInfo.formattedFees,
                    VETTING_FEES: vettingInfo.formattedFees,
                    Vetting_FEES: vettingInfo.formattedFees,
                    'Vetting FEES': vettingInfo.formattedFees,
                    VETTING_UNIT_PRICE: vettingInfo.formattedFees,
                    SRO_EC_FEES: sroEcInfo.formattedFees,
                    'SRO EC_FEES': sroEcInfo.formattedFees,
                    'SRO EC FEES': sroEcInfo.formattedFees,
                    SRO_EC_UNIT_PRICE: sroEcInfo.formattedFees,

                    // Category Totals
                    TOTAL_LSR: opinionInfo.formattedTotal,
                    TSR_TOTAL: opinionInfo.formattedTotal,
                    Opinion_TOTAL: opinionInfo.formattedTotal,
                    OPINION_TOTAL: opinionInfo.formattedTotal,
                    'Opinion TOTAL': opinionInfo.formattedTotal,
                    TOTAL_APF: apfInfo.formattedTotal,
                    APF_TOTAL: apfInfo.formattedTotal,
                    TOTAL_VETTING: vettingInfo.formattedTotal,
                    VETTING_TOTAL: vettingInfo.formattedTotal,
                    Vetting_TOTAL: vettingInfo.formattedTotal,
                    'Vetting TOTAL': vettingInfo.formattedTotal,
                    TOTAL_MODT: modtInfo.formattedTotal,
                    MODT_TOTAL: modtInfo.formattedTotal,
                    TOTAL_SRO_EC: sroEcInfo.formattedTotal,
                    SRO_EC_TOTAL: sroEcInfo.formattedTotal,
                    'SRO EC_TOTAL': sroEcInfo.formattedTotal,
                    'SRO EC TOTAL': sroEcInfo.formattedTotal,

                    opinions: enrichedOpinions,
                    branches: (bank.bill_split === 'branch' ? branchGroups : [{
                        'Branch Name': rawFirstBranch,
                        'Branch_Name': rawFirstBranch,
                        'BRANCH_NAME': `${rawFirstBranch.toUpperCase()} BRANCH`,
                        'Branch': rawFirstBranch,
                        opinions: enrichedOpinions,
                        branches: enrichedOpinions,
                        GRAND_TOTAL: `${grandTotal.toLocaleString('en-IN')}/-`,
                        GRAND_TOTAL_RAW: grandTotal,
                        GRAND_TOTAL_IN_WORDS: toWords.convert(grandTotal),
                        TOTAL_CASES: enrichedOpinions.length
                    }]),
                    Branch_Groups: branchGroups,
                    branch_groups: branchGroups,
                    branch_list: branchGroups,
                    branches_list: branchGroups,
                    categories: productGroups,
                    productGroups: productGroups,
                    ProductGroups: productGroups,
                    products: productGroups,

                    GRAND_TOTAL: `${grandTotal.toLocaleString('en-IN')}/-`,
                    GRAND_TOTAL_RAW: grandTotal,
                    GRAND_TOTAL_IN_WORDS: toWords.convert(grandTotal),
                    'Total no. of TSR': enrichedOpinions.reduce((sum, op) => sum + (op.TSR_Count || 0), 0)
                };

                // Dynamically populate category summary variables in templateData
                Object.entries(categoryTotals).forEach(([catName, catData]) => {
                    const key = catName.toUpperCase().replace(/[\s_\-.]+/g, '_');
                    const unitPrice = catData.count > 0 ? Math.round(catData.amount / catData.count) : 0;
                    const formattedUnitPrice = unitPrice > 0 ? `${unitPrice.toLocaleString('en-IN')}/-` : 'Nil';
                    const formattedTotal = `${catData.amount.toLocaleString('en-IN')}/-`;

                    templateData[`${key}_COUNT`] = catData.count;
                    templateData[`${key}_UNIT_PRICE`] = unitPrice;
                    templateData[`${key}_FEES`] = formattedUnitPrice;
                    templateData[`${key}_FEE`] = formattedUnitPrice;
                    templateData[`${key}_TOTAL`] = formattedTotal;
                    templateData[`${key}_AMOUNT`] = formattedTotal;
                });

                // Debug: Write data to file
                try {
                    fs.writeFileSync(path.join(__dirname, '../uploads/debug_data.json'), JSON.stringify(templateData, null, 2));
                } catch (err) {
                    console.error("Failed to write debug data", err);
                }

                // Generate DOCX
                let content;
                if (bank.template_path && bank.template_path.startsWith('DATA:')) {
                    const parts = bank.template_path.slice(5).split(':');
                    const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
                    content = Buffer.from(base64Str, 'base64');
                } else {
                    content = fs.readFileSync(path.join(__dirname, '../uploads', bank.template_path), 'binary');
                }
                const zip = new PizZip(content);

                // Auto-sanitize Word floating table positioning properties to prevent overlapping in loops
                if (zip.files['word/document.xml']) {
                    let docXml = zip.files['word/document.xml'].asText();
                    if (docXml.includes('tblpPr')) {
                        docXml = docXml.replace(/<w:tblpPr[^>]*\/>/g, '');
                        zip.file('word/document.xml', docXml);
                    }
                }

                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    // Custom Parser to handle keys with spaces like {S. No} or {Name of Applicant}
                    parser: function (tag) {
                        return {
                            get: function (scope, context) {
                                if (tag === '.') return scope; // Handle {.}

                                // Debug log for specific tags causing issues
                                if (tag.includes('Applicant') || tag.includes('Login') || tag.includes('S. No') || tag.includes('Branch') || tag.includes('VETTING') || tag.includes('Vetting')) {
                                    try {
                                        const debugInfo = `Tag: ${tag}\nScope Keys: ${scope ? Object.keys(scope).join(', ') : 'null'}\n----------------\n`;
                                        fs.appendFileSync(path.join(__dirname, '../uploads/debug_scope.txt'), debugInfo);
                                    } catch (e) { /* ignore */ }
                                }

                                // Try direct match first (exact key with spaces)
                                if (scope && scope[tag] !== undefined) {
                                    return scope[tag];
                                }
                                // Try trimmed match
                                const trimmed = tag.trim();
                                if (scope && scope[trimmed] !== undefined) {
                                    return scope[trimmed];
                                }

                                // Enhanced Fuzzy Match: Try matching case-insensitive, whitespace, underscore, and symbol insensitive
                                if (scope) {
                                    const normalize = s => s.toLowerCase().replace(/[\s_\-.]+/g, '');
                                    const target = normalize(tag);
                                    const foundKey = Object.keys(scope).find(k => normalize(k) === target);
                                    if (foundKey) return scope[foundKey];
                                }

                                return undefined;
                            }
                        };
                    },
                    // Hide "undefined" text in output
                    nullGetter: function (part) {
                        return "";
                    }
                });

                doc.render(templateData);

                const buf = doc.getZip().generate({ type: 'nodebuffer' });
                const timestamp = Date.now();
                const safeBankName = bank.name.replace(/\s+/g, '_');

                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const todayObj = new Date();
                const yearStr = todayObj.getFullYear();
                const monthStr = monthNames[todayObj.getMonth()];
                const monthFolder = `${yearStr}-${monthStr}`;

                const targetBankDir = path.join(__dirname, '../generated_bills', safeBankName, monthFolder);
                if (!fs.existsSync(targetBankDir)) {
                    fs.mkdirSync(targetBankDir, { recursive: true });
                }

                const filenameDocx = `Bill_${safeBankName}_${timestamp}.docx`;
                const filenamePdf = `Bill_${safeBankName}_${timestamp}.pdf`;
                
                const outputPathDocx = path.join(targetBankDir, filenameDocx);
                const outputPathPdf = path.join(targetBankDir, filenamePdf);

                fs.writeFileSync(outputPathDocx, buf);

                // Convert DOCX to PDF and add Digital Signature Stamp
                let pdfCreated = false;
                try {
                    await convertDocxToPdf(outputPathDocx, outputPathPdf);
                    await addDigitalSignature(outputPathPdf, 'BABU');
                    pdfCreated = fs.existsSync(outputPathPdf);
                } catch (pdfErr) {
                    console.error("PDF generation or digital signing failed:", pdfErr);
                    processingErrors.push(`PDF Notice for ${bank.name}: ${pdfErr.message || 'PDF conversion skipped'}`);
                }

                const relDocxPath = `${safeBankName}/${monthFolder}/${filenameDocx}`;
                const relPdfPath = `${safeBankName}/${monthFolder}/${filenamePdf}`;

                generatedFiles.push({
                    bank: bank.name,
                    filename: filenameDocx,
                    docxUrl: `/api/download/${relDocxPath}`,
                    pdfFilename: pdfCreated ? filenamePdf : null,
                    pdfUrl: pdfCreated ? `/api/download/${relPdfPath}` : null,
                    path: outputPathDocx
                });

                // Log to DB
                await supabase.from('bills').insert([{
                    bank_id: bank.id,
                    filename: filenameDocx
                }]);

            } catch (e) {
                console.error(e);
                let msg = e.message;
                if (e.properties && e.properties.errors) {
                    msg = e.properties.errors.map(err => {
                        const tag = err.properties ? err.properties.id : '';
                        const text = err.properties ? err.properties.explanation : err.message;
                        return `Tag Error (${tag}): ${text}`;
                    }).join('; ');
                }
                let currentBankName = bankGroup.rawName || bankKey;
                try {
                    if (typeof bank !== 'undefined' && bank && bank.name) {
                        currentBankName = bank.name;
                    }
                } catch (_) {}
                processingErrors.push(`Error processing bank "${currentBankName}": ${msg}`);
            }
        }

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        let skippedSummaryFile = null;
        if (skippedRecords.length > 0) {
            try {
                const skippedDir = path.join(__dirname, '../generated_bills/Skipped_Summary');
                if (!fs.existsSync(skippedDir)) {
                    fs.mkdirSync(skippedDir, { recursive: true });
                }
                const timestamp = Date.now();
                const skippedFilename = `Skipped_Banks_Summary_${timestamp}.csv`;
                const skippedFilePath = path.join(skippedDir, skippedFilename);

                const csvHeader = 'Row Number,Bank Name,Client Name,Application ID / LAN,Reason\n';
                const csvRows = skippedRecords.map(r => {
                    const cleanField = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
                    return `${r.Row},${cleanField(r.Bank_Name)},${cleanField(r.Client_Name)},${cleanField(r.Application_ID)},${cleanField(r.Reason)}`;
                }).join('\n');

                fs.writeFileSync(skippedFilePath, csvHeader + csvRows, 'utf8');

                skippedSummaryFile = {
                    filename: skippedFilename,
                    url: `/api/download/Skipped_Summary/${skippedFilename}`,
                    count: skippedRecords.length
                };
            } catch (csvErr) {
                console.error("Failed to generate skipped banks summary CSV:", csvErr);
            }
        }

        res.json({
            success: true,
            generatedFiles: generatedFiles, // Return list of files
            skippedSummary: skippedSummaryFile, // Downloadable skipped banks CSV summary
            errors: [...errors, ...processingErrors]
        });
    }
});

module.exports = router;
