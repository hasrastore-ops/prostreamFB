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
        console.log('Payment callback received:', req.body);
        
        // Proses data panggilan balik dari ToyyibPay
        const { billcode, status, order_id, transaction_id, amount } = req.body;
        
        // Periksa status pembayaran
        if (status === '1') {
            // Pembayaran berjaya
            console.log(`Payment successful for bill code: ${billcode}`);
            
            // Send Purchase event to Facebook Conversions API
            try {
                const pixelId = '2276519576162204';
                const accessToken = 'EAAcJZCFldLZAYBP2Rt17ob7AJUEAPnCZCdiIOHZBereJjCRiofT1SottrBAL8EjPME1L6LANNoRN5I0yootHZCYioBgN2SUZBHPbUU93iRd54xOSeM7RbiHHIqemm6zM5p6GLIZAHNOezCVLROwIER8spOyZB3iC4wYTB1qZBADgHpWlZCpcZC0VA3Hi26sRJ85fwZDZD';
                
                // Note: We don't have customer details in the callback, so we'll send a basic event
                const eventResponse = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        data: [{
                            event_name: 'Purchase',
                            event_time: Math.floor(Date.now() / 1000),
                            action_source: 'website',
                            event_source_url: 'https://prostreamfb.vercel.app/payment-successful.html',
                            event_id: `purchase_${billcode}_${Date.now()}`,
                            custom_data: {
                                currency: 'MYR',
                                value: amount ? (parseFloat(amount) * 100).toString() : undefined, // Convert to cents
                                content_name: 'PROSTREAM 4 App Power Package',
                                content_category: 'Streaming',
                                content_ids: ['prostream_4app_package'],
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
            
            // Di sini anda boleh:
            // 1. Kemas kini status pesanan dalam pangkalan data
            // 2. Hantar e-mel pengesahan
            // 3. Cetuskan peristiwa lain
            
            // Contoh: Simpan maklumat pembayaran ke pangkalan data
            // await savePaymentData({
            //     billcode,
            //     order_id,
            //     transaction_id,
            //     amount,
            //     status: 'paid',
            //     timestamp: new Date().toISOString()
            // });
            
            return res.status(200).json({ 
                success: true, 
                message: 'Payment processed successfully' 
            });
        } else {
            // Pembayaran gagal
            console.log(`Payment failed for bill code: ${billcode}`);
            
            return res.status(200).json({ 
                success: false, 
                message: 'Payment failed' 
            });
        }
    } catch (error) {
        console.error('Error processing payment callback:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'An error occurred while processing the payment callback' 
        });
    }
}
