/**
 * Tasks Manager
 * Handles task creation, display, and management
 */

class TasksManager {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      apiBaseUrl: options.apiBaseUrl || 'http://localhost:5002/api',
      ...options
    };
    this.tasks = [];
    this.selectedTask = null;
  }

  /**
   * Initialize the tasks manager
   */
  async init() {
    if (!this.container) {
      console.error('Tasks container not found');
      return;
    }
    await this.loadTasks();
    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the tasks section
   */
  render() {
    const tasksHTML = `
      <div class="tasks-wrapper">
        <div class="tasks-header">
          <h2>Tasks</h2>
          <div class="tasks-header-actions">
            <button class="btn-secondary" id="btn-auto-schedule">Auto-Schedule All</button>
            <button class="btn-primary" id="btn-new-task">+ Add Task</button>
          </div>
        </div>
        <div class="tasks-list" id="tasks-list">
          ${this.renderTasksList()}
        </div>
      </div>
      ${this.renderTaskModal()}
    `;
    this.container.innerHTML = tasksHTML;
  }

  /**
   * Render tasks list
   */
  renderTasksList() {
    if (this.tasks.length === 0) {
      return '<div class="no-tasks">No tasks yet. Click "Add Task" to create one.</div>';
    }

    let html = '<div class="tasks-grid">';
    this.tasks.forEach(task => {
      const deadline = new Date(task.deadline);
      const isOverdue = deadline < new Date() && !this.isTaskCompleted(task);
      const priorityClass = `priority-${task.priority}`;
      
      html += `
        <div class="task-card ${isOverdue ? 'overdue' : ''}" data-task-id="${task.id}">
          <div class="task-header">
            <h3 class="task-title">${this.escapeHtml(task.title)}</h3>
            <div class="task-priority ${priorityClass}">
              Priority: ${task.priority}
            </div>
          </div>
          <div class="task-details">
            <div class="task-detail">
              <span class="detail-label">Deadline:</span>
              <span class="detail-value ${isOverdue ? 'overdue-text' : ''}">${this.formatDate(deadline)}</span>
            </div>
            <div class="task-detail">
              <span class="detail-label">Total Duration:</span>
              <span class="detail-value">${this.formatDuration(task.total_duration)}</span>
            </div>
            ${task.chunking ? `
              <div class="task-detail">
                <span class="detail-label">Chunking:</span>
                <span class="detail-value">Yes</span>
              </div>
              ${task.chunking_min_duration ? `
                <div class="task-detail">
                  <span class="detail-label">Min Chunk:</span>
                  <span class="detail-value">${this.formatDuration(task.chunking_min_duration)}</span>
                </div>
              ` : ''}
              ${task.chunking_max_duration ? `
                <div class="task-detail">
                  <span class="detail-label">Max Chunk:</span>
                  <span class="detail-value">${this.formatDuration(task.chunking_max_duration)}</span>
                </div>
              ` : ''}
            ` : `
              <div class="task-detail">
                <span class="detail-label">Chunking:</span>
                <span class="detail-value">No</span>
              </div>
            `}
          </div>
          <div class="task-actions">
            <button class="btn-edit" data-task-id="${task.id}">Edit</button>
            <button class="btn-delete-task" data-task-id="${task.id}">Delete</button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  /**
   * Render task modal
   */
  renderTaskModal() {
    return `
      <div class="modal" id="task-modal" style="display: none;">
        <div class="modal-content task-modal-content">
          <span class="modal-close" id="task-modal-close">&times;</span>
          <h2 id="task-modal-title">${this.selectedTask ? 'Edit Task' : 'New Task'}</h2>
          <form id="task-form">
            <div class="form-group">
              <label for="task-title">Title *</label>
              <input type="text" id="task-title" required>
            </div>
            <div class="form-group">
              <label for="task-deadline">Deadline *</label>
              <input type="datetime-local" id="task-deadline" required>
            </div>
            <div class="form-group">
              <label for="task-total-duration">Total Duration (minutes) *</label>
              <input type="number" id="task-total-duration" min="1" required>
            </div>
            <div class="form-group">
              <label for="task-chunking">Chunking</label>
              <select id="task-chunking">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div class="form-group chunking-fields" id="chunking-fields" style="display: none;">
              <label for="task-chunking-min">Min Chunk Duration (minutes)</label>
              <input type="number" id="task-chunking-min" min="1">
            </div>
            <div class="form-group chunking-fields" id="chunking-fields-max" style="display: none;">
              <label for="task-chunking-max">Max Chunk Duration (minutes)</label>
              <input type="number" id="task-chunking-max" min="1">
            </div>
            <div class="form-group">
              <label for="task-priority">Priority (1-5, where 1 is highest) *</label>
              <input type="number" id="task-priority" min="1" max="5" value="3" required>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-secondary" id="btn-task-cancel">Cancel</button>
              <button type="button" class="btn-danger" id="btn-task-delete" style="${this.selectedTask ? '' : 'display: none;'}">Delete</button>
              <button type="submit" class="btn-primary">${this.selectedTask ? 'Update' : 'Create'}</button>
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
    // New task button
    document.getElementById('btn-new-task')?.addEventListener('click', () => {
      this.selectedTask = null;
      this.openTaskModal();
    });

    // Auto-schedule button
    document.getElementById('btn-auto-schedule')?.addEventListener('click', () => {
      this.triggerAutoSchedule();
    });

    // Task modal controls
    document.getElementById('task-modal-close')?.addEventListener('click', () => this.closeTaskModal());
    document.getElementById('btn-task-cancel')?.addEventListener('click', () => this.closeTaskModal());
    document.getElementById('btn-task-delete')?.addEventListener('click', () => this.deleteTask());
    
    // Chunking toggle
    document.getElementById('task-chunking')?.addEventListener('change', (e) => {
      const chunkingFields = document.querySelectorAll('.chunking-fields');
      chunkingFields.forEach(field => {
        field.style.display = e.target.value === 'yes' ? 'block' : 'none';
      });
    });

    // Task form submission
    document.getElementById('task-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveTask();
    });

    // Edit buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const taskId = e.target.dataset.taskId;
        await this.loadTaskDetails(taskId);
      });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = e.target.dataset.taskId;
        this.selectedTask = this.tasks.find(t => t.id === taskId);
        if (this.selectedTask && confirm(`Are you sure you want to delete "${this.selectedTask.title}"?`)) {
          this.deleteTask();
        }
      });
    });
  }

  /**
   * Load tasks from API
   */
  async loadTasks() {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks`);
      const data = await response.json();
      this.tasks = data.tasks || [];
    } catch (error) {
      console.error('Error loading tasks:', error);
      this.tasks = [];
    }
  }

  /**
   * Load task details
   */
  async loadTaskDetails(taskId) {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/${taskId}`);
      const data = await response.json();
      this.selectedTask = data.task;
      this.openTaskModal();
    } catch (error) {
      console.error('Error loading task details:', error);
      alert('Error loading task details');
    }
  }

  /**
   * Save task (create or update)
   */
  async saveTask() {
    const chunking = document.getElementById('task-chunking').value === 'yes';
    
    const formData = {
      title: document.getElementById('task-title').value,
      deadline: document.getElementById('task-deadline').value,
      total_duration: parseInt(document.getElementById('task-total-duration').value),
      chunking: chunking,
      chunking_min_duration: chunking ? parseInt(document.getElementById('task-chunking-min').value) || null : null,
      chunking_max_duration: chunking ? parseInt(document.getElementById('task-chunking-max').value) || null : null,
      priority: parseInt(document.getElementById('task-priority').value)
    };

    try {
      const url = this.selectedTask 
        ? `${this.options.apiBaseUrl}/tasks/${this.selectedTask.id}`
        : `${this.options.apiBaseUrl}/tasks`;
      
      const method = this.selectedTask ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await this.loadTasks();
        this.closeTaskModal();
        this.render();
        this.attachEventListeners();
        
        // Trigger auto-scheduling after saving task
        await this.triggerAutoSchedule();
      } else {
        const error = await response.json();
        alert('Error saving task: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Error saving task');
    }
  }

  /**
   * Delete task
   */
  async deleteTask() {
    if (!this.selectedTask) return;

    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/${this.selectedTask.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await this.loadTasks();
        this.closeTaskModal();
        this.render();
        this.attachEventListeners();
        
        // Trigger auto-scheduling after deleting task
        await this.triggerAutoSchedule();
      } else {
        alert('Error deleting task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Error deleting task');
    }
  }

  /**
   * Open task modal
   */
  openTaskModal() {
    const modal = document.getElementById('task-modal');
    if (!modal) return;

    if (this.selectedTask) {
      // Edit mode
      document.getElementById('task-title').value = this.selectedTask.title || '';
      document.getElementById('task-deadline').value = this.formatDateTimeLocal(this.selectedTask.deadline);
      document.getElementById('task-total-duration').value = this.selectedTask.total_duration || '';
      document.getElementById('task-chunking').value = this.selectedTask.chunking ? 'yes' : 'no';
      document.getElementById('task-chunking-min').value = this.selectedTask.chunking_min_duration || '';
      document.getElementById('task-chunking-max').value = this.selectedTask.chunking_max_duration || '';
      document.getElementById('task-priority').value = this.selectedTask.priority || 3;
      document.getElementById('btn-task-delete').style.display = '';
      
      // Show/hide chunking fields
      const chunkingFields = document.querySelectorAll('.chunking-fields');
      chunkingFields.forEach(field => {
        field.style.display = this.selectedTask.chunking ? 'block' : 'none';
      });
    } else {
      // New task mode
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      
      document.getElementById('task-title').value = '';
      document.getElementById('task-deadline').value = this.formatDateTimeLocal(tomorrow);
      document.getElementById('task-total-duration').value = '60';
      document.getElementById('task-chunking').value = 'no';
      document.getElementById('task-chunking-min').value = '';
      document.getElementById('task-chunking-max').value = '';
      document.getElementById('task-priority').value = '3';
      document.getElementById('btn-task-delete').style.display = 'none';
      
      // Hide chunking fields
      const chunkingFields = document.querySelectorAll('.chunking-fields');
      chunkingFields.forEach(field => {
        field.style.display = 'none';
      });
    }

    modal.style.display = 'block';
  }

  /**
   * Close task modal
   */
  closeTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.selectedTask = null;
  }

  // Helper methods
  formatDate(date) {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  formatDateTimeLocal(dateStr) {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  isTaskCompleted(task) {
    // Placeholder for future completion tracking
    return false;
  }

  /**
   * Trigger auto-scheduling of all tasks
   */
  async triggerAutoSchedule() {
    const btn = document.getElementById('btn-auto-schedule');
    const originalText = btn ? btn.textContent : '';
    
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Scheduling...';
      }

      const response = await fetch(`${this.options.apiBaseUrl}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        // Reload calendar events if calendar plugin is available
        if (window.calendar && typeof window.calendar.loadEvents === 'function') {
          await window.calendar.loadEvents();
          window.calendar.render();
          window.calendar.attachEventListeners();
        }
        
        const message = `Auto-scheduling completed!\n${data.successfully_scheduled} of ${data.total_tasks} tasks scheduled.`;
        if (data.errors && data.errors.length > 0) {
          alert(message + `\n${data.errors.length} errors occurred.`);
        } else {
          alert(message);
        }
      } else {
        alert('Error auto-scheduling: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error triggering auto-schedule:', error);
      alert('Error triggering auto-schedule: ' + error.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }
}

