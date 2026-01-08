import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testAuth() {
    const token = process.env.Meta_WA_accessToken;
    const phoneId = process.env.Meta_WA_SenderPhoneNumberId;

    console.log("Token length:", token ? token.length : "MISSING");
    console.log("Phone ID:", phoneId || "MISSING");

    if (!token || !phoneId) {
        console.error("Missing credentials in .env");
        return;
    }

    try {
        // Try to fetch Phone Number details
        const url = `https://graph.facebook.com/v18.0/${phoneId}`;
        console.log(`Testing GET ${url}...`);

        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("SUCCESS! Token is valid.");
        console.log("Details:", res.data);
    } catch (error) {
        console.error("FAILED.");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testAuth();
