const crypto = require('crypto');

/**
 * BLOCKCHAIN REVIEW INTEGRITY LEDGER
 * Stores hash of verified reviews for tamper detection
 * Uses JSON-based ledger (can be upgraded to Polygon/Ethereum)
 */

class BlockchainLedger {
  constructor() {
    this.chain = [];
    this.initializeGenesisBlock();
  }

  // Genesis Block - Foundation of the chain
  initializeGenesisBlock() {
    const genesisBlock = {
      id: '0',
      timestamp: new Date().toISOString(),
      reviewHash: 'GENESIS_BLOCK',
      previousHash: '0',
      data: { message: 'ReviewMind Integrity Ledger Initialized' },
      nonce: 0
    };
    genesisBlock.blockHash = this.createBlockHash(genesisBlock);
    this.chain.push(genesisBlock);
  }

  // Hash a review (SHA-256)
  hashReview(reviewData) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(reviewData))
      .digest('hex');
  }

  // Create hash for block
  createBlockHash(blockData) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(blockData))
      .digest('hex');
  }

  // Add verified review to chain
  addReview(reviewData) {
    try {
      const reviewHash = this.hashReview(reviewData);
      const previousBlock = this.chain[this.chain.length - 1];
      
      const newBlock = {
        id: this.chain.length.toString(),
        timestamp: new Date().toISOString(),
        reviewHash: reviewHash,
        previousHash: previousBlock.blockHash || this.createBlockHash(previousBlock),
        data: {
          review: reviewData,
          verified: true,
          verifiedAt: new Date().toISOString()
        },
        nonce: Math.floor(Math.random() * 1000000)
      };

      newBlock.blockHash = this.createBlockHash(newBlock);
      this.chain.push(newBlock);

      return {
        success: true,
        blockId: newBlock.id,
        hash: reviewHash,
        proof: newBlock.blockHash
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify review hasn't been tampered
  verifyReview(reviewData, storedHash) {
    const currentHash = this.hashReview(reviewData);
    return {
      isValid: currentHash === storedHash,
      currentHash: currentHash,
      storedHash: storedHash,
      status: currentHash === storedHash ? 'VERIFIED' : 'TAMPERED'
    };
  }

  // Validate entire chain integrity
  validateChain() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      // Verify current block hash
      const calculatedHash = this.createBlockHash({
        id: currentBlock.id,
        timestamp: currentBlock.timestamp,
        reviewHash: currentBlock.reviewHash,
        previousHash: currentBlock.previousHash,
        data: currentBlock.data,
        nonce: currentBlock.nonce
      });

      if (calculatedHash !== currentBlock.blockHash) {
        return {
          isValid: false,
          error: `Block ${i} has been tampered`,
          blockId: currentBlock.id
        };
      }

      // Verify previous hash matches
      if (currentBlock.previousHash !== previousBlock.blockHash) {
        return {
          isValid: false,
          error: `Block ${i} previous hash doesn't match`,
          blockId: currentBlock.id
        };
      }
    }

    return {
      isValid: true,
      chainLength: this.chain.length,
      message: 'Blockchain integrity verified'
    };
  }

  // Get review verification status
  getReviewStatus(blockId) {
    const block = this.chain.find(b => b.id === blockId);
    if (!block) {
      return { error: 'Review not found on chain' };
    }

    return {
      blockId: block.id,
      timestamp: block.timestamp,
      hash: block.reviewHash,
      verified: block.data.verified,
      verifiedAt: block.data.verifiedAt,
      chainValid: this.validateChain().isValid
    };
  }

  // Get chain statistics
  getChainStats() {
    return {
      totalBlocks: this.chain.length,
      totalReviews: this.chain.length - 1, // Exclude genesis block
      chainValid: this.validateChain().isValid,
      lastBlockTime: this.chain[this.chain.length - 1].timestamp
    };
  }
}

// Create singleton instance
const ledger = new BlockchainLedger();

module.exports = {
  blockchain: ledger,
  addReview: (reviewData) => ledger.addReview(reviewData),
  verifyReview: (reviewData, hash) => ledger.verifyReview(reviewData, hash),
  validateChain: () => ledger.validateChain(),
  getReviewStatus: (blockId) => ledger.getReviewStatus(blockId),
  getChainStats: () => ledger.getChainStats()
};
