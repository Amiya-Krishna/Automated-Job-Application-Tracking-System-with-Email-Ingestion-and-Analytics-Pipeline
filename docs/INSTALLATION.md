# Installation & Setup Guide

Complete installation instructions for the Job Application Tracker Portal.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Installation Checklist](#pre-installation-checklist)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Database Configuration](#database-configuration)
6. [Environment Setup](#environment-setup)
7. [Running the Application](#running-the-application)
8. [Verification](#verification)
9. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Requirements

| Requirement | Version | Download |
|-------------|---------|----------|
| Node.js | 16.x or higher | [nodejs.org](https://nodejs.org) |
| npm | 7.x or higher | Comes with Node.js |
| MongoDB | 4.x or higher | [mongodb.com](https://www.mongodb.com) |
| Git | Latest | [git-scm.com](https://git-scm.com) |

### Recommended Specifications

- **OS**: Windows 10+, macOS 10.15+, or Ubuntu 20.04+
- **RAM**: 4GB minimum
- **Storage**: 2GB free space
- **Browser**: Chrome, Firefox, Safari, or Edge (latest versions)

---

## Pre-Installation Checklist

- [ ] Node.js installed and accessible via terminal
- [ ] npm or yarn installed
- [ ] MongoDB installed or Atlas account created
- [ ] Git installed
- [ ] Code editor (VSCode recommended)
- [ ] 2GB free disk space
- [ ] Stable internet connection

**Verify installations:**

```bash
# Check Node.js version
node --version
# Expected: v16.0.0 or higher

# Check npm version
npm --version
# Expected: 7.0.0 or higher

# Check Git version
git --version
# Expected: git version 2.x.x or higher
```

---

## Backend Setup

### Step 1: Navigate to Server Directory

```bash
cd "Job Application Tracker Portal"
cd server
```

### Step 2: Install Dependencies

```bash
npm install
```

**Expected output:**
```
added XXX packages, and audited XXX packages in Xs
```

### Step 3: Verify Installation

```bash
npm list
```

This shows all installed packages and their versions.

### Step 4: Create .env File (in root directory)

Go back to the root directory and create `.env`:

```bash
cd ..
cp .env.example .env
```

Edit `.env` with your database and server configuration.

---

## Frontend Setup

### Step 1: Navigate to Client Directory

```bash
cd client
```

### Step 2: Install Dependencies

```bash
npm install
```

**Expected output:**
```
added XXX packages, and audited XXX packages in Xs
```

### Step 3: Verify Installation

```bash
npm list
```

### Step 4: Environment Configuration (Optional)

If you need custom API endpoints, create `.env.local` in the `client` directory:

```env
VITE_API_URL=https://job-application-tracker-portal-o1ls.onrender.com
```

---

## Database Configuration

### Option A: Local MongoDB Installation

#### Windows

1. **Download MongoDB Community**
   - Go to [MongoDB Download](https://www.mongodb.com/try/download/community)
   - Select your OS and download the installer

2. **Install MongoDB**
   - Run the installer
   - Choose "Complete" installation
   - Check "Install MongoDB as a Service"

3. **Start MongoDB Service**
   ```bash
   net start MongoDB
   ```

4. **Verify Installation**
   ```bash
   mongod --version
   ```

#### macOS

```bash
# Install using Homebrew
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verify
mongod --version
```

#### Ubuntu/Linux

```bash
# Import the public key
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list

# Install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start service
sudo systemctl start mongod

# Verify
mongod --version
```

### Option B: MongoDB Atlas (Cloud) - Recommended for Development

1. **Create Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for free account

2. **Create Cluster**
   - Click "Create Deployment"
   - Choose "M0 Sandbox" (free tier)
   - Select your region
   - Click "Create Deployment"

3. **Set Network Access**
   - Go to "Security" → "Network Access"
   - Click "Add IP Address"
   - Choose "Allow Access from Anywhere" for development
   - Click "Confirm"

4. **Create Database User**
   - Go to "Security" → "Database Access"
   - Click "Add Database User"
   - Username: `jobtracker`
   - Password: Create a strong password
   - Click "Create User"

5. **Get Connection String**
   - Go to "Databases" → "Overview"
   - Click "Connect"
   - Choose "Drivers"
   - Copy the connection string
   - Replace `<password>` with your password
   - Replace `myFirstDatabase` with `job-tracker`

6. **Update .env**
   ```env
   MONGODB_URI=mongodb+srv://jobtracker:password@cluster0.xxxxx.mongodb.net/job-tracker?retryWrites=true&w=majority
   ```

### Verify Database Connection

```bash
# From project root, go to server
cd server

# Start server
npm start
```

Expected output:
```
Server is running on http://localhost:5000
MongoDB connected successfully
```

---

## Environment Setup

### Create .env File

In the project root directory, create a `.env` file:

```bash
cp .env.example .env
```

### Configure Environment Variables

Edit `.env` with proper values:

```env
# ===== DATABASE =====
MONGODB_URI=mongodb://localhost:27017/job-tracker

# ===== SERVER =====
PORT=5000
NODE_ENV=development

# ===== JWT =====
JWT_SECRET=your_super_secret_key_min_32_characters_long_here_12345

# ===== CLIENT =====
CLIENT_URL=https://job-application-tracker-portal-ao8n.vercel.app,http://localhost:5173
```

### Variable Definitions

| Variable | Purpose | Example |
|----------|---------|---------|
| `MONGODB_URI` | Database connection | `mongodb://localhost:27017/job-tracker` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment type | `development` |
| `JWT_SECRET` | Token secret (min 32 chars) | `my_secret_key_...` |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` |

**Security Note**: Never commit `.env` to version control. It's already in `.gitignore`.

---

## Running the Application

### Prerequisites Met?

- [ ] Node.js and npm installed
- [ ] MongoDB running (local or Atlas)
- [ ] `.env` file configured
- [ ] Dependencies installed for both server and client

### Method 1: Running Locally (Development)

**Terminal 1 - Start Backend:**

```bash
cd server
npm start
```

Expected output:
```
Server is running on http://localhost:5000
MongoDB connected successfully
```

**Terminal 2 - Start Frontend:**

```bash
cd client
npm run dev
```

Expected output:
```
  VITE v4.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

### Method 2: Production Build

```bash
# Build frontend
cd client
npm run build

# Start server (serves built frontend)
cd ../server
npm start
```

---

## Verification

### Step 1: Check Server Health

```bash
curl http://localhost:5000
```

Expected: Server status information

### Step 2: Access Frontend

Open browser and visit:
```
http://localhost:5173
```

Expected: Login page loads without errors

### Step 3: Test Authentication

1. Click "Register"
2. Create account with:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `Test@1234`
3. Click "Submit"

Expected: Account created and redirected to login

### Step 4: Login

Use credentials from Step 3.

Expected: Dashboard loads successfully

### Step 5: Test Job Creation

1. Click "Add New Job"
2. Fill in form:
   - Company: `Test Corp`
   - Position: `Developer`
   - Status: `Applied`
3. Click "Save"

Expected: Job appears in dashboard

### Verification Checklist

- [ ] Server running on port 5000
- [ ] Frontend running on port 5173
- [ ] MongoDB connected
- [ ] Login page accessible
- [ ] Account registration works
- [ ] Login works
- [ ] Dashboard displays
- [ ] Can add job application
- [ ] No console errors

---

## Troubleshooting

### Problem: "Cannot find module" errors

**Solution:**
```bash
# Delete node_modules and reinstall
rm -r node_modules
npm install

# Clear npm cache
npm cache clean --force
```

### Problem: MongoDB Connection Error

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:27017`

**Solution:**
- Check MongoDB is running
- Verify `MONGODB_URI` in `.env`
- For local DB: `mongod` should be running
- For Atlas: Check connection string format

### Problem: Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::5000`

**Solution:**
```bash
# Windows - Find and kill process
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux - Find and kill process
lsof -i :5000
kill -9 <PID>

# Or change PORT in .env
PORT=5001
```

### Problem: CORS Errors

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
Verify `.env` has correct URLs:
```env
CLIENT_URL=https://job-application-tracker-portal-ao8n.vercel.app,http://localhost:5173
```

Restart server after changing.

### Problem: Environment Variables Not Loading

**Error:** `Process is undefined` or variables are undefined

**Solution:**
1. Make sure `.env` file exists in root directory
2. Restart server after creating/modifying `.env`
3. Check file is named exactly `.env` (not `.env.example`)

### Problem: npm install Takes Too Long

**Solution:**
```bash
# Clear cache
npm cache clean --force

# Try with legacy peer deps
npm install --legacy-peer-deps

# Use npm ci instead
npm ci
```

### Problem: React/Vite Not Starting

**Error:** `TypeError: Cannot read properties of undefined`

**Solution:**
```bash
cd client
npm install
npm run dev
```

### Problem: Login Not Working

**Causes & Solutions:**
1. Check JWT_SECRET in `.env` is set
2. Verify database has user collection
3. Check browser console for errors
4. Restart both servers

### Getting Help

1. **Check Console Errors**
   - Browser: F12 → Console
   - Server: Terminal where npm start runs

2. **Verify All Services**
   - MongoDB: `mongod` running
   - Server: Terminal shows "Server running"
   - Frontend: Terminal shows "Local: http://localhost:5173"

3. **Check Ports**
   - Server: http://localhost:5000
   - Client: http://localhost:5173

---

## Next Steps

1. ✅ Installation complete
2. 📖 Read [GETTING_STARTED.md](GETTING_STARTED.md)
3. 📚 Review [API_ENDPOINTS.md](API_ENDPOINTS.md)
4. 💻 Explore the codebase
5. 🚀 Deploy to production (see deployment guide)

---

## Quick Reference Commands

```bash
# Install all dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Stop server
Ctrl + C

# Update npm
npm install -g npm@latest

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

---

**Last Updated**: May 26, 2026  
**Version**: 1.0.0
