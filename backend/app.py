"""
Backend API for Calendar Auto-Scheduling App
Handles Google Calendar synchronization and calendar management
"""

from flask import Flask, jsonify, request, session, redirect
from flask_cors import CORS
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv
from models import Event, events_store, Task, tasks_store
from google_calendar_service import GoogleCalendarService
from scheduler import TaskScheduler

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Configure session cookies for cross-origin requests
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True

# Enable CORS for frontend communication - allow localhost:8000
CORS(app, 
     resources={
         r"/api/*": {
             "origins": ["http://localhost:8000", "http://127.0.0.1:8000"],
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"],
             "supports_credentials": True
         }
     })

# Initialize Google Calendar service
google_calendar = GoogleCalendarService()

# Initialize Task Scheduler
task_scheduler = TaskScheduler()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Calendar API is running'})

# Event CRUD Operations

@app.route('/api/events', methods=['GET'])
def get_events():
    """Get all calendar events"""
    try:
        events = [event.to_dict() for event in events_store.values()]
        print(f"Returning {len(events)} events")
        return jsonify({'events': events})
    except Exception as e:
        import traceback
        print(f"Error getting events: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/events/<event_id>', methods=['GET'])
def get_event(event_id):
    """Get a specific calendar event"""
    try:
        if event_id not in events_store:
            return jsonify({'error': 'Event not found'}), 404
        
        event = events_store[event_id]
        return jsonify({'event': event.to_dict()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/events', methods=['POST'])
def create_event():
    """Create a new calendar event"""
    try:
        data = request.json
        print(f"Creating event with data: {data}")
        
        if not data or not data.get('title') or not data.get('start') or not data.get('end'):
            return jsonify({'error': 'Missing required fields: title, start, end'}), 400
        
        # Validate date formats
        try:
            # Handle ISO format with or without timezone
            start_str = data['start'].replace('Z', '+00:00') if 'Z' in data['start'] else data['start']
            end_str = data['end'].replace('Z', '+00:00') if 'Z' in data['end'] else data['end']
            
            start_date = datetime.fromisoformat(start_str)
            end_date = datetime.fromisoformat(end_str)
            
            if end_date <= start_date:
                return jsonify({'error': 'End time must be after start time'}), 400
        except (ValueError, AttributeError) as e:
            return jsonify({'error': f'Invalid date format: {str(e)}. Received: start={data.get("start")}, end={data.get("end")}'}), 400
        
        # Generate unique ID
        event_id = str(uuid.uuid4())
        
        # Create event
        event = Event(
            id=event_id,
            title=data['title'],
            start=data['start'],
            end=data['end'],
            description=data.get('description', ''),
            google_event_id=data.get('google_event_id'),
            task_id=data.get('task_id')
        )
        
        events_store[event_id] = event
        print(f"Created event {event_id}: {event.to_dict()}")
        
        return jsonify({'event': event.to_dict()}), 201
    except Exception as e:
        import traceback
        print(f"Error creating event: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/events/<event_id>', methods=['PUT'])
def update_event(event_id):
    """Update an existing calendar event"""
    try:
        if event_id not in events_store:
            return jsonify({'error': 'Event not found'}), 404
        
        data = request.json
        event = events_store[event_id]
        
        # Update event fields
        if 'title' in data:
            event.title = data['title']
        if 'start' in data:
            event.start = data['start']
        if 'end' in data:
            event.end = data['end']
        if 'description' in data:
            event.description = data['description']
        if 'google_event_id' in data:
            event.google_event_id = data['google_event_id']
        if 'task_id' in data:
            event.task_id = data['task_id']
        
        events_store[event_id] = event
        
        return jsonify({'event': event.to_dict()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/events/<event_id>', methods=['DELETE'])
def delete_event(event_id):
    """Delete a calendar event"""
    try:
        if event_id not in events_store:
            return jsonify({'error': 'Event not found'}), 404
        
        event = events_store[event_id]
        
        # If event is synced with Google Calendar, delete it there too
        if event.google_event_id and google_calendar.is_authenticated():
            try:
                google_calendar.delete_event(event_id=event.google_event_id)
            except Exception as e:
                print(f"Error deleting from Google Calendar: {e}")
        
        # Delete from local store
        del events_store[event_id]
        
        return jsonify({'message': 'Event deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Google Calendar Integration

@app.route('/api/google-calendar/auth', methods=['GET'])
def google_calendar_auth():
    """Initiate Google Calendar OAuth authentication"""
    try:
        authorization_url = google_calendar.get_authorization_url()
        return jsonify({
            'auth_url': authorization_url,
            'message': 'Redirect to this URL to authenticate'
        })
    except FileNotFoundError:
        return jsonify({
            'error': 'Google OAuth credentials not found',
            'message': 'Please create client_secret.json file with your Google OAuth credentials'
        }), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/google-calendar/callback', methods=['GET'])
def google_calendar_callback():
    """Handle Google Calendar OAuth callback"""
    try:
        authorization_code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        
        # Check for OAuth errors from Google
        if error:
            return jsonify({
                'error': 'OAuth error',
                'message': error,
                'details': request.args.get('error_description', '')
            }), 400
        
        if not authorization_code:
            return jsonify({'error': 'Authorization code not provided'}), 400
        
        # Debug: Check session state
        session_state = session.get('oauth_state', 'NOT_FOUND')
        print(f"DEBUG: Session state: {session_state}, Received state: {state}")
        
        success = google_calendar.handle_callback(authorization_code, state)
        
        if success:
            # Redirect to frontend with success parameter
            frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:8000')
            return redirect(f'{frontend_url}?auth=success')
        else:
            # More detailed error message
            error_msg = 'Authentication failed'
            if session_state == 'NOT_FOUND':
                error_msg += ': Session state not found. This might be a session cookie issue.'
            elif session_state != state:
                error_msg += f': State mismatch. Expected {session_state}, got {state}'
            else:
                error_msg += ': Failed to exchange authorization code for token'
            
            return jsonify({
                'error': 'Authentication failed',
                'message': error_msg,
                'debug': {
                    'session_state': session_state,
                    'received_state': state,
                    'has_code': bool(authorization_code)
                }
            }), 400
    except Exception as e:
        import traceback
        print(f"Exception in callback: {traceback.format_exc()}")
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/google-calendar/sync', methods=['POST'])
def sync_google_calendar():
    """Sync events with Google Calendar"""
    try:
        # Check if authenticated
        if not google_calendar.is_authenticated():
            return jsonify({
                'error': 'Not authenticated with Google Calendar',
                'auth_required': True,
                'message': 'Please authenticate with Google Calendar first'
            }), 401
        
        data = request.json
        local_events = data.get('events', [])
        
        # Get all local events if none provided
        if not local_events:
            local_events = [event.to_dict() for event in events_store.values()]
        
        # Sync with Google Calendar
        result = google_calendar.sync_events(local_events)
        
        # Update local events with Google event IDs
        if result['status'] in ['success', 'partial']:
            for synced_event in result.get('synced_events', []):
                # Find matching local event and update with Google event ID
                google_event_id = synced_event.get('id')
                if google_event_id:
                    # Try to match by title and time (simplified matching)
                    for local_event in events_store.values():
                        if not local_event.google_event_id:
                            # Simple matching logic - can be improved
                            local_event.google_event_id = google_event_id
                            break
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/google-calendar/events', methods=['GET'])
def get_google_calendar_events():
    """Get events from Google Calendar"""
    try:
        if not google_calendar.is_authenticated():
            return jsonify({
                'error': 'Not authenticated with Google Calendar',
                'auth_required': True
            }), 401
        
        time_min = request.args.get('time_min')
        time_max = request.args.get('time_max')
        max_results = int(request.args.get('max_results', 100))
        
        events = google_calendar.get_events(
            max_results=max_results,
            time_min=time_min,
            time_max=time_max
        )
        
        return jsonify({'events': events})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/google-calendar/status', methods=['GET'])
def google_calendar_status():
    """Check Google Calendar authentication status"""
    is_authenticated = google_calendar.is_authenticated()
    return jsonify({
        'authenticated': is_authenticated,
        'message': 'Authenticated with Google Calendar' if is_authenticated else 'Not authenticated'
    })

# Task CRUD Operations

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """Get all tasks"""
    try:
        tasks = [task.to_dict() for task in tasks_store.values()]
        # Sort by priority (1 is highest) and then by deadline
        tasks.sort(key=lambda x: (x['priority'], x['deadline']))
        return jsonify({'tasks': tasks})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>', methods=['GET'])
def get_task(task_id):
    """Get a specific task"""
    try:
        if task_id not in tasks_store:
            return jsonify({'error': 'Task not found'}), 404
        
        task = tasks_store[task_id]
        return jsonify({'task': task.to_dict()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """Create a new task"""
    try:
        data = request.json
        
        if not data or not data.get('title') or not data.get('deadline') or not data.get('total_duration'):
            return jsonify({'error': 'Missing required fields: title, deadline, total_duration'}), 400
        
        # Validate priority
        priority = data.get('priority', 3)
        if priority < 1 or priority > 5:
            return jsonify({'error': 'Priority must be between 1 and 5'}), 400
        
        # Generate unique ID
        task_id = str(uuid.uuid4())
        
        # Create task
        task = Task(
            id=task_id,
            title=data['title'],
            deadline=data['deadline'],
            total_duration=int(data['total_duration']),
            chunking=data.get('chunking', False),
            chunking_max_duration=int(data['chunking_max_duration']) if data.get('chunking_max_duration') else None,
            chunking_min_duration=int(data['chunking_min_duration']) if data.get('chunking_min_duration') else None,
            priority=priority
        )
        
        tasks_store[task_id] = task
        
        return jsonify({'task': task.to_dict()}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    """Update an existing task"""
    try:
        if task_id not in tasks_store:
            return jsonify({'error': 'Task not found'}), 404
        
        data = request.json
        task = tasks_store[task_id]
        
        # Update task fields
        if 'title' in data:
            task.title = data['title']
        if 'deadline' in data:
            task.deadline = data['deadline']
        if 'total_duration' in data:
            task.total_duration = int(data['total_duration'])
        if 'chunking' in data:
            task.chunking = data['chunking']
        if 'chunking_max_duration' in data:
            task.chunking_max_duration = int(data['chunking_max_duration']) if data['chunking_max_duration'] else None
        if 'chunking_min_duration' in data:
            task.chunking_min_duration = int(data['chunking_min_duration']) if data['chunking_min_duration'] else None
        if 'priority' in data:
            priority = int(data['priority'])
            if priority < 1 or priority > 5:
                return jsonify({'error': 'Priority must be between 1 and 5'}), 400
            task.priority = priority
        
        tasks_store[task_id] = task
        
        return jsonify({'task': task.to_dict()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    try:
        if task_id not in tasks_store:
            return jsonify({'error': 'Task not found'}), 404
        
        # Delete associated events
        events_to_delete = [
            event_id for event_id, event in events_store.items()
            if hasattr(event, 'task_id') and event.task_id == task_id
        ]
        for event_id in events_to_delete:
            del events_store[event_id]
        
        # Delete from local store
        del tasks_store[task_id]
        
        return jsonify({'message': 'Task deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Auto-scheduling endpoint

@app.route('/api/schedule', methods=['POST'])
def auto_schedule():
    """Auto-schedule all tasks"""
    try:
        result = task_scheduler.schedule_all_tasks()
        return jsonify(result)
    except Exception as e:
        import traceback
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    app.run(debug=True, host='0.0.0.0', port=port)
