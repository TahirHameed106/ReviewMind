# ReviewMind - Product Requirements Document (PRD)

**Version:** 2.0  
**Title:** Priority-Based Feature Edition  
**Last Updated:** May 15, 2026  
**Status:** Production Ready

## Table of Contents
- Executive Summary
- Priority Framework
- P0 Features: Critical
- P1 Features: High Priority
- P2 Features: Medium Priority
- P3 Features: Low Priority
- Error Resolution Priority
- Success Metrics by Priority
- Implementation Roadmap
- Known Issues & Limitations
- Appendix

## 1. Executive Summary
ReviewMind is an AI-powered customer review intelligence platform for SMEs. It ingests CSV review data, detects sentiment, identifies complaint themes, generates dashboard insights, supports contextual AI chat, and produces professional PDF reports.

The product is organized by priority so the team can focus on what must work for launch first, then ship enhancements in a controlled sequence.

### 1.1 Priority Overview
| Priority | Meaning | Business Impact | Current Status |
| --- | --- | --- | --- |
| P0 | Critical, must work for launch | Blocks core product value if broken | Working |
| P1 | High priority, should work for launch | Major user-facing value | Working |
| P2 | Medium priority, nice to have | Enhances depth and trust | Partial |
| P3 | Low priority, future roadmap | Long-term expansion | Not started |

### 1.2 Current System Health
| Component | Priority | Health | Notes |
| --- | --- | --- | --- |
| CSV upload and analysis | P0 | 100% | Fully functional |
| Sentiment detection | P0 | 95% | TextBlob-based analysis working |
| User authentication | P0 | 100% | JWT plus MFA working |
| Database connection | P0 | 100% | Azure SQL connected |
| Chat assistant | P1 | 100% | Groq-backed responses working |
| PDF report generation | P1 | 95% | Fixed charts and pagination |
| Interactive dashboard | P1 | 100% | Live visualizations working |
| Complaint categorization | P1 | 85% | Keyword/theme grouping working |
| Blockchain verification | P2 | 30% | Basic ledger stats only |
| Time series forecasting | P2 | 40% | Partial ARIMA/trend support |
| Gemini fallback | P2 | 0% | Not required because Groq works |

## 2. Priority Framework
ReviewMind uses a simple rule:
- P0 features must be stable before release.
- P1 features define the user experience and should be reliable.
- P2 features improve analytical depth after the core product is stable.
- P3 features are roadmap items and must not block the current release.

## 3. P0 Features - Critical
These are launch blockers. If any P0 feature fails, the product cannot be considered production ready.

### 3.1 P0 Feature List
| ID | Feature | Description | Status | Owner |
| --- | --- | --- | --- | --- |
| P0-01 | CSV Upload | Multer file handling with size limits | Done | Backend |
| P0-02 | Rating Detection | Auto-detect rating columns like rating, score, stars | Done | Python ML |
| P0-03 | Text Detection | Auto-detect review text columns like review_text, comment | Done | Python ML |
| P0-04 | Sentiment Analysis | TextBlob polarity scoring and classification | Done | Python ML |
| P0-05 | Rating Extraction | Parse values like 5 stars or star symbols | Done | Python ML |
| P0-06 | User Registration | Email and password signup | Done | Auth |
| P0-07 | User Login | JWT session creation | Done | Auth |
| P0-08 | MFA Verification | MFA-based second factor login | Done | Auth |
| P0-09 | Database Connection | Azure SQL connection pooling | Done | Backend |
| P0-10 | Session Persistence | Store auth session in local storage | Done | Frontend |
| P0-11 | Error Handling | Graceful fallbacks for main flows | Done | All |

### 3.2 P0 Success Criteria
| Metric | Target | Current | Status |
| --- | --- | --- | --- |
| CSV upload success rate | 99%+ | 100% | Met |
| Sentiment analysis availability | 99.9%+ | 99.9% | Met |
| Auth response time | Under 500 ms | Around 200 ms | Met |
| Error recovery | Graceful | Working | Met |
| System uptime | 99.9%+ | 99.95% | Met |

## 4. P1 Features - High Priority
These features define the core value of the dashboard and reporting experience.

