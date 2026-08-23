Project Setup and Running Instructions
This guide provides step-by-step instructions for setting up and running the Overwatch Racing web application on your local machine. It covers software prerequisites, project structure, installation, running the application, and deployment considerations.
Table of Contents

1. Prerequisites
2. Project Structure
3. Setup and Installation
4. Running the Application
5. Deployment Notes

1. Prerequisites
Ensure the following software is installed on your computer before starting:

Python: Version 3.8 or newer
Verify: Run python --version or python3 --version in your terminal


pip: Python's package installer (typically included with Python)
Verify: Run pip --version or pip3 --version



2. Project Structure
Organize your project directory (e.g., overwatch_racing/) as follows to ensure the Flask server locates all necessary files:
overwatch_racing/
├── app.py              # Main Flask server script
├── static/             # Folder for CSS, JS, and images
│   ├── race.js         # Frontend logic
│   ├── style.css       # Custom styles
│   └── assets/         # Folder for images
│       └── horse.png   # Placeholder racer image
└── templates/          # Folder for HTML files
    └── index.html      # Main game HTML page

Important: Placing index.html outside the templates folder or .js/.css files outside the static folder will result in 404 Not Found errors.
3. Setup and Installation
Follow these steps in your terminal or command prompt to set up the project.
Step 1: Navigate to Project Folder
Change to your project directory:
cd path/to/overwatch_racing

Step 2: Create and Activate a Virtual Environment
A virtual environment isolates project dependencies. Choose the commands for your operating system.
Windows:
python -m venv venv
.\venv\Scripts\activate

macOS/Linux:
python3 -m venv venv
source venv/bin/activate

After activation, your terminal prompt should show (venv).
Step 3: Install Flask
With the virtual environment active, install Flask:
pip install Flask

4. Running the Application
Step 1: Start the Flask Server
From the project root folder, run:
python app.py

Expected output:
 * Serving Flask app 'app'
 * Running on http://127.0.0.1:5000
Press CTRL+C to quit

Step 2: Access the Game
Open a web browser (e.g., Chrome, Firefox, Edge) and navigate to:
http://127.0.0.1:5000

The game should load. To see changes in race.js or style.css, hard-refresh the browser (Ctrl+Shift+R or Cmd+Shift+R).
5. Deployment Notes
To host this application, note that GitHub Pages only supports static files (HTML, CSS, JS) and cannot run the app.py Flask server, so multiplayer features won't work there. For full functionality, use a hosting service that supports Python web applications, such as:

Render.com (offers a free tier)
Heroku
PythonAnywhere
A Virtual Private Server (VPS) from DigitalOcean or Linode
