# Google Calendar OAuth Setup Guide

## Prerequisites

1. A Google Cloud Platform account
2. A Google Cloud Project

## Steps to Set Up Google OAuth

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable Google Calendar API**
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - If prompted, configure the OAuth consent screen first:
     - Choose "External" (unless you have a Google Workspace)
     - Fill in the required information
     - Add scopes: `https://www.googleapis.com/auth/calendar`
     - Add test users (your email) if in testing mode
   - For Application type, choose "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:5000/api/google-calendar/callback`
     - Add your production URL when deploying

4. **Download Credentials**
   - After creating the OAuth client, click "Download JSON"
   - Save the file as `client_secret.json` in the `backend/` directory
   - **Important**: Add `client_secret.json` to `.gitignore` (already included)

5. **Update Environment Variables**
   - The `client_secret.json` file contains your credentials
   - No additional environment variables needed for OAuth (the file is used directly)

## Testing the Integration

1. Start the backend server:
   ```bash
   cd backend
   python app.py
   ```

2. In your frontend, click "Sync Google Calendar"
   - You'll be redirected to Google's OAuth page
   - Sign in and grant permissions
   - You'll be redirected back to the app

3. The calendar will now sync with your Google Calendar!

## Troubleshooting

- **"FileNotFoundError: client_secret.json"**: Make sure the file is in the `backend/` directory
- **"Redirect URI mismatch"**: Ensure the redirect URI in Google Cloud Console matches exactly
- **"Access blocked"**: Make sure you've added yourself as a test user in the OAuth consent screen (if in testing mode)

