require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');
const bodyParser = require('body-parser');

// MongoDB Schema and Models
const cryptoSchema = new mongoose.Schema({
    coin: String,
    price: Number,
    marketCap: Number,
    change24h: Number,
    timestamp: { type: Date, default: Date.now }
});

const Crypto = mongoose.model('Crypto', cryptoSchema);

// Constants
const COINS = ['bitcoin', 'matic-network', 'ethereum'];
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CRON_SCHEDULE = '0 */2 * * *';

// Connecting to MongoDB
mongoose.connect('mongodb+srv://ojalp07:Ojal2025@cluster0.scsfu.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Initializing Express
const app = express();
app.use(bodyParser.json());

// Background Job for fetching Crypto Data
cron.schedule(CRON_SCHEDULE, async () => {
    console.log('Fetching cryptocurrency data...');
    try {
        const response = await axios.get(COINGECKO_URL, {
            params: {
                ids: COINS.join(','),
                vs_currencies: 'usd',
                include_market_cap: true,
                include_24hr_change: true,
                x_cg_pro_api_key: process.env.COINGECKO_API_KEY // Add API key as a query parameter
            }
        });

        const data = response.data;
        const cryptoDocs = COINS.map(coin => {
            return {
                coin,
                price: data[coin].usd,
                marketCap: data[coin].usd_market_cap,
                change24h: data[coin].usd_24h_change
            };
        });

        await Crypto.insertMany(cryptoDocs);
        console.log('Data successfully stored in the database.');
    } catch (error) {
        console.error('Error fetching cryptocurrency data:', error);
    }
});

// API: /stats
app.get('/stats', async (req, res) => {
    const { coin } = req.query;
    if (!COINS.includes(coin)) {
        return res.status(400).json({ error: 'Invalid coin specified.' });
    }

    try {
        const latestData = await Crypto.findOne({ coin }).sort({ timestamp: -1 });
        if (!latestData) {
            return res.status(404).json({ error: 'No data available for the requested coin.' });
        }

        res.json({
            price: latestData.price,
            marketCap: latestData.marketCap,
            '24hChange': latestData.change24h
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// API: /deviation
app.get('/deviation', async (req, res) => {
    const { coin } = req.query;
    if (!COINS.includes(coin)) {
        return res.status(400).json({ error: 'Invalid coin specified.' });
    }

    try {
        const records = await Crypto.find({ coin }).sort({ timestamp: -1 }).limit(100);
        if (records.length === 0) {
            return res.status(404).json({ error: 'Not enough data to calculate deviation.' });
        }

        const prices = records.map(record => record.price);
        const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
        const deviation = Math.sqrt(variance);

        res.json({ deviation: deviation.toFixed(2) });
    } catch (error) {
        console.error('Error calculating deviation:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Starting the Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
