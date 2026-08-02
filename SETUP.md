# Setup Guide - Syncra Planner (Full-Stack PWA)

This guide walks you through setting up and running the centralized Python Flask backend server (with MySQL database) and hosting the frontend client.

---

## 🛠️ Backend Setup (Python Flask)

Ensure you have **Python 3.9+** installed on your computer.

### Step 1: Install Dependencies
Open your terminal (PowerShell, Command Prompt, or Terminal) in the project root directory and run:
```bash
pip install -r backend/requirements.txt
```
*(Tip: You can use a Python virtual environment `python -m venv venv` if you want to isolate the packages).*

### Step 2: Configure Database & Environment
1. Log into your MySQL Server shell or GUI tool (such as phpMyAdmin or MySQL Workbench) and create a database named `syncra_db`:
   ```sql
   CREATE DATABASE syncra_db;
   ```
2. In the `backend/` folder, copy `.env.example` and name the new file `.env`.
3. Open `backend/.env` and update the connection credentials under `DATABASE_URL`:
   * **Format**: `mysql+pymysql://<db_username>:<db_password>@<db_host>:<db_port>/syncra_db`
   * *Example*: `DATABASE_URL=mysql+pymysql://root:my-secure-password@localhost:3306/syncra_db`

> [!NOTE]
> **Out-of-the-Box Fallback**: If you don't have MySQL installed or configured yet, the Flask server will automatically fall back to creating a local **SQLite** database (`backend/instance/syncra.db`) on startup, ensuring the server runs successfully without crashes.

### Step 3: Run the Flask Server
From the root project directory, run:
```bash
python backend/app.py
```
The server will boot up and start listening on port `5000`:
👉 **`http://localhost:5000/`**

---

## 💻 Frontend Setup (Client Web Server)

To serve the frontend client and enable PWA support, run a local web server:

### Option A: Using Python (Recommended)
Open a new terminal window in the project root directory and run:
```bash
python -m http.server 8000
```

### Option B: Using Node.js
If you have Node.js installed, run:
```bash
npx http-server -p 8000
```

Once the web server starts, open your browser and navigate to:
👉 **`http://localhost:8000/`**

---

## 📱 Mobile Phone Setup (Add to Home Screen)

You can run Syncra on your mobile device as a fullscreen app without address bars.

### Step 1: Connect to the Same Network
Ensure your phone is connected to the **same Wi-Fi network** as your computer.

### Step 2: Locate Your Local IP
1. On your computer, open a terminal.
2. Run:
   ```cmd
   ipconfig
   ```
3. Locate the current network adapter's **IPv4 Address** (e.g., `192.168.1.37`).

### Step 3: Open in Mobile Browser
1. In your mobile browser, open `http://<your-computer-ip>:8000/` (e.g. `http://192.168.1.37:8000/`).

### Step 4: Install PWA Icon
* **Apple iOS (Safari)**: Tap the **Share** button at the bottom -> tap **"Add to Home Screen"** -> tap **"Add"**.
* **Android (Chrome)**: Tap the Chrome **3-dot menu** -> tap **"Install App"** (or **"Add to Home Screen"**).

---

## 🚀 Deploying to Vercel (Centralized Production Hosting)

Vercel natively hosts our static HTML/CSS/JS frontend PWA and runs our Python Flask API as Serverless Functions using the configuration in `vercel.json`.

### Prerequisites (Aiven MySQL Setup):
1. **Sign up for Aiven**: Go to [aiven.io](https://aiven.io) and create a free account.
2. **Create a MySQL Service**:
   - In the Aiven Console, click **Create Service**.
   - Select **MySQL** as the database service.
   - Choose the cloud provider (AWS / Google Cloud) and region closest to you.
   - Select the **Free Tier** plan (it is completely free, no credit card required).
   - Give it a name (e.g. `mysql-syncra`) and click **Create Service**.
3. **Get the Service URI**:
   - Wait 2-3 minutes for the service state to change to *Running*.
   - In the service overview tab, locate the **Service URI** connection field.
   - It will look like: `mysql://avnadmin:<password>@mysql-syncra-yourproject.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
   - Copy this Service URI. *(Note: Syncra's backend is custom-programmed to automatically adjust Aiven’s mysql:// URL prefix to mysql+pymysql:// and enable the required SSL parameters automatically!)*

### Step 1: Create a Vercel Account & Install CLI
1. Sign up for a free hobby account at [vercel.com](https://vercel.com).
2. Install the Vercel CLI locally (if deploying from CLI):
   ```bash
   npm install -g vercel
   ```

### Step 2: Deploy Using the Vercel CLI
1. Open a terminal in the project root directory and run:
   ```bash
   vercel
   ```
2. Log in if prompted, select your account, and choose **"Set up and deploy 'Task Scheduler Project'? [y/N]"** -> Type `y`.
3. Link to existing project -> `N` (No).
4. Name your project -> `syncra-planner`.
5. Specify the directory -> `./` (press enter).
6. Select default settings -> `y`.
7. Once the initial build starts, go to your Vercel Dashboard at [vercel.com](https://vercel.com).

### Step 3: Configure Environment Variables on Vercel
1. In the Vercel Dashboard, open your project (`syncra-planner`).
2. Go to **Settings** -> **Environment Variables**.
3. Add the following keys:
   * **`SECRET_KEY`**: Set to a long secure random string (e.g., `super-secret-production-hash-key`).
   * **`DATABASE_URL`**: Set to your hosted MySQL database connection string.
4. Save the variables.

### Step 4: Re-deploy to Production
1. In your terminal, run the final deployment:
   ```bash
   vercel --prod
   ```
2. Once complete, Vercel will provide your live URL (e.g. `https://syncra-planner.vercel.app/`).
3. Open this URL on your phone or computer, sign up, and install the PWA. Everything will automatically sync in real-time across all your devices!

