const { poolPromise, sql } = require('../db/connection');

const VALID_PLANS = ['basic', 'business', 'enterprise'];
const planCache = new Map();
let subscriptionColumnSupported;

const normalizePlan = (plan) => {
  if (typeof plan !== 'string') {
    return 'basic';
  }

  const normalized = plan.trim().toLowerCase();
  return VALID_PLANS.includes(normalized) ? normalized : 'basic';
};

const hasSubscriptionColumn = async () => {
  if (typeof subscriptionColumnSupported === 'boolean') {
    return subscriptionColumnSupported;
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 1 AS columnExists
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'subscription_tier'
    `);

    subscriptionColumnSupported = result.recordset.length > 0;
  } catch (error) {
    subscriptionColumnSupported = false;
  }

  return subscriptionColumnSupported;
};

const getUserPlan = async (email) => {
  const safeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!safeEmail) {
    return 'basic';
  }

  if (await hasSubscriptionColumn()) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('email', sql.NVarChar, safeEmail)
      .query('SELECT COALESCE(subscription_tier, \'basic\') AS subscription_tier FROM users WHERE email = @email');

    return normalizePlan(result.recordset[0]?.subscription_tier);
  }

  return normalizePlan(planCache.get(safeEmail));
};

const setUserPlan = async (email, plan) => {
  const safeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedPlan = normalizePlan(plan);

  if (!safeEmail) {
    throw new Error('Email is required');
  }

  if (await hasSubscriptionColumn()) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('email', sql.NVarChar, safeEmail)
      .input('plan', sql.NVarChar, normalizedPlan)
      .query('UPDATE users SET subscription_tier = @plan WHERE email = @email');

    if (result.rowsAffected[0] === 0) {
      throw new Error('User not found');
    }
  } else {
    planCache.set(safeEmail, normalizedPlan);
  }

  return normalizedPlan;
};

module.exports = {
  VALID_PLANS,
  getUserPlan,
  normalizePlan,
  setUserPlan
};