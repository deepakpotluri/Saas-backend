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

// New schema for valuation metrics data
const valuationMetricsSchema = new mongoose.Schema({}, { strict: false });
const ValuationMetrics = mongoose.model('valuationmetrics', valuationMetricsSchema, 'valuation_metrics');

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
      
      // Fetch financial data from financial data collection
      const financialDataArray = await FinancialData.find({
        ticker: { $in: tickers }
      }).lean();
      
      // Fetch valuation metrics data 
      const valuationMetricsArray = await ValuationMetrics.find({
        ticker: { $in: tickers }
      }).lean();
      
      console.log(`Found ${financialDataArray.length} financial records and ${valuationMetricsArray.length} valuation records`);
      
      // Create maps for easier lookup
      const financialDataMap = {};
      financialDataArray.forEach(data => {
        if (data.ticker) {
          financialDataMap[data.ticker] = data;
        }
      });
      
      const valuationMetricsMap = {};
      valuationMetricsArray.forEach(data => {
        if (data.ticker) {
          valuationMetricsMap[data.ticker] = data;
        }
      });
      
      // Enrich companies with financial data and growth metrics
      companies = companies.map(company => {
        const financialData = financialDataMap[company.ticker] || {};
        const valuationMetrics = valuationMetricsMap[company.ticker] || {};
        
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
        
        // Extract raw values directly from valuation metrics if available
        const current_revenue = valuationMetrics.raw_values?.current_revenue;
        const current_grossProfit = valuationMetrics.raw_values?.current_grossProfit;
        const current_netIncome = valuationMetrics.raw_values?.current_netIncome;
        
        // Use pre-calculated metrics if available
        if (valuationMetrics && (valuationMetrics.growth_metrics || valuationMetrics.raw_values)) {
          const marketCap = valuationMetrics.market_cap;
          
          // Use raw values from valuation metrics or fallback to income statement
          const revenue = current_revenue || (latestIncomeStatement?.revenue);
          const grossProfit = current_grossProfit || (latestIncomeStatement?.grossProfit);
          const netIncome = current_netIncome || (latestIncomeStatement?.netIncome);
          
          return {
            ...company,
            financials: {
              marketCap,
              revenue,
              grossProfit,
              netIncome,
              revenueGrowth: valuationMetrics.growth_metrics?.revenue_growth_pct?.toFixed(1),
              grossProfitGrowth: valuationMetrics.growth_metrics?.gross_profit_growth_pct?.toFixed(1),
              netIncomeGrowth: valuationMetrics.growth_metrics?.net_income_growth_pct?.toFixed(1),
              year: valuationMetrics.latest_fiscal_year || (latestIncomeStatement?.calendarYear),
              marketCapToRevenueMultiple: valuationMetrics.valuation_multiples_raw?.marketcap_to_revenue?.toFixed(2) || null,
              marketCapToNetIncomeMultiple: valuationMetrics.valuation_multiples_raw?.marketcap_to_netincome?.toFixed(2) || null,
              marketCapToGrossProfitMultiple: valuationMetrics.valuation_multiples_raw?.marketcap_to_grossprofit?.toFixed(2) || null,
              // Include raw values for direct access
              raw_values: valuationMetrics.raw_values,
              current_revenue,
              current_grossProfit,
              current_netIncome
            }
          };
        } 
        // Fallback to original data if pre-calculated metrics not available
        else if (latestIncomeStatement && latestMarketCap) {
          const marketCap = latestMarketCap.marketCap;
          const netIncome = latestIncomeStatement.netIncome;
          const grossProfit = latestIncomeStatement.grossProfit;
          const revenue = latestIncomeStatement.revenue;
          
          // Calculate multiples
          const marketCapToNetIncomeMultiple = netIncome ? (marketCap / netIncome).toFixed(2) : null;
          const marketCapToGrossProfitMultiple = grossProfit ? (marketCap / grossProfit).toFixed(2) : null;
          const marketCapToRevenueMultiple = revenue ? (marketCap / revenue).toFixed(2) : null;
          
          return {
            ...company,
            financials: {
              marketCap,
              revenue,
              grossProfit,
              netIncome,
              marketCapToRevenueMultiple,
              marketCapToNetIncomeMultiple,
              marketCapToGrossProfitMultiple,
              year: latestIncomeStatement.calendarYear
            }
          };
        } else {
          // Return company without financials if no data available
          return company;
        }
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

// Schema for notifications about all countries data (original collection)
const notificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Fix: Update the collection name to match what's in MongoDB
const Notification = mongoose.model('notification', notificationSchema, 'notification_subscriptions');

// Define a new schema for metrics update notifications
const metricsNotificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create the model for the new collection
const MetricsNotification = mongoose.model(
  'metricsnotification', 
  metricsNotificationSchema, 
  'metrics_update_subscriptions'
);

// Updated route to handle both collections based on user preferences
app.post('/api/notifications/subscribe', async (req, res) => {
  try {
    const { email, phone, notifyAllCountries, notifyMetricsUpdates } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    await connectToDatabase();
    
    // Log connection state and database name for debugging
    console.log('MongoDB connection state:', mongoose.connection.readyState);
    console.log('Connected to database:', mongoose.connection.db.databaseName);
    
    // Prepare user data object for both collections
    const userData = {
      email: email,
      phone: phone || undefined
    };

    let results = {
      allCountries: false,
      metricsUpdates: false
    };
    
    // If user wants notifications for all countries data
    if (notifyAllCountries) {
      try {
        // Check if email already exists in notification_subscriptions
        const existingSubscription = await Notification.findOne({ email });
        
        if (existingSubscription) {
          // Update phone if it changed
          if (phone && existingSubscription.phone !== phone) {
            await Notification.updateOne({ email }, { phone });
          }
          results.allCountries = 'updated';
        } else {
          // Create new subscription
          const subscription = new Notification(userData);
          await subscription.save();
          results.allCountries = 'created';
        }
      } catch (error) {
        console.error('Error saving to notification_subscriptions:', error);
        throw error;
      }
    }
    
    // If user wants notifications for metrics updates
    if (notifyMetricsUpdates) {
      try {
        // Check if email already exists in metrics_update_subscriptions
        const existingMetricsSubscription = await MetricsNotification.findOne({ email });
        
        if (existingMetricsSubscription) {
          // Update phone if it changed
          if (phone && existingMetricsSubscription.phone !== phone) {
            await MetricsNotification.updateOne({ email }, { phone });
          }
          results.metricsUpdates = 'updated';
        } else {
          // Create new subscription
          const metricsSubscription = new MetricsNotification(userData);
          await metricsSubscription.save();
          results.metricsUpdates = 'created';
        }
      } catch (error) {
        console.error('Error saving to metrics_update_subscriptions:', error);
        throw error;
      }
    }
    
    console.log(`Subscription results for ${email}:`, results);
    return res.status(201).json({ 
      message: 'Successfully subscribed',
      results 
    });
    
  } catch (error) {
    console.error('Error in subscription endpoint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// New route to get financial data for a specific company by ticker
app.get('/api/financials/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    console.log(`Fetching financial data for ticker: ${ticker}`);
    
    await connectToDatabase();
    
    // First, try to get precomputed growth metrics from valuation_metrics collection
    const valuationMetrics = await ValuationMetrics.findOne({ ticker }).lean();
    
    // Then, get regular financial data
    const financialData = await FinancialData.findOne({ ticker }).lean();
    
    if (!financialData) {
      return res.status(404).json({ message: 'Financial data not found' });
    }
    
    // Combine data, prioritizing valuation metrics for growth data
    let combinedData = { ...financialData };
    
    // Add growth metrics to the financialData response if available
    if (valuationMetrics) {
      // Extract the essential data directly
      combinedData.growth_metrics = valuationMetrics.growth_metrics;
      combinedData.raw_values = valuationMetrics.raw_values;
      combinedData.market_cap = valuationMetrics.market_cap;
      combinedData.valuation_multiples = valuationMetrics.valuation_multiples;
      combinedData.valuation_multiples_raw = valuationMetrics.valuation_multiples_raw;
      combinedData.latest_fiscal_year = valuationMetrics.latest_fiscal_year;
      
      // Also map these values directly to the top level for ease of access
      combinedData.current_revenue = valuationMetrics.raw_values?.current_revenue;
      combinedData.current_grossProfit = valuationMetrics.raw_values?.current_grossProfit;
      combinedData.current_netIncome = valuationMetrics.raw_values?.current_netIncome;
    }
    
    return res.json(combinedData);
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