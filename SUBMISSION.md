# Internship Assessment Submission

This submission focuses on backend system design, debugging analysis, and product-level decision making. The emphasis is on data correctness, system reliability, and scalable architecture rather than UI presentation.

---

## Part 1: Job Tracking System

### Problem

Job tracking breaks down when applications originate from multiple sources. Manual entry, Gmail parsing, and browser capture often create duplicate records with inconsistent structures. Without a strict write path, the system accumulates duplicates, inconsistent statuses, and unreliable analytics.

---

### What I Built

I built a backend-first job tracking system using Node.js, Express, PostgreSQL, Redis, and BullMQ.

The system exposes a single ingestion API that accepts job data and pushes it to a queue. Workers then asynchronously handle normalization, deduplication, matching, application preparation, and analytics rollups.

The key focus is not the UI, but the data pipeline:

- Single ingestion entry point for manual and email-based inputs  
- Normalized company and title matching before persistence  
- PostgreSQL as the source of truth  
- Worker-based asynchronous processing for ingestion, scoring, and analytics  
- Outcome tracking that feeds back into analytics and iterative improvements  

---

### My Contributions

This was designed as a complete end-to-end system:

- Designed an ingestion pipeline with **synchronous deduplication + asynchronous downstream processing** to eliminate race conditions  
- Implemented BullMQ-based job orchestration with retry and exponential backoff for scraper and application failures  
- Built TF-IDF–based scoring with explainable outputs stored in JSONB  
- Designed a canonical job identity model using self-referencing foreign keys to eliminate duplicates across multiple sources  

---

### One Strong Design Decision

I deliberately kept deduplication synchronous while pushing all other operations to asynchronous workers.

**Reason:**
- Prevents duplicate race conditions during ingestion  
- Ensures canonical identity is consistent at write time  

**Tradeoff:**
- Slightly increased latency on the ingestion endpoint  
- Accepted because the candidate comparison set is bounded and predictable  

---

### One Strong Design Mistake and Improvement

Initially, ingestion was treated as a direct write path. While simple to implement, this tightly coupled API latency with deduplication and downstream processing.

**Improvement:**
- Keep the API thin  
- Enqueue work immediately  
- Let workers handle database writes, retries, and failure recovery  

This shift improves system resilience, scalability, and fault tolerance.

---

## Part 2: Debugging Fixes

### 1. Async/Await Issue

**What was wrong:**  
An asynchronous function was invoked without awaiting its completion, causing subsequent logic to execute on incomplete state.

**Why it breaks in production:**  
Under load, this leads to race conditions, missing records, partial updates, and duplicate processing. The issue appears non-deterministic due to timing variability across environments.

---

### 2. Firestore Query Issue

**What was wrong:**  
The query did not align with the actual document structure or filtering requirements.

**Why it breaks in production:**  
Firestore queries must match indexed fields. Misaligned queries either return incorrect data or fail at runtime due to missing indexes, leading to silent data gaps or hard failures.

---

### 3. Authentication Issue

**What was wrong:**  
Authentication tokens were not consistently propagated or validated between client and backend.

**Why it breaks in production:**  
Users appear authenticated in the UI but receive 401 responses on protected endpoints. This creates inconsistent session states and hard-to-debug failures due to frontend-backend divergence.

---

### 4. Missing Await on Database Write

**What was wrong:**  
A database write was triggered without awaiting its resolution.

**Why it breaks in production:**  
The API may return success before the data is persisted. This leads to follow-up read failures, stale state in downstream jobs, and duplicate writes during retries.

---

### 5. Queue Retry Storm

**What was wrong:**  
Failed jobs retried aggressively without proper backoff.

**Why it breaks in production:**  
Retry storms overload workers, delay valid jobs, and amplify failures during external outages (e.g., scraper downtime).

**Fix:**
- Exponential backoff  
- Maximum retry limits  
- Dead-letter queue for failed jobs  

---

## Part 3: Reschedule Widget

### Timezone Handling

All timestamps are stored in UTC and converted to local time only for display. This avoids inconsistencies across timezones and ensures correctness during daylight-saving transitions.

---

### 2-Hour Restriction Logic

Rescheduling is restricted to at least two hours ahead of the current time in the user’s local timezone.

Validation is performed using normalized timestamps rather than string comparisons, ensuring correctness across timezone offsets.

---

### Error Handling

The system follows a fail-fast approach:

- Invalid inputs are rejected with clear validation messages  
- UI state remains unchanged if backend persistence fails  
- The interface never reflects a successful action unless the write is confirmed  

**Edge cases handled:**

- Timezone changes after scheduling → consistency maintained via UTC storage  
- Daylight-saving transitions → no duplicate or skipped time slots  
- Concurrent reschedule requests → handled using last-write-wins with version checks  

---

## Summary

This is a backend system focused on correctness, resilience, and operational clarity—not a simple CRUD wrapper.

Core principles:

- Prioritize data correctness over convenience  
- Use asynchronous processing for scalability and reliability  
- Keep APIs thin and delegate complexity to workers  
- Treat PostgreSQL as the single source of truth  
- Derive analytics from persisted state, not UI assumptions  

The system is designed to remain consistent under concurrent ingestion, partial failures, and retry scenarios.

**Result:**  
Tested with ~1000+ job records, maintaining stable API latency due to asynchronous architecture and controlled ingestion flow.