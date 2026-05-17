// backend/services/sessionStore.js
// Production-ready session store with:
// - TTL expiration
// - Automatic cleanup
// - Memory protection
// - LRU eviction
// - Secure session IDs
// - Safe JSON size handling
// - Error-free session control

const crypto = require('crypto');

class SessionStore {
  constructor(options = {}) {
    this.store = new Map();

    // Config
    this.ttl = options.ttl || 60 * 60 * 1000; // 1 hour
    this.cleanupInterval = options.cleanupInterval || 10 * 60 * 1000; // 10 min
    this.maxSessions = options.maxSessions || 1000;
    this.maxDataSize = options.maxDataSize || 10 * 1024 * 1024; // 10MB

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // Prevent timer from blocking process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    console.log(
      `[SessionStore] Started | TTL=${this.ttl / 60000}min | MaxSessions=${this.maxSessions}`
    );
  }

  // =========================
  // Generate secure session ID
  // =========================
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  // =========================
  // Estimate object size
  // =========================
  estimateDataSize(data) {
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch (err) {
      return 0;
    }
  }

  // =========================
  // Trim large payloads
  // =========================
  trimData(data = {}) {
    const trimmed = { ...data };

    // Limit sample reviews
    if (
      Array.isArray(trimmed.sampleReviews) &&
      trimmed.sampleReviews.length > 20
    ) {
      trimmed.sampleReviews = trimmed.sampleReviews.slice(0, 20);
    }

    // Remove huge raw text arrays
    if (trimmed.reviewTexts) {
      delete trimmed.reviewTexts;
    }

    // Limit complaint categories
    if (
      Array.isArray(trimmed.complaintCategories) &&
      trimmed.complaintCategories.length > 10
    ) {
      trimmed.complaintCategories =
        trimmed.complaintCategories.slice(0, 10);
    }

    return trimmed;
  }

  // =========================
  // LRU eviction
  // =========================
  evictLRU() {
    let oldestSessionId = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.store.entries()) {
      const accessTime = new Date(session.lastAccessed).getTime();

      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestSessionId = id;
      }
    }

    if (oldestSessionId) {
      this.store.delete(oldestSessionId);

      console.log(
        `[SessionStore] LRU evicted: ${oldestSessionId}`
      );
    }
  }

  // =========================
  // Create / Update session
  // Supports:
  // set(data)
  // set(data, customId)
  // =========================
  set(data = {}, customId = null) {
    try {
      // Evict if memory full
      if (this.store.size >= this.maxSessions) {
        this.evictLRU();
      }

      // Trim oversized data
      let safeData = data;

      const originalSize = this.estimateDataSize(data);

      if (originalSize > this.maxDataSize) {
        console.warn(
          `[SessionStore] Data exceeded limit (${originalSize} bytes). Trimming...`
        );

        safeData = this.trimData(data);
      }

      const sessionId = customId || this.generateSessionId();

      const now = new Date();

      const session = {
        id: sessionId,
        data: safeData,
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + this.ttl
        ).toISOString(),
        lastAccessed: now.toISOString(),
        size: this.estimateDataSize(safeData)
      };

      this.store.set(sessionId, session);

      return session;
    } catch (error) {
      console.error('[SessionStore] SET error:', error);
      return null;
    }
  }

  // =========================
  // Get session
  // =========================
  get(sessionId) {
    try {
      const session = this.store.get(sessionId);

      if (!session) {
        return null;
      }

      // Expired?
      const expired =
        Date.now() > new Date(session.expiresAt).getTime();

      if (expired) {
        this.store.delete(sessionId);

        console.log(
          `[SessionStore] Expired session removed: ${sessionId}`
        );

        return null;
      }

      // Update access time
      session.lastAccessed = new Date().toISOString();

      this.store.set(sessionId, session);

      return session;
    } catch (error) {
      console.error('[SessionStore] GET error:', error);
      return null;
    }
  }

  // =========================
  // Get session (alias for get)
  // =========================
  getSession(sessionId) {
    return this.get(sessionId);
  }

  // =========================
  // Check if session exists
  // =========================
  has(sessionId) {
    return this.store.has(sessionId);
  }

  // =========================
  // Get only session data
  // =========================
  getData(sessionId) {
    const session = this.get(sessionId);

    return session ? session.data : null;
  }

  // =========================
  // Delete session
  // =========================
  delete(sessionId) {
    try {
      return this.store.delete(sessionId);
    } catch (error) {
      console.error('[SessionStore] DELETE error:', error);
      return false;
    }
  }

  // =========================
  // Cleanup expired sessions
  // =========================
  cleanup() {
    try {
      const now = Date.now();

      let deletedCount = 0;

      for (const [id, session] of this.store.entries()) {
        const expired =
          now > new Date(session.expiresAt).getTime();

        if (expired) {
          this.store.delete(id);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(
          `[SessionStore] Cleanup removed ${deletedCount} expired sessions`
        );
      }
    } catch (error) {
      console.error('[SessionStore] CLEANUP error:', error);
    }
  }

  // =========================
  // Get all sessions
  // =========================
  getAll() {
    try {
      const sessions = [];

      for (const [id, session] of this.store.entries()) {
        sessions.push({
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          filename: session.data?.filename || null,
          totalReviews:
            session.data?.metrics?.total_reviews || 0,
          sizeKB: Math.round((session.size || 0) / 1024)
        });
      }

      return sessions;
    } catch (error) {
      console.error('[SessionStore] GET_ALL error:', error);
      return [];
    }
  }

  // =========================
  // Store statistics
  // =========================
  getStats() {
    try {
      let totalSize = 0;

      for (const session of this.store.values()) {
        totalSize += session.size || 0;
      }

      return {
        activeSessions: this.store.size,
        maxSessions: this.maxSessions,
        totalMemoryMB: Number(
          (totalSize / (1024 * 1024)).toFixed(2)
        ),
        ttlMinutes: this.ttl / 60000,
        cleanupIntervalMinutes:
          this.cleanupInterval / 60000
      };
    } catch (error) {
      console.error('[SessionStore] STATS error:', error);

      return {
        activeSessions: 0,
        maxSessions: this.maxSessions,
        totalMemoryMB: 0
      };
    }
  }

  // =========================
  // Destroy cleanup timer
  // =========================
  stopCleanup() {
    try {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;

        console.log(
          '[SessionStore] Cleanup timer stopped'
        );
      }
    } catch (error) {
      console.error('[SessionStore] STOP error:', error);
    }
  }
}

// Export singleton
module.exports = new SessionStore();