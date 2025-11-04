// File: /api/conversionqr.js

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method Not Allowed' 
        });
    }

    try {
        const { 
            eventName, 
            eventId, 
            value, 
            currency, 
            customerData, 
            contentData 
        } = req.body;

        // Validate required fields
        if (!eventName || !eventId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: eventName, eventId' 
            });
        }

        // Facebook Conversions API endpoint
        const pixelId = '2276519576162204';
        const accessToken = 'EAAcJZCFldLZAYBP2Rt17ob7AJUEAPnCZCdiIOHZBereJjCRiofT1SottrBAL8EjPME1L6LANNoRN5I0yootHZCYioBgN2SUZBHPbUU93iRd54xOSeM7RbiHHIqemm6zM5p6GLIZAHNOezCVLROwIER8spOyZB3iC4wYTB1qZBADgHpWlZCpcZC0VA3Hi26sRJ85fwZDZD';
        
        // Prepare the event data
        const event = {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: 'https://prostreamfb.vercel.app/qr.html', // Updated source URL
            event_id: eventId,
            user_data: {
                client_user_agent: req.headers['user-agent'],
                client_ip_address: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                em: customerData?.email ? Buffer.from(customerData.email).toString('base64') : undefined,
                ph: customerData?.phone ? Buffer.from(customerData.phone).toString('base64') : undefined,
                fn: customerData?.firstName ? Buffer.from(customerData.firstName).toString('base64') : undefined,
                ln: customerData?.lastName ? Buffer.from(customerData.lastName).toString('base64') : undefined
            },
            custom_data: {
                currency: currency || 'MYR',
                value: value ? (value * 100).toString() : undefined, // Convert to cents
                content_name: contentData?.content_name,
                content_category: contentData?.content_category,
                content_ids: contentData?.content_ids,
                content_type: contentData?.content_type
            }
        };

        // Send the event to Facebook Conversions API
        const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: [event],
            })
        });

        const result = await response.json();
        console.log('Facebook Conversions API Response:', result);

        if (response.ok) {
            return res.status(200).json({ 
                success: true, 
                message: 'Conversion event sent successfully' 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to send conversion event.',
                details: result 
            });
        }
    } catch (error) {
        console.error('Error sending conversion event:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'An internal server error occurred.',
            details: error.message
        });
    }
}
