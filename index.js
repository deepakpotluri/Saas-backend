const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

let cachedDb = null;

// Database connection function with connection pooling for serverless
async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }
  
  try {
    // Set connection options to handle serverless environment
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    };
    
    const client = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log('MongoDB connected...');
    cachedDb = client;
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Create Schema and Model
const saasCompanySchema = new mongoose.Schema({}, { strict: false });
const SaasCompany = mongoose.model('saascompny', saasCompanySchema, 'saascompnies');

// Express server setup
const app = express();

// Middleware
app.use(cors({
  origin: '*', // Allow your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.get('/api/companies', async (req, res) => {
  try {
    await connectToDatabase();
    const data = await SaasCompany.findOne();
    
    if (!data) {
      return res.status(404).json({ message: 'No companies found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to get all regions
app.get('/api/regions', async (req, res) => {
  try {
    await connectToDatabase();
    const data = await SaasCompany.findOne();
    
    if (!data || !data.regions) {
      return res.status(404).json({ message: 'No regions found' });
    }
    
    res.json(data.regions);
  } catch (error) {
    console.error('Error fetching regions data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to get companies by region name
app.get('/api/companies/region/:name', async (req, res) => {
  try {
    await connectToDatabase();
    const regionName = req.params.name;
    const data = await SaasCompany.findOne();
    
    if (!data) {
      return res.status(404).json({ message: 'No data found' });
    }
    
    const region = data.regions.find(region => 
      region.name.toLowerCase().includes(regionName.toLowerCase()));
    
    if (!region) {
      return res.status(404).json({ message: 'Region not found' });
    }
    
    res.json(region);
  } catch (error) {
    console.error('Error fetching region data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a USA companies route to match your frontend function
app.get('/api/companies/usa', async (req, res) => {
  try {
    await connectToDatabase();
    const data = await SaasCompany.findOne();
    
    if (!data) {
      return res.status(404).json({ message: 'No data found' });
    }
    
    const usaRegion = data.regions.find(region => 
      region.name.toLowerCase().includes('usa') || 
      region.name.toLowerCase().includes('united states'));
    
    if (!usaRegion) {
      return res.status(404).json({ message: 'USA region not found' });
    }
    
    res.json(usaRegion);
  } catch (error) {
    console.error('Error fetching USA data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export for Vercel
module.exports = app;