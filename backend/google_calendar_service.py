"""
Google Calendar Service
Handles integration with Google Calendar API
"""

import os
import json
from datetime import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from flask import session, redirect, url_for

# Google Calendar API scopes
SCOPES = ['https://www.googleapis.com/auth/calendar']
CLIENT_SECRETS_FILE = 'client_secret.json'

class GoogleCalendarService:
    """Service for interacting with Google Calendar API"""
    
    def __init__(self):
        self.credentials = None
        self.service = None
    
    def _get_client_config(self):
        """
        Get OAuth client configuration from file or environment variables
        
        Returns:
            Dictionary with client configuration
        """
        # Try to load from JSON file first
        if os.path.exists(CLIENT_SECRETS_FILE):
            with open(CLIENT_SECRETS_FILE, 'r') as f:
                return json.load(f)
        
        # Fall back to environment variables
        client_id = os.environ.get('GOOGLE_CLIENT_ID')
        client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
        
        if client_id and client_secret:
            return {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:5002/api/google-calendar/callback')]
                }
            }
        
        raise FileNotFoundError(
            f"OAuth credentials not found. Either create {CLIENT_SECRETS_FILE} or set "
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )
    
    def get_authorization_url(self):
        """
        Get Google OAuth authorization URL
        
        Returns:
            Authorization URL string
        """
        client_config = self._get_client_config()
        redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:5002/api/google-calendar/callback')
        
        # Handle both JSON file format and direct config
        if 'web' in client_config:
            client_info = client_config['web']
        else:
            client_info = client_config
        
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )
        
        # Store state in session for verification
        if 'oauth_state' not in session:
            session['oauth_state'] = state
        
        return authorization_url
    
    def handle_callback(self, authorization_code, state):
        """
        Handle OAuth callback and exchange code for credentials
        
        Args:
            authorization_code: Authorization code from Google
            state: State parameter for verification
        
        Returns:
            True if successful, False otherwise
        """
        # Verify state - be more lenient in development (state might not persist in session)
        session_state = session.get('oauth_state')
        if session_state and session_state != state:
            print(f"State mismatch: session has {session_state}, received {state}")
            return False
        
        # If no session state, we'll proceed anyway (for development)
        # In production, you should always verify state
        
        try:
            client_config = self._get_client_config()
            redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:5002/api/google-calendar/callback')
            
            flow = Flow.from_client_config(
                client_config,
                scopes=SCOPES,
                redirect_uri=redirect_uri
            )
            
            flow.fetch_token(code=authorization_code)
            credentials = flow.credentials
            
            # Store credentials in session (in production, store securely in database)
            session['google_credentials'] = {
                'token': credentials.token,
                'refresh_token': credentials.refresh_token,
                'token_uri': credentials.token_uri,
                'client_id': credentials.client_id,
                'client_secret': credentials.client_secret,
                'scopes': credentials.scopes
            }
            
            # Clear the OAuth state after successful authentication
            if 'oauth_state' in session:
                del session['oauth_state']
            
            self.credentials = credentials
            self.service = build('calendar', 'v3', credentials=credentials)
            
            return True
        except Exception as e:
            import traceback
            print(f"Error handling OAuth callback: {e}")
            print(f"Traceback: {traceback.format_exc()}")
            return False
    
    def load_credentials_from_session(self):
        """
        Load credentials from session and build service
        
        Returns:
            True if credentials loaded successfully
        """
        if 'google_credentials' not in session:
            return False
        
        try:
            creds_data = session['google_credentials']
            self.credentials = Credentials(
                token=creds_data['token'],
                refresh_token=creds_data.get('refresh_token'),
                token_uri=creds_data['token_uri'],
                client_id=creds_data['client_id'],
                client_secret=creds_data['client_secret'],
                scopes=creds_data['scopes']
            )
            
            # Refresh token if expired
            if self.credentials.expired and self.credentials.refresh_token:
                try:
                    from google.auth.transport.requests import Request as GoogleRequest
                    self.credentials.refresh(GoogleRequest())
                except Exception as e:
                    print(f"Error refreshing token: {e}")
            
            self.service = build('calendar', 'v3', credentials=self.credentials)
            return True
        except Exception as e:
            print(f"Error loading credentials: {e}")
            return False
    
    def is_authenticated(self):
        """Check if user is authenticated with Google Calendar"""
        return self.load_credentials_from_session()
    
    def get_events(self, calendar_id='primary', max_results=100, time_min=None, time_max=None):
        """
        Retrieve events from Google Calendar
        
        Args:
            calendar_id: Calendar ID (default: 'primary')
            max_results: Maximum number of events to retrieve
            time_min: Lower bound (exclusive) for an event's end time
            time_max: Upper bound (exclusive) for an event's start time
        
        Returns:
            List of calendar events
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated with Google Calendar")
        
        try:
            events_result = self.service.events().list(
                calendarId=calendar_id,
                maxResults=max_results,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            return events
        except HttpError as error:
            print(f"An error occurred: {error}")
            raise
    
    def create_event(self, calendar_id='primary', event_data=None):
        """
        Create a new event in Google Calendar
        
        Args:
            calendar_id: Calendar ID (default: 'primary')
            event_data: Dictionary containing event details
        
        Returns:
            Created event object
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated with Google Calendar")
        
        if not event_data:
            raise ValueError("Event data is required")
        
        try:
            # Format event for Google Calendar API
            google_event = {
                'summary': event_data.get('title', 'Untitled Event'),
                'description': event_data.get('description', ''),
                'start': {
                    'dateTime': event_data['start'],
                    'timeZone': 'UTC',
                },
                'end': {
                    'dateTime': event_data['end'],
                    'timeZone': 'UTC',
                },
            }
            
            created_event = self.service.events().insert(
                calendarId=calendar_id,
                body=google_event
            ).execute()
            
            return created_event
        except HttpError as error:
            print(f"An error occurred: {error}")
            raise
    
    def update_event(self, calendar_id='primary', event_id=None, event_data=None):
        """
        Update an existing event in Google Calendar
        
        Args:
            calendar_id: Calendar ID (default: 'primary')
            event_id: Google Calendar event ID
            event_data: Dictionary containing updated event details
        
        Returns:
            Updated event object
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated with Google Calendar")
        
        if not event_id:
            raise ValueError("Event ID is required")
        
        try:
            # Get existing event
            event = self.service.events().get(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
            
            # Update event fields
            if 'title' in event_data:
                event['summary'] = event_data['title']
            if 'description' in event_data:
                event['description'] = event_data['description']
            if 'start' in event_data:
                event['start'] = {
                    'dateTime': event_data['start'],
                    'timeZone': 'UTC',
                }
            if 'end' in event_data:
                event['end'] = {
                    'dateTime': event_data['end'],
                    'timeZone': 'UTC',
                }
            
            updated_event = self.service.events().update(
                calendarId=calendar_id,
                eventId=event_id,
                body=event
            ).execute()
            
            return updated_event
        except HttpError as error:
            print(f"An error occurred: {error}")
            raise
    
    def delete_event(self, calendar_id='primary', event_id=None):
        """
        Delete an event from Google Calendar
        
        Args:
            calendar_id: Calendar ID (default: 'primary')
            event_id: Google Calendar event ID
        
        Returns:
            True if successful
        """
        if not self.is_authenticated():
            raise Exception("Not authenticated with Google Calendar")
        
        if not event_id:
            raise ValueError("Event ID is required")
        
        try:
            self.service.events().delete(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
            return True
        except HttpError as error:
            print(f"An error occurred: {error}")
            raise
    
    def sync_events(self, local_events):
        """
        Sync local events with Google Calendar
        
        Args:
            local_events: List of local calendar events
        
        Returns:
            Sync result with status and synced events
        """
        if not self.is_authenticated():
            return {
                'status': 'error',
                'message': 'Not authenticated with Google Calendar',
                'auth_required': True
            }
        
        synced_events = []
        errors = []
        
        for local_event in local_events:
            try:
                if local_event.get('google_event_id'):
                    # Update existing event
                    updated = self.update_event(
                        event_id=local_event['google_event_id'],
                        event_data=local_event
                    )
                    synced_events.append(updated)
                else:
                    # Create new event
                    created = self.create_event(event_data=local_event)
                    synced_events.append(created)
            except Exception as e:
                errors.append({
                    'event': local_event.get('title', 'Unknown'),
                    'error': str(e)
                })
        
        return {
            'status': 'success' if not errors else 'partial',
            'synced_events': synced_events,
            'errors': errors
        }

# Import Request for token refresh
from google.auth.transport.requests import Request
