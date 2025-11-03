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
