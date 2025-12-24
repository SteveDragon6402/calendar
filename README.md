# Calendar Auto-Scheduling App

A calendar auto-scheduling application.

## Project Structure

- `frontend/` - Frontend application
- `backend/` - Backend API and services

## Setup

### Backend
```bash
cd backend
pip install -r ../requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

## Environment Variables

Create a `.env` file in the backend directory with your API keys and configuration:

```
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5002/api/google-calendar/callback
OPENAI_API_KEY=your_openai_api_key_here
FLASK_ENV=development
PORT=5002
```

## Features

- **Calendar Plugin**: Full-featured in-app calendar component with:
  - Month, Week, and Day views
  - Event creation, editing, and deletion
  - Beautiful, modern UI with responsive design
  - Click on days to create events
  - Click on events to view/edit details

- **Google Calendar Sync**: 
  - OAuth 2.0 authentication with Google Calendar
  - Two-way sync between local events and Google Calendar
  - Automatic event creation and updates

- **Task Management**:
  - Create tasks with deadline, duration, and priority
  - Optional chunking support (split tasks into smaller chunks)
  - Set min/max chunk durations
  - Priority levels (1-5, where 1 is highest)
  - Visual task cards with overdue highlighting
  - Edit and delete tasks
  - **Bulk Import**: Paste multiple tasks in structured format
  - **AI Bulk Add**: Describe tasks in natural language, AI converts to structured format

## API Endpoints

### Events
- `GET /api/events` - Get all calendar events
- `GET /api/events/<id>` - Get a specific event
- `POST /api/events` - Create a new calendar event
- `PUT /api/events/<id>` - Update an existing event
- `DELETE /api/events/<id>` - Delete an event

### Google Calendar Integration
- `GET /api/google-calendar/auth` - Get OAuth authorization URL
- `GET /api/google-calendar/callback` - OAuth callback handler
- `POST /api/google-calendar/sync` - Sync events with Google Calendar
- `GET /api/google-calendar/events` - Get events from Google Calendar
- `GET /api/google-calendar/status` - Check authentication status

### Tasks
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/<id>` - Get a specific task
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/<id>` - Update an existing task
- `DELETE /api/tasks/<id>` - Delete a task
- `POST /api/tasks/bulk` - Create multiple tasks at once
- `POST /api/tasks/ai-bulk-add` - Process natural language task description with AI

### Health
- `GET /api/health` - Health check

## Google Calendar Setup

See [backend/GOOGLE_OAUTH_SETUP.md](backend/GOOGLE_OAUTH_SETUP.md) for detailed instructions on setting up Google Calendar OAuth integration.

## Running the Application

### Backend
```bash
cd backend
python app.py
```
The API will run on `http://localhost:5000`

### Frontend
Open `frontend/index.html` in a web browser, or use a local server:
```bash
cd frontend
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

