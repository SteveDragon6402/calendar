/**
 * Calendar Plugin
 * In-app calendar component for displaying and managing calendar events
 */

class CalendarPlugin {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      defaultView: 'month',
      apiBaseUrl: options.apiBaseUrl || 'http://localhost:5002/api',
      ...options
    };
    this.currentDate = new Date();
    this.currentView = this.options.defaultView;
    this.events = [];
    this.selectedEvent = null;
  }

  /**
   * Initialize the calendar
   */
  async init() {
    if (!this.container) {
      console.error('Calendar container not found');
      return;
    }
    await this.loadEvents();
    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the calendar view
   */
  render() {
    const calendarHTML = `
      <div class="calendar-wrapper">
        <div class="calendar-header">
          <div class="calendar-controls">
            <button class="btn-nav" id="prev-month">&lt;</button>
            <h2 class="calendar-title" id="calendar-title">${this.getMonthYearString()}</h2>
            <button class="btn-nav" id="next-month">&gt;</button>
          </div>
          <div class="view-selector">
            <button class="btn-view ${this.currentView === 'month' ? 'active' : ''}" data-view="month">Month</button>
            <button class="btn-view ${this.currentView === 'week' ? 'active' : ''}" data-view="week">Week</button>
            <button class="btn-view ${this.currentView === 'day' ? 'active' : ''}" data-view="day">Day</button>
          </div>
          <div class="calendar-actions">
            <button class="btn-primary" id="btn-new-event">+ New Event</button>
            <button class="btn-sync" id="btn-sync-google">Sync Google Calendar</button>
          </div>
        </div>
        <div class="calendar-body" id="calendar-body">
          ${this.renderCalendarView()}
        </div>
      </div>
      ${this.renderEventModal()}
    `;
    this.container.innerHTML = calendarHTML;
  }

  /**
   * Render calendar view based on current view mode
   */
  renderCalendarView() {
    switch (this.currentView) {
      case 'month':
        return this.renderMonthView();
      case 'week':
        return this.renderWeekView();
      case 'day':
        return this.renderDayView();
      default:
        return this.renderMonthView();
    }
  }

  /**
   * Render month view
   */
  renderMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    const days = [];
    const currentDate = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`Rendering month view for ${year}-${month + 1}, ${this.events.length} total events`);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    let html = '<div class="month-view">';
    html += '<div class="calendar-weekdays">';
    dayNames.forEach(day => {
      html += `<div class="weekday">${day}</div>`;
    });
    html += '</div>';
    html += '<div class="calendar-days">';
    
    days.forEach((day, index) => {
      const isCurrentMonth = day.getMonth() === month;
      const isToday = this.isToday(day);
      const dayEvents = this.getEventsForDay(day);
      const dateStr = this.formatDate(day);
      
      html += `<div class="calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}" 
                      data-date="${dateStr}">`;
      html += `<div class="day-number">${day.getDate()}</div>`;
      html += '<div class="day-events">';
      dayEvents.slice(0, 3).forEach(event => {
        html += `<div class="event-item" data-event-id="${event.id}" title="${event.title}">${event.title}</div>`;
      });
      if (dayEvents.length > 3) {
        html += `<div class="event-more">+${dayEvents.length - 3} more</div>`;
      }
      html += '</div></div>';
    });
    
    html += '</div></div>';
    return html;
  }

  /**
   * Render week view
   */
  renderWeekView() {
    const weekStart = this.getWeekStart(this.currentDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    let html = '<div class="week-view">';
    html += '<div class="week-header">';
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dayEvents = this.getEventsForDay(day);
      const isToday = this.isToday(day);
      
      html += `<div class="week-day-header ${isToday ? 'today' : ''}">`;
      html += `<div class="week-day-name">${dayNames[i]}</div>`;
      html += `<div class="week-day-date">${day.getDate()}</div>`;
      html += `<div class="week-day-events">`;
      dayEvents.forEach(event => {
        html += `<div class="event-item" data-event-id="${event.id}">`;
        html += `<div class="event-time">${this.formatTime(event.start)}</div>`;
        html += `<div class="event-title">${event.title}</div>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    }
    
    html += '</div></div>';
    return html;
  }

  /**
   * Render day view
   */
  renderDayView() {
    const dayEvents = this.getEventsForDay(this.currentDate);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    let html = '<div class="day-view">';
    html += `<div class="day-header">${this.getDayString(this.currentDate)}</div>`;
    html += '<div class="day-time-slots">';
    
    hours.forEach(hour => {
      const hourEvents = dayEvents.filter(event => {
        const eventHour = new Date(event.start).getHours();
        return eventHour === hour;
      });
      
      html += `<div class="time-slot">`;
      html += `<div class="time-label">${this.formatHour(hour)}</div>`;
      html += `<div class="time-content">`;
      hourEvents.forEach(event => {
        html += `<div class="event-item" data-event-id="${event.id}">`;
        html += `<div class="event-time">${this.formatTime(event.start)} - ${this.formatTime(event.end)}</div>`;
        html += `<div class="event-title">${event.title}</div>`;
        if (event.description) {
          html += `<div class="event-description">${event.description}</div>`;
        }
        html += `</div>`;
      });
      html += `</div></div>`;
    });
    
    html += '</div></div>';
    return html;
  }

  /**
   * Render event modal
   */
  renderEventModal() {
    return `
      <div class="modal" id="event-modal" style="display: none;">
        <div class="modal-content">
          <span class="modal-close" id="modal-close">&times;</span>
          <h2 id="modal-title">${this.selectedEvent ? 'Edit Event' : 'New Event'}</h2>
          <form id="event-form">
            <div class="form-group">
              <label for="event-title">Title</label>
              <input type="text" id="event-title" required>
            </div>
            <div class="form-group">
              <label for="event-start">Start</label>
              <input type="datetime-local" id="event-start" required>
            </div>
            <div class="form-group">
              <label for="event-end">End</label>
              <input type="datetime-local" id="event-end" required>
            </div>
            <div class="form-group">
              <label for="event-description">Description</label>
              <textarea id="event-description" rows="3"></textarea>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-secondary" id="btn-cancel">Cancel</button>
              <button type="button" class="btn-danger" id="btn-delete" style="${this.selectedEvent ? '' : 'display: none;'}">Delete</button>
              <button type="submit" class="btn-primary">${this.selectedEvent ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Navigation
    document.getElementById('prev-month')?.addEventListener('click', () => this.navigate(-1));
    document.getElementById('next-month')?.addEventListener('click', () => this.navigate(1));
    
    // View selector
    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentView = e.target.dataset.view;
        this.render();
        this.attachEventListeners();
      });
    });
    
    // New event button
    document.getElementById('btn-new-event')?.addEventListener('click', () => {
      this.selectedEvent = null;
      this.openEventModal();
    });
    
    // Sync Google Calendar
    document.getElementById('btn-sync-google')?.addEventListener('click', () => {
      this.syncWithGoogleCalendar();
    });
    
    // Calendar day clicks
    document.querySelectorAll('.calendar-day').forEach(day => {
      day.addEventListener('click', (e) => {
        if (!e.target.classList.contains('event-item')) {
          const date = e.currentTarget.dataset.date;
          this.selectedEvent = null;
          this.openEventModal(date);
        }
      });
    });
    
    // Event item clicks
    document.querySelectorAll('.event-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const eventId = e.currentTarget.dataset.eventId;
        await this.loadEventDetails(eventId);
      });
    });
    
    // Modal controls
    document.getElementById('modal-close')?.addEventListener('click', () => this.closeEventModal());
    document.getElementById('btn-cancel')?.addEventListener('click', () => this.closeEventModal());
    document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteEvent());
    document.getElementById('event-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveEvent();
    });
  }

  /**
   * Navigate calendar
   */
  navigate(direction) {
    if (this.currentView === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() + direction);
    } else if (this.currentView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
    } else {
      this.currentDate.setDate(this.currentDate.getDate() + direction);
    }
    this.render();
    this.attachEventListeners();
  }

  /**
   * Load events from the backend API
   */
  async loadEvents() {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/events`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this.events = data.events || [];
      console.log(`Loaded ${this.events.length} events:`, this.events);
    } catch (error) {
      console.error('Error loading events:', error);
      this.events = [];
    }
  }

  /**
   * Load event details
   */
  async loadEventDetails(eventId) {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/events/${eventId}`);
      const data = await response.json();
      this.selectedEvent = data.event;
      this.openEventModal();
    } catch (error) {
      console.error('Error loading event details:', error);
    }
  }

  /**
   * Save event (create or update)
   */
  async saveEvent() {
    const title = document.getElementById('event-title').value.trim();
    const startInput = document.getElementById('event-start').value;
    const endInput = document.getElementById('event-end').value;
    const description = document.getElementById('event-description').value.trim();

    // Validate inputs
    if (!title) {
      alert('Please enter a title for the event');
      return;
    }

    if (!startInput || !endInput) {
      alert('Please enter both start and end times');
      return;
    }

    // Convert datetime-local to ISO format for API
    const startDate = new Date(startInput);
    const endDate = new Date(endInput);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      alert('Invalid date format');
      return;
    }

    if (endDate <= startDate) {
      alert('End time must be after start time');
      return;
    }

    const formData = {
      title: title,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      description: description
    };

    console.log('Saving event:', formData);

    try {
      const url = this.selectedEvent 
        ? `${this.options.apiBaseUrl}/events/${this.selectedEvent.id}`
        : `${this.options.apiBaseUrl}/events`;
      
      const method = this.selectedEvent ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const responseData = await response.json();

      if (response.ok) {
        console.log('Event saved successfully:', responseData);
        await this.loadEvents();
        this.closeEventModal();
        this.render();
        this.attachEventListeners();
      } else {
        const errorMsg = responseData.error || 'Unknown error';
        console.error('Error saving event:', responseData);
        alert(`Error saving event: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Error saving event:', error);
      alert(`Error saving event: ${error.message}`);
    }
  }

  /**
   * Delete event
   */
  async deleteEvent() {
    if (!this.selectedEvent || !confirm('Are you sure you want to delete this event?')) {
      return;
    }

    try {
      const response = await fetch(`${this.options.apiBaseUrl}/events/${this.selectedEvent.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.loadEvents();
        this.closeEventModal();
        this.render();
        this.attachEventListeners();
      } else {
        alert('Error deleting event');
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Error deleting event');
    }
  }

  /**
   * Open event modal
   */
  openEventModal(date = null) {
    const modal = document.getElementById('event-modal');
    if (!modal) return;

    if (this.selectedEvent) {
      // Edit mode
      document.getElementById('event-title').value = this.selectedEvent.title || '';
      document.getElementById('event-start').value = this.formatDateTimeLocal(this.selectedEvent.start);
      document.getElementById('event-end').value = this.formatDateTimeLocal(this.selectedEvent.end);
      document.getElementById('event-description').value = this.selectedEvent.description || '';
      document.getElementById('btn-delete').style.display = '';
    } else {
      // New event mode
      const startDate = date ? new Date(date) : this.currentDate;
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);
      
      document.getElementById('event-title').value = '';
      document.getElementById('event-start').value = this.formatDateTimeLocal(startDate);
      document.getElementById('event-end').value = this.formatDateTimeLocal(endDate);
      document.getElementById('event-description').value = '';
      document.getElementById('btn-delete').style.display = 'none';
    }

    modal.style.display = 'block';
  }

  /**
   * Close event modal
   */
  closeEventModal() {
    const modal = document.getElementById('event-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.selectedEvent = null;
  }

  /**
   * Sync events with Google Calendar
   */
  async syncWithGoogleCalendar() {
    try {
      const btn = document.getElementById('btn-sync-google');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Syncing...';
      }

      // Check authentication status first
      const statusResponse = await fetch(`${this.options.apiBaseUrl}/google-calendar/status`);
      const statusData = await statusResponse.json();

      if (!statusData.authenticated) {
        // Not authenticated, get auth URL
        const authResponse = await fetch(`${this.options.apiBaseUrl}/google-calendar/auth`);
        const authData = await authResponse.json();
        
        if (authData.auth_url) {
          // Redirect to Google OAuth
          window.location.href = authData.auth_url;
          return;
        } else {
          alert('Error: Could not get authentication URL. ' + (authData.message || ''));
          return;
        }
      }

      // Authenticated, proceed with sync
      const response = await fetch(`${this.options.apiBaseUrl}/google-calendar/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ events: this.events })
      });

      const data = await response.json();
      
      if (response.ok) {
        await this.loadEvents();
        alert('Successfully synced with Google Calendar!');
      } else {
        if (data.auth_required) {
          // Get auth URL and redirect
          const authResponse = await fetch(`${this.options.apiBaseUrl}/google-calendar/auth`);
          const authData = await authResponse.json();
          if (authData.auth_url) {
            window.location.href = authData.auth_url;
          } else {
            alert('Error: Could not get authentication URL');
          }
        } else {
          alert('Error syncing with Google Calendar: ' + (data.message || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('Error syncing with Google Calendar:', error);
      alert('Error syncing with Google Calendar');
    } finally {
      const btn = document.getElementById('btn-sync-google');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sync Google Calendar';
      }
    }
  }

  // Helper methods
  getEventsForDay(day) {
    const dayStr = this.formatDate(day);
    const matchingEvents = this.events.filter(event => {
      if (!event.start) {
        console.warn('Event missing start date:', event);
        return false;
      }
      try {
        const eventDate = new Date(event.start);
        if (isNaN(eventDate.getTime())) {
          console.warn('Invalid event date:', event.start, event);
          return false;
        }
        const eventDateStr = this.formatDate(eventDate);
        return eventDateStr === dayStr;
      } catch (e) {
        console.error('Error parsing event date:', event.start, e);
        return false;
      }
    });
    return matchingEvents;
  }

  isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  formatDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      console.warn('Invalid date passed to formatDate:', date);
      return '';
    }
    // Use local date components to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  formatHour(hour) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  }

  formatDateTimeLocal(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      console.warn('Invalid date passed to formatDateTimeLocal:', date);
      return '';
    }
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  getMonthYearString() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  }

  getDayString(date) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalendarPlugin;
}