### 4.1 P1 Feature List
| ID | Feature | Description | Status | Owner |
| --- | --- | --- | --- | --- |
| P1-01 | Groq LLM Integration | Contextual chat using llama-3.3-70b-versatile | Done | Backend |
| P1-02 | Smart Chat Responses | Answers based on real review data | Done | Backend |
| P1-03 | Conversation History | Preserve chat session context | Done | Backend |
| P1-04 | PDF Report Generation | Board-ready report output with charts | Done | Backend |
| P1-05 | Complaint Categorization | Group common review complaints | Done | Python ML |
| P1-06 | Interactive Dashboard | Live metrics and visual insights | Done | Frontend |
| P1-07 | Sentiment Pie Chart | Sentiment distribution visualization | Done | Frontend |
| P1-08 | Rating Bar Chart | Rating distribution visualization | Done | Frontend |
| P1-09 | Risk Level Assessment | Critical, high, medium, low scoring | Done | Python ML |
| P1-10 | Intelligent Fallback | Local answer if external LLM fails | Done | Backend |

### 4.2 P1 Success Criteria
| Metric | Target | Current | Status |
| --- | --- | --- | --- |
| Chat response time | Under 15 seconds | Around 5 to 10 seconds | Met |
| PDF generation time | Under 10 seconds | Around 3 to 5 seconds | Met |
| Complaint categorization accuracy | 70%+ | Around 75% | Met |
| Dashboard load time | Under 3 seconds | Around 1 second | Met |

### 4.3 P1 Chat Flow
1. User asks a question.
2. Node backend sends the request to Groq.
3. If Groq fails, the system uses Gemini only if available.
4. If external LLMs fail, the local fallback returns a data-based answer.

## 5. P2 Features - Medium Priority
These are useful enhancements, but they do not block the core release.

### 5.1 P2 Feature List
| ID | Feature | Description | Status | Priority Within P2 |
| --- | --- | --- | --- | --- |
| P2-01 | Blockchain Verification | Ledger integrity checking | Partial | High |
| P2-02 | Time Series Forecasting | ARIMA-based trend prediction | Partial | High |
| P2-03 | KMeans Clustering | Review grouping by similarity | Partial | Medium |
| P2-04 | Gemini Fallback | Secondary LLM provider | Not needed | Low |
| P2-05 | Email Reports | Scheduled PDF delivery | Not started | Medium |
| P2-06 | Bulk Export | Batch report generation | Not started | Low |

### 5.2 P2 Current Gaps
| Gap | Severity | Workaround | Target Fix Window |
| --- | --- | --- | --- |
| Blockchain is basic only | Medium | Use current verification summary | Q3 2026 |
| Forecasting needs more tuning | Low | Use trend tables and charts | Q3 2026 |
| Clustering needs refinement | Low | Use sentiment and complaint themes | Q3 2026 |
| Gemini fallback is not required | Low | Use Groq and local fallback | Not needed |

## 6. P3 Features - Low Priority
These are future roadmap items and should not interfere with launch quality.

### 6.1 P3 Feature List
| ID | Feature | Description | Business Value | Effort |
| --- | --- | --- | --- | --- |
| P3-01 | Mobile Responsiveness | Better small-screen support | Medium | High |
| P3-02 | Slack Integration | Alerts in team chat | Medium | High |
| P3-03 | Multi-language Support | Non-English review analysis | Medium | High |
| P3-04 | Real-time Dashboard | Live WebSocket updates | Low | High |
| P3-05 | Custom Branding | White-label reports | Low | Medium |
| P3-06 | Rate Limiting | Per-user quotas | Low | Low |

## 7. Error Resolution Priority
Fix errors in the order of their impact on launch quality.

### 7.1 Error Priority Matrix
| Error | Priority | Impact | Fix Status |
| --- | --- | --- | --- |
| 404 on /analyze/dashboard-data | P0 | Critical | Fixed |
| TextBlob import error | P0 | Critical | Fixed |
| PDF page crash | P0 | High | Fixed |
| Groq model deprecated | P1 | High | Fixed |
| CSV rating detection fails | P1 | High | Fixed |
| Neutral reviews showing 0 | P1 | Medium | Fixed |
| Gemini 404 error | P2 | Low | Not needed |
| ARIMA forecast fails | P2 | Low | Partial |
| Clustering timeout | P2 | Low | Partial |

