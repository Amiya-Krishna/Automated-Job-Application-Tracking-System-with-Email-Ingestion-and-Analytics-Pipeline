# API Endpoints Documentation

Complete reference for all Job Application Tracker Portal API endpoints.

---

## Base URL

```
http://localhost:5000/api
```

---

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

---

## Response Format

All responses are in JSON format:

**Success Response (2xx):**
```json
{
  "success": true,
  "data": { /* response data */ }
}
```

**Error Response (4xx, 5xx):**
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## 🔐 Authentication Endpoints

### 1. Register User

**POST** `/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "user_id_123",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "message": "Email already exists"
}
```

---

### 2. Login User

**POST** `/auth/login`

Authenticate and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_id_123",
      "username": "john_doe",
      "email": "john@example.com"
    }
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 3. Get User Profile

**GET** `/auth/profile`

Retrieve authenticated user's profile information.

**Headers Required:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user_id_123",
    "username": "john_doe",
    "email": "john@example.com",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### 4. Logout User

**POST** `/auth/logout`

End user session (optional, mainly for frontend state management).

**Headers Required:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 💼 Job Application Endpoints

### 5. Get All Job Applications

**GET** `/jobs`

Fetch all job applications for the authenticated user.

**Headers Required:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (Applied, Interviewed, Rejected, Offered) |
| `company` | string | Filter by company name |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10) |

**Example Request:**
```
GET /jobs?status=Applied&page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "job_id_1",
      "company": "Tech Corp",
      "position": "Frontend Developer",
      "status": "Applied",
      "appliedDate": "2024-01-10",
      "notes": "Great company"
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "pages": 3
  }
}
```

---

### 6. Get Single Job Application

**GET** `/jobs/:id`

Retrieve details of a specific job application.

**Headers Required:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job application ID |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "job_id_1",
    "company": "Tech Corp",
    "position": "Frontend Developer",
    "location": "San Francisco, CA",
    "status": "Applied",
    "appliedDate": "2024-01-10",
    "salary": "$120,000 - $150,000",
    "jobUrl": "https://example.com/job/123",
    "notes": "Great company, good team",
    "createdAt": "2024-01-10T08:00:00Z",
    "updatedAt": "2024-01-10T08:00:00Z"
  }
}
```

---

### 7. Create Job Application

**POST** `/jobs`

Add a new job application.

**Headers Required:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "company": "Tech Corp",
  "position": "Frontend Developer",
  "location": "San Francisco, CA",
  "status": "Applied",
  "appliedDate": "2024-01-10",
  "salary": "$120,000 - $150,000",
  "jobUrl": "https://example.com/job/123",
  "notes": "Great company, good team"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Job application created successfully",
  "data": {
    "id": "job_id_1",
    "company": "Tech Corp",
    "position": "Frontend Developer",
    "status": "Applied",
    "appliedDate": "2024-01-10"
  }
}
```

---

### 8. Update Job Application

**PUT** `/jobs/:id`

Update an existing job application.

**Headers Required:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job application ID |

**Request Body (all fields optional):**
```json
{
  "status": "Interviewed",
  "notes": "Had great interview, waiting for response"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Job application updated successfully",
  "data": {
    "id": "job_id_1",
    "company": "Tech Corp",
    "position": "Frontend Developer",
    "status": "Interviewed",
    "notes": "Had great interview, waiting for response"
  }
}
```

---

### 9. Delete Job Application

**DELETE** `/jobs/:id`

Remove a job application.

**Headers Required:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job application ID |

**Response (200):**
```json
{
  "success": true,
  "message": "Job application deleted successfully"
}
```

---

### 10. Search Job Applications

**GET** `/jobs/search`

Search job applications by query.

**Headers Required:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search term (company name, position, etc.) |
| `field` | string | Field to search (company, position, all) |

**Example Request:**
```
GET /jobs/search?query=Tech&field=company
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "job_id_1",
      "company": "Tech Corp",
      "position": "Frontend Developer"
    }
  ]
}
```

---

## 📊 Analytics Endpoints

### 11. Get Analytics Summary

**GET** `/analytics/summary`

Retrieve overall application statistics.

**Headers Required:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalApplications": 25,
    "applied": 10,
    "interviewed": 5,
    "rejected": 3,
    "offered": 2,
    "pending": 5
  }
}
```

---

### 12. Get Status Breakdown

**GET** `/analytics/status-breakdown`

Get detailed status distribution for charts/graphs.

**Headers Required:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "Applied": 10,
    "Interviewed": 5,
    "Rejected": 3,
    "Offered": 2,
    "Pending": 5
  }
}
```

---

## Status Codes Reference

| Code | Meaning |
|------|---------|
| 200 | OK - Successful request |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 500 | Server Error - Internal server error |

---

## Common Errors

### Missing Token
```json
{
  "success": false,
  "message": "Authorization token is required"
}
```

### Invalid Token
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### Validation Error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  }
}
```

---

## Example cURL Requests

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

### Create Job Application
```bash
curl -X POST http://localhost:5000/api/jobs \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "Tech Corp",
    "position": "Frontend Developer",
    "status": "Applied"
  }'
```

### Get All Jobs
```bash
curl -X GET http://localhost:5000/api/jobs \
  -H "Authorization: Bearer <your_token>"
```

---

## Rate Limiting

Currently no rate limiting is enforced. Future versions may implement rate limits.

---

## Versioning

**Current API Version**: v1.0  
**Base URL**: `/api`

Future versions (v2) will use `/api/v2`

---

**Last Updated**: May 26, 2026
