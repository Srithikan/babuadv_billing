const supabase = require('./db_supabase');

async function checkPricing() {
    console.log("Checking Supabase Data...");

    // 1. Check Banks
    const { data: banks, error: bankError } = await supabase.from('banks').select('*');
    if (bankError) {
        console.error("Error fetching banks:", bankError);
    } else {
        console.log("Banks Found:", banks.length);
        banks.forEach(b => console.log(` - ID: ${b.id}, Name: ${b.name}`));
    }

    // 2. Check Pricing
    const { data: pricing, error: priceError } = await supabase.from('pricing').select('*');
    if (priceError) {
        console.error("Error fetching pricing:", priceError);
    } else {
        console.log("\nPricing Entries:", pricing.length);
        pricing.forEach(p => console.log(` - BankID: ${p.bank_id}, Category: '${p.category}', Price: ${p.price}`));
    }
}

checkPricing();
