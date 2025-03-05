const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// For debugging
console.log('Starting server...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MongoDB URI exists:', !!process.env.MONGODB_URI);

let cachedDb = null;

// Database connection function with connection pooling for serverless
async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  try {
    console.log('Connecting to MongoDB...');
    // Set connection options to handle serverless environment
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    };

    const client = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log('MongoDB connected successfully');
    cachedDb = client;
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Create Schema and Model
const saasCompanySchema = new mongoose.Schema({}, { strict: false });
const SaasCompany = mongoose.models.saascompny || 
  mongoose.model('saascompny', saasCompanySchema, 'saascompnies');

console.log('Schema and model created');

// Express server setup
const app = express();

// Middleware
app.use(cors({
  origin: '*', // Allow all origins in production temporarily
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Root route for basic verification
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Backend API is running',
    environment: process.env.NODE_ENV,
    mongoDbConnected: mongoose.connection.readyState === 1
  });
});

// Routes
app.get('/api/companies', async (req, res) => {
  try {
    console.log('Fetching companies...');
    await connectToDatabase();
    
    const data = await SaasCompany.findOne();
    console.log('Companies data found:', !!data);
    
    if (!data) {
      return res.status(404).json({ message: 'No companies found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching companies data:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
});

// Route to get all regions
app.get('/api/regions', async (req, res) => {
  try {
    console.log('Fetching regions...');
    await connectToDatabase();
    
    const data = await SaasCompany.findOne();
    console.log('Regions data found:', !!data);
    console.log('Regions exist:', data && !!data.regions);
    
    if (!data || !data.regions) {
      return res.status(404).json({ message: 'No regions found' });
    }
    
    res.json(data.regions);
  } catch (error) {
    console.error('Error fetching regions data:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
});

// Route to get companies by region name
app.get('/api/companies/region/:name', async (req, res) => {
  try {
    const regionName = req.params.name;
    console.log(`Fetching companies for region: ${regionName}`);
    
    await connectToDatabase();
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
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
});

// Route for USA companies
app.get('/api/companies/usa', async (req, res) => {
  try {
    console.log('Fetching USA companies...');
    await connectToDatabase();
    
    const data = await SaasCompany.findOne();
    
    if (!data) {
      return res.status(404).json({ message: 'No data found' });
    }
    
    // Find USA companies based on your data structure
    const usaRegion = data.regions.find(region => 
      region.name.toLowerCase().includes('usa') || 
      region.name.toLowerCase().includes('united states'));
    
    if (!usaRegion) {
      return res.status(404).json({ message: 'USA region not found' });
    }
    
    res.json(usaRegion);
  } catch (error) {
    console.error('Error fetching USA companies:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    message: 'Server error', 
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export for Vercel
module.exports = app;