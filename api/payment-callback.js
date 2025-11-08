// File: /api/payment-callback.js

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method Not Allowed' 
        });
    }

    try {
        // --- NEW: Log the raw request headers to debug ---
        console.log('Callback Headers:', JSON.stringify(req.headers, null, 2));
        
        // --- NEW: Fallback body parsing ---
        let body = req.body;
        
        // If the built-in parser failed, req.body will be undefined or empty.
        // We can try to parse it manually from the raw stream.
        if (!body || Object.keys(body).length === 0) {
            console.warn('Built-in body parser failed or returned empty. Attempting manual parse.');
            // This is a safeguard. In most cases, removing the bodyParser: false config is the real fix.
            // For Next.js, this situation is rare, but we handle it just in case.
            // Note: A true manual parse would require bodyParser: false and reading from the stream,
            // which is more complex. This check is mostly to confirm the diagnosis.
            return res.status(400).send('Bad Request: Body could not be parsed. Check API configuration.');
        }

        console.log('Payment callback received. Parsed body:', JSON.stringify(body, null, 2));
        
        // Use the correct parameter names from ToyyibPay
        const { 
            billcode, 
            payment_status,      
            billExternalReferenceNo, // This is your original Order ID
            transaction_id, 
            billamount           
        } = body;

        if (!billExternalReferenceNo) {
            console.error('Callback received without billExternalReferenceNo. Ignoring.');
            return res.status(400).send('Bad Request: Missing Order ID');
        }
        
        // Periksa status pembayaran
        if (payment_status === '1') {
            console.log(`Payment successful for bill code: ${billcode}, Order ID: ${billExternalReferenceNo}`);
            
            const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpO0maKCB0x1WosPV1fkCP80MJx7ShA26OS4QwCf0xVsN7x5dtdWD6F7Bk8w2nMVfo/exec';
            let orderData = null;

            // --- STEP 1: Get current order details from Google Sheets ---
            try {
                const formData = new URLSearchParams();
                formData.append('action', 'getOrder');
                formData.append('orderId', billExternalReferenceNo);
                
                const googleResponse = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });
                
                const result = await googleResponse.json();
                if (result.status === 'success' && result.order) {
                    orderData = result.order;
                    console.log(`Retrieved order data for ${billExternalReferenceNo}. Current status: ${orderData.status}`);
                } else {
                    console.error(`Failed to get order data for ${billExternalReferenceNo}:`, result.message);
                    return res.status(200).send('OK'); // Still respond OK to ToyyibPay
                }
            } catch (error) {
                console.error('Error fetching order from Google Sheets:', error);
                return res.status(200).send('OK'); // Still respond OK
            }

            // --- STEP 2: If order is not already 'Paid', proceed with updates ---
            if (orderData && orderData.status !== 'Paid') {
                console.log(`Order ${billExternalReferenceNo} is not yet 'Paid'. Proceeding with update...`);

                // --- STEP 2a: Update Google Sheets (this will also send the email) ---
                try {
                    const formData = new URLSearchParams();
                    formData.append('action', 'updatePayment'); // Use the action from your script
                    formData.append('orderId', billExternalReferenceNo);
                    
                    const googleResponse = await fetch(GOOGLE_SCRIPT_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    });
                    
                    const updateResult = await googleResponse.json();
                    if (updateResult.status === 'success') {
                        console.log(`✅ Successfully updated order ${billExternalReferenceNo} to 'Paid' in Google Sheets.`);
                    } else {
                        console.error(`❌ Failed to update order ${billExternalReferenceNo}:`, updateResult.message);
                    }
                } catch (error) {
                    console.error('❌ Error updating Google Sheets:', error);
                }

                // --- STEP 2b: Send Facebook Conversions API Event ---
                if (orderData) {
                    try {
                        const pixelId = '2276519576162204';
                        const accessToken = 'EAAcJZCFldLZAYBP2Rt17ob7AJUEAPnCZCdiIOHZBereJjCRiofT1SottrBAL8EjPME1L6LANNoRN5I0yootHZCYioBgN2SUZBHPbUU93iRd54xOSeM7RbiHHIqemm6zM5p6GLIZAHNOezCVLROwIER8spOyZB3iC4wYTB1qZBADgHpWlZCpcZC0VA3Hi26sRJ85fwZDZD';
                        
                        const eventResponse = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                data: [{
                                    event_name: 'Purchase',
                                    event_time: Math.floor(Date.now() / 1000),
                                    action_source: 'website',
                                    event_source_url: 'https://prostreamfb.vercel.app/payment-successful.html',
                                    event_id: `purchase_callback_${billExternalReferenceNo}_${Date.now()}`,
                                    user_data: {
                                        em: Buffer.from(orderData.email).toString('base64'),
                                        ph: Buffer.from(orderData.phone).toString('base64'),
                                        fn: Buffer.from(orderData.name.split(' ')[0]).toString('base64'),
                                        ln: Buffer.from(orderData.name.split(' ').slice(1).join(' ')).toString('base64'),
                                    },
                                    custom_data: {
                                        currency: 'MYR',
                                        value: (parseFloat(orderData.amount) * 100).toString(), // Convert to cents
                                        content_name: orderData.package,
                                        content_category: 'Streaming',
                                        content_ids: [billExternalReferenceNo],
                                        content_type: 'product'
                                    }
                                }],
                            })
                        });
                        
                        const eventResult = await eventResponse.json();
                        console.log('Facebook Purchase Event Response (from callback):', eventResult);
                    } catch (error) {
                        console.error('Error sending Purchase event from callback:', error);
                    }
                }

                // --- STEP 2c: Send Discord Notification ---
                if (orderData) {
                    console.log('📧 Sending Discord notification...');
                    await sendDiscordNotification(orderData);
                }

            } else {
                console.log(`⚠️ Order ${billExternalReferenceNo} is already marked as 'Paid'. No action taken.`);
            }

            // IMPORTANT: Always respond with 200 OK to ToyyibPay.
            return res.status(200).send('OK'); 
        } else {
            // Pembayaran gagal atau pending
            console.log(`Payment not successful for bill code: ${billcode}. Status: ${payment_status}`);
            return res.status(200).send('OK'); // Still respond with OK
        }
    } catch (error) {
        console.error('Error processing payment callback:', error);
        return res.status(500).send('Internal Server Error');
    }
}


