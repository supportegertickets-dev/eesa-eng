const mongoose = require('mongoose');

/**
 * Connect to MongoDB with explicit pool and timeout settings.
 *
 * The defaults are tuned for a long-running server; on a free-tier host that
 * sleeps, an unbounded serverSelectionTimeout makes the first request after a
 * cold start hang until the client gives up rather than failing quickly.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  // Surface schema mistakes instead of silently dropping unknown fields.
  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(uri, {
      // Fail a query in 10s rather than queueing it forever behind a dead primary.
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Atlas shared tiers cap connections; 10 is ample for this workload and
      // leaves headroom for a second instance during a rolling deploy.
      maxPoolSize: 10,
      minPoolSize: 1,
      family: 4
    });

    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    process.exit(1);
  }

  // A dropped connection after startup must not go unnoticed; the health check
  // reads the same readyState these events reflect.
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected.'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected.'));
};

module.exports = connectDB;
