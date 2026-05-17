// backend/db/connection.js
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 120000,
        requestTimeout: 120000,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool = null;
let isConnecting = false;
let connPromise = null;

async function getPool() {
    if (pool && pool.connected) {
        try {
            await pool.request().query('SELECT 1');
            return pool;
        } catch {
            pool = null;
        }
    }
    if (isConnecting && connPromise) return connPromise;

    isConnecting = true;
    connPromise = (async () => {
        try {
            console.log('[DB] Connecting to Azure SQL...');
            pool = await sql.connect(config);
            console.log('[DB] ✅ Connected');
            return pool;
        } catch (e) {
            console.error('[DB] Connection failed:', e.message);
            return null;
        } finally {
            isConnecting = false;
        }
    })();
    return connPromise;
}

async function query(text, params = {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const p = await getPool();
            if (!p) throw new Error('No database connection available');
            const req = p.request();
            Object.entries(params).forEach(([k, v]) => req.input(k, v));
            return await req.query(text);
        } catch (e) {
            console.error(`[DB] Query attempt ${attempt} failed: ${e.message}`);
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 3000 * attempt));
                pool = null;
            } else throw e;
        }
    }
}

async function initDB() {
    try {
        const p = await getPool();
        if (!p) {
            console.log('[DB] Skipping init - no connection');
            return;
        }

        // Create users table
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE name='users' AND type='U')
            CREATE TABLE users (
                id                INT IDENTITY(1,1) PRIMARY KEY,
                email             VARCHAR(255) UNIQUE NOT NULL,
                password_hash     VARCHAR(255) NOT NULL,
                name              VARCHAR(255) NULL,
                mfa_enabled       BIT DEFAULT 0,
                mfa_secret        VARCHAR(255) NULL,
                subscription_plan VARCHAR(50) DEFAULT 'basic',
                last_login        DATETIME NULL,
                created_at        DATETIME DEFAULT GETDATE()
            )
        `);

        // Add name column using Azure SQL compatible syntax
        await p.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID('users') AND name = 'name'
            )
            BEGIN
                ALTER TABLE users ADD name VARCHAR(255) NULL
            END
        `);

        // Add last_login column using Azure SQL compatible syntax
        await p.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID('users') AND name = 'last_login'
            )
            BEGIN
                ALTER TABLE users ADD last_login DATETIME NULL
            END
        `);

        // Add subscription_plan column using Azure SQL compatible syntax
        await p.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID('users') AND name = 'subscription_plan'
            )
            BEGIN
                ALTER TABLE users ADD subscription_plan VARCHAR(50) DEFAULT 'basic'
            END
        `);

        // Create analysis_history table
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE name='analysis_history' AND type='U')
            CREATE TABLE analysis_history (
                id             INT IDENTITY(1,1) PRIMARY KEY,
                user_email     VARCHAR(255),
                session_id     VARCHAR(100),
                filename       VARCHAR(255),
                total_reviews  INT,
                positive_count INT,
                neutral_count  INT,
                negative_count INT,
                avg_rating     DECIMAL(3,2),
                risk_level     VARCHAR(20),
                analyzed_at    DATETIME DEFAULT GETDATE()
            )
        `);

        // Create chat_sessions table
        await p.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE name='chat_sessions' AND type='U')
            CREATE TABLE chat_sessions (
                id              INT IDENTITY(1,1) PRIMARY KEY,
                conversation_id VARCHAR(100) UNIQUE,
                user_email      VARCHAR(255),
                session_id      VARCHAR(100),
                created_at      DATETIME DEFAULT GETDATE(),
                last_active     DATETIME DEFAULT GETDATE()
            )
        `);

        console.log('[DB] ✅ Tables ready');
    } catch (e) {
        console.error('[DB] Table init error:', e.message);
    }
}

module.exports = { getPool, query, initDB, sql };