// --- Helper function for Discord notification (copied from your HTML for consistency) ---
async function sendDiscordNotification(orderData) {
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1426639056716038247/fByGT9VoydmqwdJNV0W9knEQxatRfJpTVJr2UrgtUTIwxRNY9LpeFmzlkplI9OZWIDue';
    try {
        const embed = {
            title: "✅ PEMBAYARAN BERJAYA - PROSTREAM-FB",
            description: "Pelanggan telah berjaya membuat pembayaran!",
            color: 0x43b581,
            fields: [
                { name: "📋 Status Pembayaran", value: "Berjaya", inline: true },
                { name: "👤 Nama", value: orderData.name, inline: true },
                { name: "📱 No Telefon", value: orderData.phone, inline: true },
                { name: "📧 Email", value: orderData.email, inline: false },
                { name: "📦 Produk", value: orderData.package, inline: true },
                { name: "💰 Jumlah", value: `RM ${orderData.amount}`, inline: true },
                { name: "🕐 Tarikh & Masa", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            ],
            footer: { text: "PROSTREAM - Streaming Apps Package", icon_url: "https://cdn-icons-png.flaticon.com/512/2991/2991148.png" },
            timestamp: new Date().toISOString()
        };

        const payload = {
            username: "PROSTREAM Bot",
            avatar_url: "https://cdn-icons-png.flaticon.com/512/2991/2991148.png",
            embeds: [embed]
        };

        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Discord notification sent successfully');
        } else {
            const errorText = await response.text();
            console.error('❌ Failed to send Discord notification:', errorText);
        }
    } catch (error) {
        console.error('❌ Error sending Discord notification:', error);
    }
}
