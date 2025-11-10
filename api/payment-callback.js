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
        console.log('Payment callback received. Raw body:', JSON.stringify(req.body, null, 2));
        
        // CORRECTED: Use the proper parameter names from ToyyibPay documentation
        const { 
            billcode, 
            status_id,                // CORRECT: The payment status (1=success, 2=pending, 3=fail)
            order_id,                
            amount,                  
            transaction_id,          // CORRECT: The transaction ID
            msg                       // CORRECT: The message (e.g., "ok")
        } = req.body;

        if (!order_id) {
            console.error('Callback received without order_id. Ignoring.');
            return res.status(400).send('Bad Request: Missing Order ID');
        }
        
        // CORRECTED: Check for the SUCCESS status code from the documentation
        if (status_id === '1') {
            console.log(`✅ Payment successful for bill code: ${billcode}, Order ID: ${order_id}`);
            
            const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpO0maKCB0x1WosPV1fkCP80MJx7ShA26OS4QwCf0xVsN7x5dtdWD6F7Bk8w2nMVfo/exec';
            let orderData = null;

            // --- STEP 1: Get current order details from Google Sheets to avoid duplicate updates ---
            try {
                const formData = new URLSearchParams();
                formData.append('action', 'getOrder');
                formData.append('orderId', order_id);
                
                const googleResponse = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });
                
                const result = await googleResponse.json();
                if (result.status === 'success' && result.order) {
                    orderData = result.order;
                    console.log(`Retrieved order data for ${order_id}. Current status: ${orderData.status}`);
                } else {
                    console.error(`Failed to get order data for ${order_id}:`, result.message);
                    return res.status(200).send('OK'); // Still respond OK to ToyyibPay
                }
            } catch (error) {
                console.error('Error fetching order from Google Sheets:', error);
                return res.status(200).send('OK'); // Still respond OK
            }

            // --- STEP 2: If order is not already 'Paid', proceed with updates ---
            if (orderData && orderData.status !== 'Paid') {
                console.log(`Order ${order_id} is not yet 'Paid'. Proceeding with update...`);

                // --- STEP 2a: Update Google Sheets (this will also send the email) ---
                try {
                    const formData = new URLSearchParams();
                    formData.append('action', 'updatePayment'); 
                    formData.append('orderId', order_id);
                    
                    const googleResponse = await fetch(GOOGLE_SCRIPT_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    });
                    
                    const updateResult = await googleResponse.json();
                    if (updateResult.status === 'success') {
                        console.log(`✅ Successfully updated order ${order_id} to 'Paid' in Google Sheets.`);
                    } else {
                        console.error(`❌ Failed to update order ${order_id}:`, updateResult.message);
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
                                    event_id: `purchase_callback_${order_id}_${Date.now()}`,
                                    user_data: {
                                        em: Buffer.from(orderData.email || '').toString('base64'),
                                        ph: Buffer.from(orderData.phone || '').toString('base64'),
                                        fn: Buffer.from((orderData.name || '').split(' ')[0]).toString('base64'),
                                        ln: Buffer.from((orderData.name || '').split(' ').slice(1).join(' ')).toString('base64'),
                                    },
                                    custom_data: {
                                        currency: 'MYR',
                                        value: (parseFloat(orderData.amount || 0) * 100).toString(),
                                        content_name: orderData.package || 'PROSTREAM Package',
                                        content_category: 'Streaming',
                                        content_ids: [order_id],
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
                console.log(`⚠️ Order ${order_id} is already marked as 'Paid'. No action taken.`);
            }

            // IMPORTANT: Always respond with 200 OK to ToyyibPay to acknowledge receipt.
            return res.status(200).send('OK'); 
        } else {
            // Pembayaran gagal atau pending
            // CORRECTED: Using status_id for accurate logging
            console.log(`❌ Payment not successful for bill code: ${billcode}. Status ID: ${status_id}. Message: ${msg}`);
            
            // Log different statuses for better debugging
            if (status_id === '2') {
                console.log('Payment is pending. Will not update Google Sheets.');
            } else if (status_id === '3') {
                console.log('Payment failed. Will not update Google Sheets.');
            } else {
                console.log(`Unknown payment status: ${status_id}. Will not update Google Sheets.`);
            }
            
            return res.status(200).send('OK'); // Still respond with OK
        }
    } catch (error) {
        console.error('Error processing payment callback:', error);
        return res.status(500).send('Internal Server Error');
    }
}

// --- Helper function for Discord notification ---
async function sendDiscordNotification(orderData) {
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1426639056716038247/fByGT9VoydmqwdJNV0W9knEQxatRfJpTVJr2UrgtUTIwxRNY9LpeFmzlkplI9OZWIDue';
    try {
        const embed = {
            title: "✅ PEMBAYARAN BERJAYA - PROSTREAM-FB",
            description: "Pelanggan telah berjaya membuat pembayaran!",
            color: 0x43b581,
            fields: [
                { name: "📋 Status Pembayaran", value: "Berjaya", inline: true },
                { name: "👤 Nama", value: orderData.name || 'N/A', inline: true },
                { name: "📱 No Telefon", value: orderData.phone || 'N/A', inline: true },
                { name: "📧 Email", value: orderData.email || 'N/A', inline: false },
                { name: "📦 Produk", value: orderData.package || 'N/A', inline: true },
                { name: "💰 Jumlah", value: `RM ${orderData.amount || 'N/A'}`, inline: true },
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
