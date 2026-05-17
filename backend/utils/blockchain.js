// backend/utils/blockchain.js
// Fixed: Proper SHA-256 hashing with deep freeze for immutability

const crypto = require('crypto');

class BlockchainLedger {
  constructor() {
    this.chain = [];
    this.pendingReviews = [];
  }

  // Deep freeze utility to prevent mutation after insertion
  deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
      if (obj[prop] !== null &&
        (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') &&
        !Object.isFrozen(obj[prop])) {
        this.deepFreeze(obj[prop]);
      }
    });
    return obj;
  }

  // Calculate hash of a block WITHOUT including the hash field itself
  calculateBlockHash(block) {
    const clone = { ...block };
    delete clone.hash;
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(clone))
      .digest('hex');
  }

  // Generate SHA-256 hash of any data
  generateDataHash(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  // Add review/analysis to blockchain with proper hash and immutability
  addReview(reviewData) {
    const timestamp = new Date().toISOString();
    
    const dataHash = this.generateDataHash(reviewData);
    const previousHash = this.chain.length > 0 
      ? this.chain[this.chain.length - 1].hash 
      : '0'.repeat(64);
    
    const block = {
      index: this.chain.length + 1,
      timestamp,
      data: {
        reviewHash: dataHash,
        summary: {
          totalReviews: reviewData.metrics?.total_reviews,
          avgRating: reviewData.metrics?.avg_rating,
          sentimentScore: reviewData.metrics?.sentiment_score,
          analyzedAt: reviewData.analyzedAt || timestamp
        }
      },
      previousHash,
      hash: null
    };
    
    block.hash = this.calculateBlockHash(block);
    
    // Deep freeze to prevent mutation
    const frozenBlock = this.deepFreeze(block);
    this.chain.push(frozenBlock);
    
    return {
      success: true,
      blockId: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      timestamp: block.timestamp,
      dataHash: dataHash,
      chainLength: this.chain.length,
      chainValid: this.validateChain(),
      status: 'VERIFIED_ON_CHAIN'
    };
  }

  verifyReview(reviewData, expectedHash) {
    const calculatedHash = this.generateDataHash(reviewData);
    return calculatedHash === expectedHash;
  }

  getReviewStatus(blockId) {
    const block = this.chain.find(b => b.index === parseInt(blockId));
    if (!block) {
      return { found: false, error: 'Block not found' };
    }
    
    return {
      found: true,
      blockId: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      timestamp: block.timestamp,
      dataHash: block.data.reviewHash,
      verified: this.verifyBlockIntegrity(block)
    };
  }

  verifyBlockIntegrity(block) {
    const calculatedHash = this.calculateBlockHash(block);
    return calculatedHash === block.hash;
  }

  validateChain() {
    if (this.chain.length > 0) {
      const genesisBlock = this.chain[0];
      if (genesisBlock.previousHash !== '0'.repeat(64)) {
        console.error('Invalid genesis block previous hash');
        return false;
      }
      if (!this.verifyBlockIntegrity(genesisBlock)) {
        console.error('Genesis block hash mismatch');
        return false;
      }
    }
    
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];
      
      if (!this.verifyBlockIntegrity(currentBlock)) {
        console.error(`Block ${i} hash mismatch`);
        return false;
      }
      
      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error(`Block ${i} previous hash mismatch`);
        return false;
      }
    }
    return true;
  }

  getChainStats() {
    return {
      totalBlocks: this.chain.length,
      chainValid: this.validateChain(),
      lastBlock: this.chain.length > 0 ? {
        index: this.chain[this.chain.length - 1].index,
        hash: this.chain[this.chain.length - 1].hash,
        timestamp: this.chain[this.chain.length - 1].timestamp
      } : null,
      genesisBlock: this.chain.length > 0 ? {
        index: this.chain[0].index,
        hash: this.chain[0].hash,
        timestamp: this.chain[0].timestamp
      } : null
    };
  }

  getBlockByHash(hash) {
    return this.chain.find(b => b.hash === hash) || null;
  }

  getBlockByIndex(index) {
    return this.chain.find(b => b.index === index) || null;
  }
}

module.exports = new BlockchainLedger();