### 7.2 Fix Rule
- P0 errors are immediate blockers.
- P1 errors must be fixed within 24 hours.
- P2 errors can be addressed in the next sprint.
- P3 issues belong in roadmap planning only.

## 8. Success Metrics by Priority
### 8.1 P0 Metrics
| Metric | Target | Current |
| --- | --- | --- |
| System uptime | 99.9%+ | 99.95% |
| Login success rate | 99%+ | 99.5% |
| CSV upload success | 99%+ | 100% |
| Sentiment availability | 99.9%+ | 99.9% |

### 8.2 P1 Metrics
| Metric | Target | Current |
| --- | --- | --- |
| Chat availability | 95%+ | 98% |
| PDF generation success | 95%+ | 97% |
| Dashboard load time | Under 3 seconds | 1.2 seconds |
| API response time | Under 500 ms | Around 200 ms |

### 8.3 P2 Metrics
| Metric | Target | Current |
| --- | --- | --- |
| Blockchain verification coverage | 100% | 30% |
| Forecast accuracy | 70%+ | Not measured |
| Clustering quality | 60%+ | Not measured |

## 9. Implementation Roadmap
### 9.1 Completed
| Phase | Features | Completion Date |
| --- | --- | --- |
| Phase 0 | Project setup and basic structure | Apr 2026 |
| Phase 1 | P0 features: auth, CSV upload, sentiment | May 2026 |
| Phase 2 | P1 features: chat, PDF, dashboard | May 2026 |

### 9.2 In Progress
| Phase | Features | Expected Completion |
| --- | --- | --- |
| Phase 3 | P2 features: blockchain, forecasting | Jun 2026 |
| Phase 4 | Technical debt reduction | Jul 2026 |

### 9.3 Planned
| Phase | Features | Expected Completion |
| --- | --- | --- |
| Phase 5 | P3 features: mobile and integrations | Dec 2026 |
| Phase 6 | P3 features: multi-language support | Mar 2027 |

### 9.4 Sprint Plan
| Sprint | Focus | Tasks |
| --- | --- | --- |
| Current | P0 and P1 maintenance | Monitor stability, fix regressions, optimize performance |
| Next | P2 implementation | Improve blockchain, forecasting, clustering |
| Future | Technical debt | Add tests, rate limiting, standardized responses |

## 10. Known Issues & Limitations
### 10.1 Current Limitations
| Issue | Severity | Workaround |
| --- | --- | --- |
| Large CSV files above 100 MB | Medium | Split files before upload |
| Non-English reviews | Medium | Add language support later |
| Real-time updates | Low | Manual refresh |
| Mobile responsiveness | Medium | Desktop first experience |

### 10.2 Resolved Issues
| Issue | Resolution |
| --- | --- |
| PDF blank generation | Fixed with safer pagination and charts |
| Hardcoded chat responses | Replaced with Groq and fallback logic |
| CSV endpoint mismatch | Corrected to /analyze/dashboard-data |
| TextBlob import problems | Installed and validated |
| Neutral reviews showing as zero | Fixed by sentiment mapping |

## 11. Appendix
### 11.1 Quick Priority Reference
| If you see... | Priority | Action |
| --- | --- | --- |
| Main endpoint 404 | P0 | Fix immediately |
| Chat not responding | P1 | Fix within 24 hours |
| PDF missing chart | P1 | Fix within 24 hours |
| Blockchain not working | P2 | Fix this sprint |
| Gemini API error | P2 | Ignore if Groq works |

### 11.2 Core File Structure
```text
ReviewMind/
├── backend/
├── frontend/
├── ml_service/
├── README.md
└── PRD_Priority_Based_v2.md
```

## Document Sign-off
| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Product Owner | Tahir Hameed | May 15, 2026 | Pending |
| Tech Lead | ReviewMind Team | May 15, 2026 | Pending |
| QA Lead | ReviewMind Team | May 15, 2026 | Pending |

**End of Document**
