// File: /api/create-bill.js

/**
 * Serverless function to create ToyyibPay bills
 * This function handles the payment creation process securely on the server side
 */

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method Not Allowed' 
        });
    }

    try {
        // Get current time for debugging
        const now = new Date();
        console.log('=== Payment Request Started ===');
        console.log('Server Local Time:', now.toString());
        console.log('Server UTC Time:', now.toUTCString());
        console.log('Server ISO Time:', now.toISOString());
        console.log('Malaysia Time (GMT+8):', new Date(now.getTime() + 8 * 60 * 60 * 1000).toString());
        console.log('Request Body:', JSON.stringify(req.body, null, 2));

        // Get data from the frontend request
        const { name, email, phone, amount, billDescription } = req.body;

        // Validate required fields
        if (!name || !email || !phone || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: name, email, phone, amount' 
            });
        }

        // Your SECRET data is now safe on the server
        const userSecretKey = 'b2kcp05o-b5m0-q000-55i7-w3j57riufv7h';
        const categoryCode = '8f5ynfpt';
        const billName = 'PROSTREAM';
        const billPriceSetting = '1';
        const billPayorInfo = '1';
        const billAmount = `${amount * 100}`; // Convert to cents
        const billReturnUrl = 'https://prostream-rho.vercel.app/payment-successful.html';
        const billCallbackUrl = 'https://prostream-rho.vercel.app/api/payment-callback';
        
        // Create bill reference number with timestamp (using UTC time)
        const billExternalReferenceNo = `PS${now.getTime()}`;
        
        // Create expiry date in UTC to avoid timezone issues
        const expiryDate = new Date();
        expiryDate.setUTCDate(expiryDate.getUTCDate() + 3);
        const formattedExpiryDate = 
            `${expiryDate.getUTCDate().toString().padStart(2, '0')}-` +
            `${(expiryDate.getUTCMonth() + 1).toString().padStart(2, '0')}-` +
            `${expiryDate.getUTCFullYear()} ` +
            `${expiryDate.getUTCHours().toString().padStart(2, '0')}:` +
            `${expiryDate.getUTCMinutes().toString().padStart(2, '0')}:` +
            `${expiryDate.getUTCSeconds().toString().padStart(2, '0')}`;
        
        console.log('Expiry Date (UTC):', formattedExpiryDate);
        
        const billTo = name;
        const billEmail = email;
        const billPhone = phone;
        const billSplitPayment = '0';
        const billPaymentChannel = '0';
        const billChargeToCustomer = '1';

        // Create the form data for ToyyibPay
        const body = new FormData();
        body.append('userSecretKey', userSecretKey);
        body.append('categoryCode', categoryCode);
        body.append('billName', billName);
        body.append('billDescription', billDescription || `Pembelian PROSTREAM Package - RM${amount}`);
        body.append('billPriceSetting', billPriceSetting);
        body.append('billPayorInfo', billPayorInfo);
        body.append('billAmount', billAmount);
        body.append('billReturnUrl', billReturnUrl);
        body.append('billCallbackUrl', billCallbackUrl);
        body.append('billExternalReferenceNo', billExternalReferenceNo);
        body.append('billTo', billTo);
        body.append('billEmail', billEmail);
        body.append('billPhone', billPhone);
        body.append('billSplitPayment', billSplitPayment);
        body.append('billSplitPaymentArgs', '');
        body.append('billPaymentChannel', billPaymentChannel);
        body.append('billChargeToCustomer', billChargeToCustomer);
        body.append('billExpiryDate', formattedExpiryDate);

        // Log the data being sent (without the secret key)
        const logData = {};
        for (let [key, value] of body.entries()) {
            if (key !== 'userSecretKey') {
                logData[key] = value;
            } else {
                logData[key] = '***HIDDEN***';
            }
        }
        console.log('Data being sent to ToyyibPay:', JSON.stringify(logData, null, 2));

        // Make the API call to ToyyibPay from the server
        console.log('Making API call to ToyyibPay...');
        const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
            method: 'POST',
            body: body,
        });

        console.log('ToyyibPay Response Status:', response.status);
        console.log('ToyyibPay Response Headers:', Object.fromEntries(response.headers.entries()));

        const textResult = await response.text();
        console.log('ToyyibPay Raw Response:', textResult);

        let result;
        try {
            result = JSON.parse(textResult);
            console.log('Parsed ToyyibPay Response:', JSON.stringify(result, null, 2));
        } catch (e) {
            console.error("Failed to parse ToyyibPay response:", e);
            console.error("Raw response that failed to parse:", textResult);
            return res.status(500).json({ 
                success: false, 
                error: 'Invalid response from payment provider.',
                details: textResult
            });
        }

        // Check if the bill was created successfully
        if (result && result.length > 0 && result[0].BillCode) {
            const billCode = result[0].BillCode;
            const billUrl = `https://toyyibpay.com/${billCode}`;

            console.log('Bill created successfully!');
            console.log('Bill Code:', billCode);
            console.log('Bill URL:', billUrl);

            // Send the successful response back to the frontend
            return res.status(200).json({ 
                success: true, 
                billCode: billCode,
                billUrl: billUrl,
                billExternalReferenceNo: billExternalReferenceNo
            });
        } else {
            console.error("ToyyibPay API Error:", result);
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to create payment bill.',
                details: result
            });
        }
    } catch (error) {
        console.error('Server Error:', error);
        console.error('Error Stack:', error.stack);
        return res.status(500).json({ 
            success: false, 
            error: 'An internal server error occurred.',
            details: error.message
        });
    }
}
