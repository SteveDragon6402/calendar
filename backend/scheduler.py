"""
Auto-scheduling service for tasks
Schedules tasks between 9 AM and 5 PM based on priority and deadlines
"""

from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional
from models import Task, Event, events_store, tasks_store


class TaskScheduler:
    """Service for auto-scheduling tasks"""
    
    WORK_START_HOUR = 9  # 9 AM
    WORK_END_HOUR = 17   # 5 PM
    
    def __init__(self):
        pass
    
    def schedule_all_tasks(self) -> Dict:
        """
        Schedule all tasks according to priority rules
        
        Returns:
            Dictionary with scheduling results
        """
        # Get all tasks and existing events
        tasks = list(tasks_store.values())
        existing_events = list(events_store.values())
        
        if not tasks:
            return {
                'status': 'success',
                'message': 'No tasks to schedule',
                'scheduled_events': []
            }
        
        # Sort tasks according to priority rules
        sorted_tasks = self._sort_tasks(tasks)
        
        # Get existing events that are NOT task-related (to avoid clashes)
        # We'll track task events separately
        non_task_events = [e for e in existing_events if not getattr(e, 'task_id', None)]
        
        # Delete old task-related events (we'll reschedule everything)
        task_event_ids = [e.id for e in existing_events if getattr(e, 'task_id', None)]
        for event_id in task_event_ids:
            if event_id in events_store:
                del events_store[event_id]
        
        scheduled_events = []
        errors = []
        
        # Schedule each task
        for task in sorted_tasks:
            try:
                events = self._schedule_task(task, non_task_events + scheduled_events)
                scheduled_events.extend(events)
            except Exception as e:
                errors.append({
                    'task_id': task.id,
                    'task_title': task.title,
                    'error': str(e)
                })
        
        return {
            'status': 'success' if not errors else 'partial',
            'scheduled_events': [e.to_dict() for e in scheduled_events],
            'errors': errors,
            'total_tasks': len(tasks),
            'successfully_scheduled': len(tasks) - len(errors)
        }
    
    def _sort_tasks(self, tasks: List[Task]) -> List[Task]:
        """
        Sort tasks according to priority rules:
        1. Meeting deadlines is most important
        2. If deadline will be missed, prioritize higher priority deadlines
        3. If both deadlines can be met, schedule earlier deadline first
        4. If same deadline, schedule higher priority first
        """
        now = datetime.now()
        
        def task_sort_key(task: Task) -> Tuple:
            deadline = datetime.fromisoformat(task.deadline.replace('Z', '+00:00'))
            if deadline.tzinfo:
                deadline = deadline.replace(tzinfo=None)
            
            # Calculate if deadline can be met (rough estimate)
            # We'll check this more precisely during scheduling
            time_until_deadline = (deadline - now).total_seconds() / 60  # minutes
            can_meet_deadline = time_until_deadline >= task.total_duration
            
            # Sort key: (can_meet_deadline, priority, deadline)
            # can_meet_deadline: False (0) comes before True (1) - prioritize tasks that can meet deadline
            # priority: lower number = higher priority (1 is highest)
            # deadline: earlier deadline comes first
            
            return (
                0 if can_meet_deadline else 1,  # Tasks that can meet deadline first
                task.priority,  # Lower priority number = higher priority
                deadline  # Earlier deadline first
            )
        
        return sorted(tasks, key=task_sort_key)
    
    def _schedule_task(self, task: Task, existing_events: List[Event]) -> List[Event]:
        """
        Schedule a single task, handling chunking if enabled
        
        Args:
            task: Task to schedule
            existing_events: List of existing events to avoid clashes
            
        Returns:
            List of created Event objects
        """
        # Parse deadline, handling timezone
        deadline_str = task.deadline.replace('Z', '+00:00') if task.deadline.endswith('Z') else task.deadline
        try:
            deadline = datetime.fromisoformat(deadline_str)
        except ValueError:
            # Try parsing without timezone
            deadline = datetime.fromisoformat(task.deadline.replace('Z', ''))
        
        if deadline.tzinfo:
            deadline = deadline.replace(tzinfo=None)
        
        now = datetime.now()
        start_date = now.date()
        
        # If task has chunking enabled, split into chunks
        if task.chunking:
            chunks = self._split_into_chunks(task)
        else:
            chunks = [task.total_duration]
        
        scheduled_events = []
        remaining_chunks = list(enumerate(chunks))  # Store (index, duration) tuples
        total_chunks = len(chunks)
        
        # Try to schedule all chunks before the deadline
        current_date = start_date
        
        while remaining_chunks and current_date <= deadline.date():
            # Get available time slots for this day
            free_slots = self._get_free_slots(current_date, existing_events + scheduled_events)
            
            # Try to schedule chunks in available slots
            chunks_to_remove = []
            for chunk_idx, chunk_duration in remaining_chunks:
                slot = self._find_suitable_slot(free_slots, chunk_duration, deadline)
                if slot:
                    # Create event for this chunk
                    event = self._create_task_event(
                        task,
                        slot[0],
                        slot[1],
                        chunk_index=chunk_idx if total_chunks > 1 else None,
                        total_chunks=total_chunks if total_chunks > 1 else None
                    )
                    scheduled_events.append(event)
                    events_store[event.id] = event
                    
                    # Update free slots
                    free_slots = self._remove_slot(free_slots, slot)
                    chunks_to_remove.append((chunk_idx, chunk_duration))
            
            # Remove scheduled chunks
            for chunk_tuple in chunks_to_remove:
                remaining_chunks.remove(chunk_tuple)
            
            # Move to next day if we still have chunks
            if remaining_chunks:
                current_date += timedelta(days=1)
        
        # If we couldn't schedule all chunks, schedule what we can
        # (This handles the case where deadline might be missed)
        if remaining_chunks:
            # Try to schedule remaining chunks even if past deadline
            # This follows rule 2: prioritize higher priority deadlines even if missed
            current_date = deadline.date() + timedelta(days=1)
            max_future_days = 30  # Don't schedule too far in the future
            
            for _ in range(max_future_days):
                free_slots = self._get_free_slots(current_date, existing_events + scheduled_events)
                
                chunks_to_remove = []
                for chunk_idx, chunk_duration in remaining_chunks:
                    slot = self._find_suitable_slot(free_slots, chunk_duration, None)
                    if slot:
                        event = self._create_task_event(
                            task,
                            slot[0],
                            slot[1],
                            chunk_index=chunk_idx if total_chunks > 1 else None,
                            total_chunks=total_chunks if total_chunks > 1 else None
                        )
                        scheduled_events.append(event)
                        events_store[event.id] = event
                        free_slots = self._remove_slot(free_slots, slot)
                        chunks_to_remove.append((chunk_idx, chunk_duration))
                
                for chunk_tuple in chunks_to_remove:
                    remaining_chunks.remove(chunk_tuple)
                
                if not remaining_chunks:
                    break
                
                current_date += timedelta(days=1)
        
        return scheduled_events
    
    def _split_into_chunks(self, task: Task) -> List[int]:
        """
        Split task duration into chunks based on chunking settings
        
        Returns:
            List of chunk durations in minutes
        """
        total = task.total_duration
        max_chunk = task.chunking_max_duration or total
        min_chunk = task.chunking_min_duration or 30
        
        chunks = []
        remaining = total
        
        while remaining > 0:
            if remaining <= max_chunk:
                chunks.append(remaining)
                break
            else:
                chunk_size = max(min_chunk, min(max_chunk, remaining // 2))
                chunks.append(chunk_size)
                remaining -= chunk_size
        
        return chunks
    
    def _get_free_slots(self, date: datetime.date, existing_events: List[Event]) -> List[Tuple[datetime, datetime]]:
        """
        Get free time slots for a given date (9 AM - 5 PM)
        
        Args:
            date: Date to get slots for
            existing_events: List of existing events to avoid
            
        Returns:
            List of (start, end) tuples for free slots
        """
        # Start and end of work day
        day_start = datetime.combine(date, datetime.min.time().replace(hour=self.WORK_START_HOUR))
        day_end = datetime.combine(date, datetime.min.time().replace(hour=self.WORK_END_HOUR))
        
        # Get events for this day
        day_events = []
        for event in existing_events:
            # Parse event start time
            event_start_str = event.start.replace('Z', '+00:00') if event.start.endswith('Z') else event.start
            try:
                event_start = datetime.fromisoformat(event_start_str)
            except ValueError:
                event_start = datetime.fromisoformat(event.start.replace('Z', ''))
            
            if event_start.tzinfo:
                event_start = event_start.replace(tzinfo=None)
            
            if event_start.date() == date:
                # Parse event end time
                event_end_str = event.end.replace('Z', '+00:00') if event.end.endswith('Z') else event.end
                try:
                    event_end = datetime.fromisoformat(event_end_str)
                except ValueError:
                    event_end = datetime.fromisoformat(event.end.replace('Z', ''))
                
                if event_end.tzinfo:
                    event_end = event_end.replace(tzinfo=None)
                day_events.append((event_start, event_end))
        
        # Sort events by start time
        day_events.sort(key=lambda x: x[0])
        
        # Find free slots
        free_slots = []
        current_time = day_start
        
        for event_start, event_end in day_events:
            if current_time < event_start:
                # Free slot before this event
                free_slots.append((current_time, min(event_start, day_end)))
            current_time = max(current_time, event_end)
        
        # Add remaining free time until end of day
        if current_time < day_end:
            free_slots.append((current_time, day_end))
        
        return free_slots
    
    def _find_suitable_slot(self, free_slots: List[Tuple[datetime, datetime]], 
                           duration_minutes: int, deadline: Optional[datetime]) -> Optional[Tuple[datetime, datetime]]:
        """
        Find a suitable time slot for a given duration
        
        Args:
            free_slots: List of available time slots
            duration_minutes: Duration needed in minutes
            deadline: Optional deadline to prefer slots before this time
            
        Returns:
            (start, end) tuple if suitable slot found, None otherwise
        """
        duration_timedelta = timedelta(minutes=duration_minutes)
        
        # Filter slots that are large enough
        suitable_slots = [
            slot for slot in free_slots
            if (slot[1] - slot[0]) >= duration_timedelta
        ]
        
        if not suitable_slots:
            return None
        
        # If deadline is provided, prefer slots before deadline
        if deadline:
            before_deadline = [s for s in suitable_slots if s[0] < deadline]
            if before_deadline:
                suitable_slots = before_deadline
        
        # Return the earliest suitable slot
        suitable_slots.sort(key=lambda x: x[0])
        slot = suitable_slots[0]
        
        # Return slot with exact duration
        return (slot[0], slot[0] + duration_timedelta)
    
    def _remove_slot(self, free_slots: List[Tuple[datetime, datetime]], 
                    used_slot: Tuple[datetime, datetime]) -> List[Tuple[datetime, datetime]]:
        """
        Remove a used slot from free slots, potentially splitting remaining slots
        
        Args:
            free_slots: List of free slots
            used_slot: Slot that was used (start, end)
            
        Returns:
            Updated list of free slots
        """
        updated_slots = []
        
        for slot in free_slots:
            slot_start, slot_end = slot
            used_start, used_end = used_slot
            
            # If slots don't overlap, keep the original slot
            if slot_end <= used_start or slot_start >= used_end:
                updated_slots.append(slot)
            else:
                # Slots overlap, split if necessary
                if slot_start < used_start:
                    updated_slots.append((slot_start, used_start))
                if slot_end > used_end:
                    updated_slots.append((used_end, slot_end))
        
        return updated_slots
    
    def _create_task_event(self, task: Task, start: datetime, end: datetime,
                          chunk_index: Optional[int] = None, 
                          total_chunks: Optional[int] = None) -> Event:
        """
        Create a calendar event for a task (or task chunk)
        
        Args:
            task: Task to create event for
            start: Start datetime
            end: End datetime
            chunk_index: Optional chunk index (if task is chunked)
            total_chunks: Optional total number of chunks
            
        Returns:
            Created Event object
        """
        import uuid
        
        # Format title
        if chunk_index is not None and total_chunks:
            title = f"{task.title} ({chunk_index + 1}/{total_chunks})"
        else:
            title = task.title
        
        # Format description
        description = f"Task: {task.title}\n"
        description += f"Deadline: {task.deadline}\n"
        description += f"Priority: {task.priority}"
        if chunk_index is not None:
            description += f"\nChunk {chunk_index + 1} of {total_chunks}"
        
        # Create event
        event_id = str(uuid.uuid4())
        event = Event(
            id=event_id,
            title=title,
            start=start.isoformat(),
            end=end.isoformat(),
            description=description
        )
        
        # Store task_id as attribute (we'll need to update Event model)
        event.task_id = task.id
        
        return event

