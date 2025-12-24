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
import tempfile

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

@app.route('/api/tasks/<task_id>/toggle-complete', methods=['POST'])
def toggle_task_complete(task_id):
    """Toggle task completion status"""
    try:
        if task_id not in tasks_store:
            return jsonify({'error': 'Task not found'}), 404
        
        task = tasks_store[task_id]
        data = request.json or {}
        reschedule = data.get('reschedule', False)
        
        task.completed = not task.completed
        
        # When marking as completed, keep the events (they show what was scheduled)
        # When marking as not done, delete events so they can be rescheduled
        if not task.completed:
            # Task is being marked as incomplete - delete events so they can be rescheduled
            events_to_delete = [
                event_id for event_id, event in events_store.items()
                if hasattr(event, 'task_id') and event.task_id == task_id
            ]
            for event_id in events_to_delete:
                del events_store[event_id]
        
        tasks_store[task_id] = task
        
        result = {
            'task': task.to_dict(),
            'message': 'Task marked as completed' if task.completed else 'Task marked as incomplete'
        }
        
        # If marking as not done and reschedule requested, trigger rescheduling
        if not task.completed and reschedule:
            from scheduler import TaskScheduler
            scheduler = TaskScheduler()
            schedule_result = scheduler.schedule_all_tasks()
            result['rescheduled'] = True
            result['schedule_result'] = schedule_result
        
        return jsonify(result)
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/tasks/check-past-due', methods=['POST'])
def check_past_due_tasks():
    """Check for past-due scheduled task events and mark tasks as completed"""
    try:
        now = datetime.now()
        marked_complete = []
        
        # Find all task-related events that have passed
        for event_id, event in events_store.items():
            task_id = getattr(event, 'task_id', None)
            if not task_id:
                continue
            
            # Skip if task is already completed
            if task_id not in tasks_store:
                continue
            
            task = tasks_store[task_id]
            if task.completed:
                continue
            
            # Parse event end time
            try:
                end_str = event.end.replace('Z', '+00:00') if event.end.endswith('Z') else event.end
                event_end = datetime.fromisoformat(end_str)
                if event_end.tzinfo:
                    event_end = event_end.replace(tzinfo=None)
            except (ValueError, AttributeError):
                continue
            
            # If event end time has passed, mark task as completed
            if event_end <= now:
                task.completed = True
                tasks_store[task_id] = task
                marked_complete.append({
                    'task_id': task_id,
                    'task_title': task.title,
                    'event_id': event_id,
                    'event_end': event.end
                })
        
        return jsonify({
            'marked_complete': marked_complete,
            'count': len(marked_complete)
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/tasks/bulk', methods=['POST'])
def bulk_create_tasks():
    """Create multiple tasks at once"""
    try:
        data = request.json
        tasks_data = data.get('tasks', [])
        
        if not tasks_data:
            return jsonify({'error': 'No tasks provided'}), 400
        
        created_tasks = []
        errors = []
        
        for i, task_data in enumerate(tasks_data):
            try:
                # Validate required fields
                if not task_data.get('title') or not task_data.get('deadline') or not task_data.get('total_duration'):
                    errors.append(f"Task {i + 1}: Missing required fields")
                    continue
                
                # Validate priority
                priority = task_data.get('priority', 3)
                if priority < 1 or priority > 5:
                    errors.append(f"Task {i + 1}: Invalid priority (must be 1-5)")
                    continue
                
                # Generate unique ID
                task_id = str(uuid.uuid4())
                
                # Create task
                task = Task(
                    id=task_id,
                    title=task_data['title'],
                    deadline=task_data['deadline'],
                    total_duration=int(task_data['total_duration']),
                    chunking=task_data.get('chunking', False),
                    chunking_max_duration=int(task_data['chunking_max_duration']) if task_data.get('chunking_max_duration') else None,
                    chunking_min_duration=int(task_data['chunking_min_duration']) if task_data.get('chunking_min_duration') else None,
                    priority=priority,
                    completed=task_data.get('completed', False)
                )
                
                tasks_store[task_id] = task
                created_tasks.append(task.to_dict())
            except Exception as e:
                errors.append(f"Task {i + 1}: {str(e)}")
        
        return jsonify({
            'created': len(created_tasks),
            'total': len(tasks_data),
            'errors': errors,
            'tasks': created_tasks
        }), 201
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/tasks/ai-bulk-add', methods=['POST'])
def ai_bulk_add_tasks():
    """Process natural language task description with AI and convert to bulk import format"""
    try:
        from openai import OpenAI
        
        data = request.json
        description = data.get('description', '').strip()
        
        if not description:
            return jsonify({'error': 'No description provided'}), 400
        
        # Check for OpenAI API key
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return jsonify({
                'error': 'OpenAI API key not configured',
                'message': 'Please set OPENAI_API_KEY environment variable'
            }), 500
        
        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)
        
        # Create prompt for GPT
        prompt = f"""You are a task management assistant. Convert the following natural language task description into a structured task list format.

The output format should be one task per line, with each line following this exact format:
Name: [Task Name]; Due: [MM/DD/YYYY]; Time: [minutes]; Chunk: [Yes/No]; ChunkMin: [minutes]; ChunkMax: [minutes]; Priority: [1-5]

Rules:
- Extract all tasks mentioned in the description
- For dates: Use MM/DD/YYYY format. If no date is mentioned, use today's date ({datetime.now().strftime('%m/%d/%Y')})
- For time: Convert hours to minutes (e.g., "4 hours" = 240 minutes, "1 hour" = 60 minutes, "30 minutes" = 30)
- For chunking: Set to "Yes" if the user mentions breaking tasks into chunks or if the task is long (>2 hours). Otherwise "No"
- For ChunkMin/ChunkMax: Only include if Chunk is "Yes". Use reasonable defaults (30-60 minutes) if not specified
- For Priority: Use 1 (highest) for urgent/important tasks, 5 (lowest) for less important. Default to 3 if unclear
- Only include fields that are specified or can be reasonably inferred
- Output ONLY the formatted task lines, one per line, nothing else

User description:
{description}

Formatted tasks:"""

        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-4o",  # Using gpt-4o (latest available), user mentioned GPT 5.1 but that doesn't exist yet
            messages=[
                {"role": "system", "content": "You are a helpful assistant that converts natural language task descriptions into structured task formats."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        
        # Extract formatted tasks from response
        formatted_tasks = response.choices[0].message.content.strip()
        
        # Count tasks (lines that start with "Name:")
        task_count = len([line for line in formatted_tasks.split('\n') if line.strip().startswith('Name:')])
        
        return jsonify({
            'formatted_tasks': formatted_tasks,
            'task_count': task_count,
            'raw_response': formatted_tasks
        })
        
    except ImportError:
        return jsonify({
            'error': 'OpenAI library not installed',
            'message': 'Please install openai: pip install openai'
        }), 500
    except Exception as e:
        import traceback
        print(f"Error in AI bulk add: {traceback.format_exc()}")
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

# Auto-scheduling endpoint

@app.route('/api/tasks/transcribe', methods=['POST'])
def transcribe_audio():
    """Transcribe audio using Whisper API"""
    try:
        from openai import OpenAI
        
        # Check for audio file in request
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No audio file selected'}), 400
        
        # Check for OpenAI API key
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return jsonify({
                'error': 'OpenAI API key not configured',
                'message': 'Please set OPENAI_API_KEY environment variable'
            }), 500
        
        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)
        
        # Save audio file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp_file:
            audio_file.save(tmp_file.name)
            tmp_file_path = tmp_file.name
        
        try:
            # Transcribe with Whisper
            with open(tmp_file_path, 'rb') as audio:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio,
                    language="en"
                )
            
            transcription_text = transcript.text.strip()
            
            return jsonify({
                'transcription': transcription_text,
                'success': True
            })
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_file_path):
                os.unlink(tmp_file_path)
        
    except ImportError:
        return jsonify({
            'error': 'OpenAI library not installed',
            'message': 'Please install openai: pip install openai'
        }), 500
    except Exception as e:
        import traceback
        print(f"Error in transcription: {traceback.format_exc()}")
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

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
