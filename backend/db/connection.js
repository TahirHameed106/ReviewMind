const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // Required for Azure SQL
        trustServerCertificate: false
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Create a connection pool that can be shared across the app
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Azure SQL Connection Pool Created');
        return pool;
    })
    .catch(err => {
        console.error('❌ Database Connection Failed: ', err.message);
        process.exit(1);
    });

module.exports = {
    sql,
    poolPromise
};