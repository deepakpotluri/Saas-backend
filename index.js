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

// Create Schema and Models for collections
const saasCompanySchema = new mongoose.Schema({}, { strict: false });
const SaasCompany = mongoose.model('saascompany', saasCompanySchema, 'saascompnies');

// New schema for financial data
const financialDataSchema = new mongoose.Schema({}, { strict: false });
const FinancialData = mongoose.model('financialdata', financialDataSchema, 'incomeusa');

// Express server setup
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control']
}));
app.use(express.json());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ message: 'Server error', error: err.message });
});

// Route to get all countries from regions data
app.get('/api/countries', async (req, res) => {
  try {
    console.log('Connecting to database for /api/countries');
    await connectToDatabase();
    
    console.log('Fetching data from SaasCompany collection');
    const data = await SaasCompany.findOne({}).lean();
    
    if (!data) {
      console.log('No data found in collection');
      return res.status(404).json([]);
    }
    
    if (!data.regions || !Array.isArray(data.regions)) {
      console.log('No regions found or regions is not an array:', data.regions);
      return res.status(404).json([]);
    }
    
    console.log(`Found ${data.regions.length} regions`);
    
    // Extract country names from regions
    const countryNames = data.regions.map(region => {
      if (!region || !region.name) {
        return 'Unknown';
      }
      
      // Extract the country name from the region name
      const regionName = region.name;
      
      // Extract just the country part before any parentheses
      const countryMatch = regionName.match(/^([^(]+)/);
      return countryMatch ? countryMatch[1].trim() : regionName.trim();
    }).filter(Boolean); // Remove empty strings or null values
    
    // Filter out any duplicates and sort alphabetically
    const uniqueCountries = [...new Set(countryNames)].sort();
    
    console.log(`Returning ${uniqueCountries.length} unique countries`);
    res.setHeader('Content-Type', 'application/json');
    return res.json(uniqueCountries);
  } catch (error) {
    console.error('Error in /api/countries:', error);
    res.status(500).json([]);
  }
});

// Route to get data for a specific country
app.get('/api/country/:countryName', async (req, res) => {
  try {
    const countryName = req.params.countryName;
    console.log(`Fetching data for country: ${countryName}`);
    
    await connectToDatabase();
    
    const data = await SaasCompany.findOne({}).lean();
    
    if (!data || !data.regions) {
      return res.status(404).json({ message: 'No data found' });
    }
    
    // Find the region that matches the country name (partial match at the start)
    const matchingRegion = data.regions.find(region => 
      region && region.name && region.name.startsWith(countryName)
    );
    
    if (!matchingRegion) {
      return res.status(404).json({ message: 'Country not found' });
    }
    
    return res.json(matchingRegion);
  } catch (error) {
    console.error(`Error fetching data for country:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to get categories for USA
app.get('/api/categories/usa', async (req, res) => {
  try {
    console.log('Fetching categories for USA');
    
    await connectToDatabase();
    
    const data = await SaasCompany.findOne({}).lean();
    
    if (!data || !data.regions) {
      return res.status(404).json({ message: 'No data found' });
    }
    
    // Find the USA region
    const usaRegion = data.regions.find(region => 
      region && region.name && region.name.startsWith('United States')
    );
    
    if (!usaRegion || !usaRegion.categories || !Array.isArray(usaRegion.categories)) {
      return res.status(404).json({ message: 'USA categories not found' });
    }
    
    // Extract category names
    const categories = usaRegion.categories.map(category => category.name || 'Unknown').filter(Boolean);
    
    return res.json(categories);
  } catch (error) {
    console.error(`Error fetching USA categories:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to get companies by country and optional category
app.get('/api/companies/:countryName', async (req, res) => {
  try {
    const countryName = req.params.countryName;
    const category = req.query.category; // Optional category parameter
    
    console.log(`Fetching companies for country: ${countryName}, category: ${category || 'All'}`);
    
    await connectToDatabase();
    
    const data = await SaasCompany.findOne({}).lean();
    
    if (!data || !data.regions) {
      return res.status(404).json({ message: 'No data found' });
    }
    
    // Find the region that matches the country name
    const matchingRegion = data.regions.find(region => 
      region && region.name && region.name.startsWith(countryName)
    );
    
    if (!matchingRegion) {
      return res.status(404).json({ message: 'Country not found' });
    }
    
    let companies = [];
    
    // For USA with category filter
    if (countryName.startsWith('United States') && category && category !== 'All') {
      // Find the specific category
      const matchingCategory = matchingRegion.categories.find(cat => cat.name === category);
      if (matchingCategory && matchingCategory.companies) {
        companies = matchingCategory.companies;
      }
    } 
    // For USA with "All" category
    else if (countryName.startsWith('United States')) {
      // Combine companies from all categories
      companies = matchingRegion.categories.reduce((allCompanies, category) => {
        if (category.companies && Array.isArray(category.companies)) {
          return [...allCompanies, ...category.companies];
        }
        return allCompanies;
      }, []);
    } 
    // For non-USA countries
    else if (matchingRegion.companies) {
      companies = matchingRegion.companies;
    }
    
    // If it's a US company, fetch financial data for each company
    if (countryName.startsWith('United States')) {
      // Get all tickers
      const tickers = companies.map(company => company.ticker);
      
      // Fetch financial data for all tickers
      const financialDataArray = await FinancialData.find({
        ticker: { $in: tickers }
      }).lean();
      
      // Create a map of ticker to financial data
      const financialDataMap = {};
      financialDataArray.forEach(data => {
        if (data.ticker) {
          financialDataMap[data.ticker] = data;
        }
      });
      
      // Enrich companies with financial data
      companies = companies.map(company => {
        const financialData = financialDataMap[company.ticker] || {};
        
        // Get the latest income statement if available
        let latestIncomeStatement = null;
        if (financialData.income_statement && financialData.income_statement.length > 0) {
          latestIncomeStatement = financialData.income_statement.sort((a, b) => 
            new Date(b.date) - new Date(a.date)
          )[0];
        }
        
        // Get the latest market cap
        let latestMarketCap = null;
        if (financialData.market_cap && financialData.market_cap.length > 0) {
          latestMarketCap = financialData.market_cap.sort((a, b) => 
            new Date(b.date) - new Date(a.date)
          )[0];
        }
        
        // Extract key financials
        let financials = null;
        if (latestIncomeStatement && latestMarketCap) {
          const marketCap = latestMarketCap.marketCap;
          const netIncome = latestIncomeStatement.netIncome;
          const grossProfit = latestIncomeStatement.grossProfit;
          
          // Calculate multiples
          const marketCapToNetIncomeMultiple = netIncome ? (marketCap / netIncome).toFixed(2) : null;
          const marketCapToGrossProfitMultiple = grossProfit ? (marketCap / grossProfit).toFixed(2) : null;
          
          financials = {
            marketCap,
            netIncome,
            grossProfit,
            marketCapToNetIncomeMultiple,
            marketCapToGrossProfitMultiple,
            year: latestIncomeStatement.calendarYear
          };
        }
        
        return {
          ...company,
          financials
        };
      });
    }
    
    const exchangeName = matchingRegion.exchangeName || 'Unknown Exchange';
    
    return res.json({
      exchangeName,
      companies
    });
  } catch (error) {
    console.error(`Error fetching companies:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

// New route to get financial data for a specific company by ticker
app.get('/api/financials/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    console.log(`Fetching financial data for ticker: ${ticker}`);
    
    await connectToDatabase();
    
    const financialData = await FinancialData.findOne({ ticker }).lean();
    
    if (!financialData) {
      return res.status(404).json({ message: 'Financial data not found' });
    }
    
    return res.json(financialData);
  } catch (error) {
    console.error(`Error fetching financial data:`, error);
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