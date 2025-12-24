"""
Data models for calendar events
"""

from datetime import datetime
from typing import Optional, Dict, Any

class Event:
    """Calendar event model"""
    
    def __init__(self, id: str, title: str, start: str, end: str, 
                 description: Optional[str] = None, google_event_id: Optional[str] = None,
                 task_id: Optional[str] = None):
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.description = description or ''
        self.google_event_id = google_event_id
        self.task_id = task_id  # ID of the task this event belongs to
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary"""
        return {
            'id': self.id,
            'title': self.title,
            'start': self.start,
            'end': self.end,
            'description': self.description,
            'google_event_id': self.google_event_id,
            'task_id': getattr(self, 'task_id', None)
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Event':
        """Create event from dictionary"""
        return cls(
            id=data.get('id', ''),
            title=data.get('title', ''),
            start=data.get('start', ''),
            end=data.get('end', ''),
            description=data.get('description'),
            google_event_id=data.get('google_event_id'),
            task_id=data.get('task_id')
        )

class Task:
    """Task model"""
    
    def __init__(self, id: str, title: str, deadline: str, total_duration: int,
                 chunking: bool = False, chunking_max_duration: Optional[int] = None,
                 chunking_min_duration: Optional[int] = None, priority: int = 3,
                 completed: bool = False):
        self.id = id
        self.title = title
        self.deadline = deadline
        self.total_duration = total_duration  # in minutes
        self.chunking = chunking
        self.chunking_max_duration = chunking_max_duration  # in minutes
        self.chunking_min_duration = chunking_min_duration  # in minutes
        self.priority = priority  # 1-5, where 1 is highest priority
        self.completed = completed  # Whether the task is completed
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert task to dictionary"""
        return {
            'id': self.id,
            'title': self.title,
            'deadline': self.deadline,
            'total_duration': self.total_duration,
            'chunking': self.chunking,
            'chunking_max_duration': self.chunking_max_duration,
            'chunking_min_duration': self.chunking_min_duration,
            'priority': self.priority,
            'completed': self.completed
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Task':
        """Create task from dictionary"""
        return cls(
            id=data.get('id', ''),
            title=data.get('title', ''),
            deadline=data.get('deadline', ''),
            total_duration=data.get('total_duration', 0),
            chunking=data.get('chunking', False),
            chunking_max_duration=data.get('chunking_max_duration'),
            chunking_min_duration=data.get('chunking_min_duration'),
            priority=data.get('priority', 3),
            completed=data.get('completed', False)
        )

# In-memory storage (replace with database in production)
events_store: Dict[str, Event] = {}
tasks_store: Dict[str, Task] = {}

