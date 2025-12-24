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
    this.recognition = null;
    this.isRecording = false;
    this.initSpeechRecognition();
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
    
    // Check for past-due tasks on initialization
    await this.checkPastDueTasks();
    
    this.render();
    this.attachEventListeners();
    
    // Set up periodic check for past-due tasks (every 5 minutes)
    setInterval(() => {
      this.checkPastDueTasks();
    }, 5 * 60 * 1000);
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
            <button class="btn-secondary" id="btn-ai-bulk-add">AI Bulk Add</button>
            <button class="btn-secondary" id="btn-bulk-import">Bulk Import</button>
            <button class="btn-secondary" id="btn-auto-schedule">Auto-Schedule All</button>
            <button class="btn-primary" id="btn-new-task">+ Add Task</button>
          </div>
        </div>
        <div class="bulk-import-section" id="bulk-import-section" style="display: none;">
          <div class="bulk-import-content">
            <h3>Bulk Import Tasks</h3>
            <p class="format-help">Format: Name: Task Name; Due: MM/DD/YYYY; Time: 240; Chunk: Yes/No; ChunkMin: 30; ChunkMax: 60; Priority: 1-5</p>
            <textarea id="bulk-import-text" placeholder="Paste tasks here, one per line&#10;Example:&#10;Name: Complete project; Due: 12/31/2024; Time: 240; Chunk: Yes; ChunkMin: 30; ChunkMax: 60; Priority: 3&#10;Name: Review code; Due: 12/25/2024; Time: 60; Chunk: No; Priority: 2"></textarea>
            <div class="bulk-import-actions">
              <button class="btn-secondary" id="btn-cancel-import">Cancel</button>
              <button class="btn-primary" id="btn-import-tasks">Import Tasks</button>
            </div>
            <div id="bulk-import-results" class="bulk-import-results"></div>
          </div>
        </div>
        <div class="ai-bulk-add-section" id="ai-bulk-add-section" style="display: none;">
          <div class="bulk-import-content">
            <h3>AI Bulk Add Tasks</h3>
            <p class="format-help">Describe what you need to get done in natural language. AI will organize your tasks and convert them to the proper format. You can type or use the microphone button to speak your tasks (Chrome/Edge recommended for voice transcription).</p>
            <div class="textarea-with-transcription">
              <textarea id="ai-bulk-add-text" placeholder="Example:&#10;I need to finish my project by December 31st, it will take about 4 hours and I want to break it into 30-60 minute chunks. I also need to review some code by Christmas, that's about an hour. And I should write documentation before December 20th, that's 2 hours and high priority."></textarea>
              <button class="btn-transcribe" id="btn-transcribe" title="Start voice transcription">
                <span class="mic-icon">🎤</span>
                <span class="mic-text">Record</span>
              </button>
            </div>
            <div id="transcription-status" class="transcription-status" style="display: none;"></div>
            <div class="bulk-import-actions">
              <button class="btn-secondary" id="btn-cancel-ai-add">Cancel</button>
              <button class="btn-primary" id="btn-ai-process">Process with AI</button>
            </div>
            <div id="ai-bulk-add-results" class="bulk-import-results"></div>
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
      const isCompleted = task.completed || false;
      const isOverdue = deadline < new Date() && !isCompleted;
      const priorityClass = `priority-${task.priority}`;
      
      html += `
        <div class="task-card ${isOverdue ? 'overdue' : ''} ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
          <div class="task-header">
            <div class="task-checkbox-wrapper">
              <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''} data-task-id="${task.id}" title="${isCompleted ? 'Mark as incomplete' : 'Mark as complete'}">
              <h3 class="task-title ${isCompleted ? 'completed-title' : ''}">${this.escapeHtml(task.title)}</h3>
            </div>
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
            ${isCompleted ? `
              <button class="btn-reschedule" data-task-id="${task.id}">Mark as Not Done</button>
            ` : `
              <button class="btn-edit" data-task-id="${task.id}">Edit</button>
            `}
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

    // AI bulk add button
    document.getElementById('btn-ai-bulk-add')?.addEventListener('click', () => {
      this.showAIBulkAdd();
    });

    // Cancel AI bulk add
    document.getElementById('btn-cancel-ai-add')?.addEventListener('click', () => {
      this.hideAIBulkAdd();
    });

    // Process with AI button
    document.getElementById('btn-ai-process')?.addEventListener('click', () => {
      this.processWithAI();
    });

    // Transcription button
    document.getElementById('btn-transcribe')?.addEventListener('click', () => {
      this.toggleTranscription();
    });

    // Bulk import button
    document.getElementById('btn-bulk-import')?.addEventListener('click', () => {
      this.showBulkImport();
    });

    // Cancel bulk import
    document.getElementById('btn-cancel-import')?.addEventListener('click', () => {
      this.hideBulkImport();
    });

    // Import tasks button
    document.getElementById('btn-import-tasks')?.addEventListener('click', () => {
      this.importBulkTasks();
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

    // Task completion checkboxes
    document.querySelectorAll('.task-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const taskId = e.target.dataset.taskId;
        this.toggleTaskComplete(taskId);
      });
    });

    // Mark as not done buttons (for completed tasks)
    document.querySelectorAll('.btn-reschedule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = e.target.dataset.taskId;
        this.markTaskAsNotDone(taskId);
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
    return task.completed || false;
  }

  /**
   * Toggle task completion status
   */
  async toggleTaskComplete(taskId) {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/${taskId}/toggle-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reschedule: false })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Reload tasks and refresh UI
        await this.loadTasks();
        this.render();
        this.attachEventListeners();
        
        // Reload calendar events if calendar plugin is available
        // Note: Completed tasks keep their events (they show what was scheduled)
        if (window.calendar && typeof window.calendar.loadEvents === 'function') {
          await window.calendar.loadEvents();
          window.calendar.render();
          window.calendar.attachEventListeners();
        }
      } else {
        const error = await response.json();
        alert('Error toggling task completion: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error toggling task completion:', error);
      alert('Error toggling task completion');
    }
  }

  /**
   * Mark task as not done and reschedule it
   */
  async markTaskAsNotDone(taskId) {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/${taskId}/toggle-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reschedule: true })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Reload tasks and refresh UI
        await this.loadTasks();
        this.render();
        this.attachEventListeners();
        
        // Reload calendar events if calendar plugin is available
        if (window.calendar && typeof window.calendar.loadEvents === 'function') {
          await window.calendar.loadEvents();
          window.calendar.render();
          window.calendar.attachEventListeners();
        }
        
        if (data.rescheduled) {
          alert('Task marked as not done and rescheduled!');
        }
      } else {
        const error = await response.json();
        alert('Error marking task as not done: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error marking task as not done:', error);
      alert('Error marking task as not done');
    }
  }

  /**
   * Check for past-due task events and mark them as completed
   */
  async checkPastDueTasks() {
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/check-past-due`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.count > 0) {
          // Reload tasks and refresh UI
          await this.loadTasks();
          this.render();
          this.attachEventListeners();
          
          // Reload calendar events if calendar plugin is available
          if (window.calendar && typeof window.calendar.loadEvents === 'function') {
            await window.calendar.loadEvents();
            window.calendar.render();
            window.calendar.attachEventListeners();
          }
          
          console.log(`Marked ${data.count} task(s) as completed (past due)`);
        }
      }
    } catch (error) {
      console.error('Error checking past-due tasks:', error);
    }
  }

  /**
   * Initialize Audio Recording (using MediaRecorder API)
   */
  initSpeechRecognition() {
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setTimeout(() => {
        const btn = document.getElementById('btn-transcribe');
        if (btn) {
          btn.style.display = 'none';
        }
      }, 100);
      return;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
  }

  /**
   * Toggle transcription on/off
   */
  async toggleTranscription() {
    if (this.isRecording) {
      // Stop recording
      this.isRecording = false;
      this.updateTranscriptionUI(false);
      
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
      }

      const statusDiv = document.getElementById('transcription-status');
      if (statusDiv) {
        statusDiv.innerHTML = '<span class="transcribing">Processing audio...</span>';
      }
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioStream = stream;
        this.audioChunks = [];
        
        // Use WebM format for better browser support
        const options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          // Fallback to default
          delete options.mimeType;
        }
        
        this.mediaRecorder = new MediaRecorder(stream, options);
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };
        
        this.mediaRecorder.onstop = async () => {
          // Send audio to backend for transcription
          await this.sendAudioForTranscription();
          
          // Stop all tracks
          if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
          }
        };
        
        this.mediaRecorder.onerror = (event) => {
          const statusDiv = document.getElementById('transcription-status');
          if (statusDiv) {
            statusDiv.innerHTML = '<span class="transcription-error">Recording error occurred</span>';
          }
          this.isRecording = false;
          this.updateTranscriptionUI(false);
        };
        
        this.isRecording = true;
        this.updateTranscriptionUI(true);
        this.mediaRecorder.start();
        
        const statusDiv = document.getElementById('transcription-status');
        if (statusDiv) {
          statusDiv.style.display = 'block';
          statusDiv.innerHTML = '<span class="transcribing">🎤 Recording... Speak now</span>';
        }
      } catch (error) {
        alert('Microphone permission denied. Please allow microphone access to use transcription.');
        this.isRecording = false;
        this.updateTranscriptionUI(false);
      }
    }
  }

  /**
   * Send recorded audio to backend for Whisper transcription
   */
  async sendAudioForTranscription() {
    const statusDiv = document.getElementById('transcription-status');
    const textarea = document.getElementById('ai-bulk-add-text');
    
    if (!textarea) return;
    
    if (this.audioChunks.length === 0) {
      if (statusDiv) {
        statusDiv.innerHTML = '<span class="transcription-error">No audio recorded</span>';
      }
      return;
    }
    
    try {
      if (statusDiv) {
        statusDiv.innerHTML = '<span class="transcribing">Transcribing with Whisper...</span>';
      }
      
      // Create blob from audio chunks
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      
      // Create FormData to send audio file
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      
      // Send to backend
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/transcribe`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok && data.transcription) {
        // Append transcription to textarea
        const currentText = textarea.value.trim();
        const newText = currentText ? `${currentText} ${data.transcription}` : data.transcription;
        textarea.value = newText;
        
        if (statusDiv) {
          statusDiv.innerHTML = '<span class="transcription-success">Transcription complete</span>';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 2000);
        }
      } else {
        if (statusDiv) {
          statusDiv.innerHTML = `<span class="transcription-error">Error: ${data.error || 'Transcription failed'}</span>`;
        }
      }
    } catch (error) {
      if (statusDiv) {
        statusDiv.innerHTML = `<span class="transcription-error">Error: ${error.message}</span>`;
      }
    } finally {
      // Clear audio chunks for next recording
      this.audioChunks = [];
    }
  }

  /**
   * Update transcription UI
   */
  updateTranscriptionUI(isRecording) {
    const btn = document.getElementById('btn-transcribe');
    const statusDiv = document.getElementById('transcription-status');
    
    if (btn) {
      if (isRecording) {
        btn.classList.add('recording');
        btn.querySelector('.mic-text').textContent = 'Stop';
        btn.title = 'Stop recording';
      } else {
        btn.classList.remove('recording');
        btn.querySelector('.mic-text').textContent = 'Record';
        btn.title = 'Start voice transcription';
      }
    }

    if (statusDiv && isRecording) {
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<span class="transcribing">🎤 Recording... Speak now</span>';
    }
  }

  /**
   * Show AI bulk add section
   */
  showAIBulkAdd() {
    const section = document.getElementById('ai-bulk-add-section');
    const bulkSection = document.getElementById('bulk-import-section');
    if (section) {
      // Hide bulk import if open
      if (bulkSection) bulkSection.style.display = 'none';
      section.style.display = 'block';
      document.getElementById('ai-bulk-add-text').focus();
      
      // Stop any ongoing transcription
      if (this.isRecording && this.mediaRecorder) {
        this.mediaRecorder.stop();
      }
    }
  }

  /**
   * Hide AI bulk add section
   */
  hideAIBulkAdd() {
    const section = document.getElementById('ai-bulk-add-section');
    if (section) {
      // Stop any ongoing transcription
      if (this.isRecording && this.mediaRecorder) {
        this.mediaRecorder.stop();
      }
      
      section.style.display = 'none';
      document.getElementById('ai-bulk-add-text').value = '';
      document.getElementById('ai-bulk-add-results').innerHTML = '';
      document.getElementById('transcription-status').innerHTML = '';
      document.getElementById('transcription-status').style.display = 'none';
    }
  }

  /**
   * Process text with AI
   */
  async processWithAI() {
    const textarea = document.getElementById('ai-bulk-add-text');
    const resultsDiv = document.getElementById('ai-bulk-add-results');
    const processBtn = document.getElementById('btn-ai-process');
    
    if (!textarea || !resultsDiv) return;

    const text = textarea.value.trim();
    if (!text) {
      alert('Please describe what you need to get done');
      return;
    }

    // Disable button
    if (processBtn) {
      processBtn.disabled = true;
      processBtn.textContent = 'Processing with AI...';
    }

    resultsDiv.innerHTML = '<div class="import-summary"><p>Processing your request with AI...</p></div>';

    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/ai-bulk-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ description: text })
      });

      const data = await response.json();

      if (response.ok && data.formatted_tasks) {
        // Populate bulk import textarea with AI-generated format
        const bulkTextarea = document.getElementById('bulk-import-text');
        if (bulkTextarea) {
          bulkTextarea.value = data.formatted_tasks;
        }

        // Show success message
        let resultsHTML = `<div class="import-success">`;
        resultsHTML += `<p><strong>AI Processing Complete!</strong></p>`;
        resultsHTML += `<p>Found ${data.task_count || 0} tasks. The formatted tasks have been added to the Bulk Import section.</p>`;
        if (data.raw_response) {
          resultsHTML += `<details><summary>View AI Response</summary><pre style="white-space: pre-wrap; font-size: 12px; margin-top: 10px;">${this.escapeHtml(data.raw_response)}</pre></details>`;
        }
        resultsHTML += `</div>`;
        resultsDiv.innerHTML = resultsHTML;

        // Switch to bulk import view
        this.hideAIBulkAdd();
        this.showBulkImport();
      } else {
        resultsDiv.innerHTML = `<div class="import-error">Error: ${data.error || 'Unknown error'}</div>`;
      }
    } catch (error) {
      console.error('Error processing with AI:', error);
      resultsDiv.innerHTML = `<div class="import-error">Error: ${error.message}</div>`;
    } finally {
      if (processBtn) {
        processBtn.disabled = false;
        processBtn.textContent = 'Process with AI';
      }
    }
  }

  /**
   * Show bulk import section
   */
  showBulkImport() {
    const section = document.getElementById('bulk-import-section');
    const aiSection = document.getElementById('ai-bulk-add-section');
    if (section) {
      // Hide AI bulk add if open
      if (aiSection) aiSection.style.display = 'none';
      section.style.display = 'block';
      document.getElementById('bulk-import-text').focus();
    }
  }

  /**
   * Hide bulk import section
   */
  hideBulkImport() {
    const section = document.getElementById('bulk-import-section');
    if (section) {
      section.style.display = 'none';
      document.getElementById('bulk-import-text').value = '';
      document.getElementById('bulk-import-results').innerHTML = '';
    }
  }

  /**
   * Parse a single task line
   * Format: Name: XX; Due: MM/DD/YYYY; Time: 240; Chunk: Yes/No; ChunkMin: 30; ChunkMax: 60; Priority: 1-5
   */
  parseTaskLine(line, lineNumber) {
    const errors = [];
    const task = {
      title: null,
      deadline: null,
      total_duration: null,
      chunking: false,
      chunking_min_duration: null,
      chunking_max_duration: null,
      priority: 3 // Default priority
    };

    // Remove leading/trailing whitespace
    line = line.trim();
    if (!line) {
      return { task: null, errors: ['Empty line'] };
    }

    // Split by semicolon
    const parts = line.split(';').map(p => p.trim());

    for (const part of parts) {
      if (!part) continue;

      const colonIndex = part.indexOf(':');
      if (colonIndex === -1) {
        errors.push(`Invalid format in "${part}"`);
        continue;
      }

      const key = part.substring(0, colonIndex).trim().toLowerCase();
      const value = part.substring(colonIndex + 1).trim();

      switch (key) {
        case 'name':
          task.title = value;
          break;
        
        case 'due':
          // Parse date MM/DD/YYYY or MM/DD/YY
          const dateMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if (dateMatch) {
            let month = parseInt(dateMatch[1]);
            let day = parseInt(dateMatch[2]);
            let year = parseInt(dateMatch[3]);
            
            // Handle 2-digit years
            if (year < 100) {
              year += year < 50 ? 2000 : 1900;
            }
            
            // Create date at 9 AM local time
            const deadlineDate = new Date(year, month - 1, day, 9, 0, 0);
            if (isNaN(deadlineDate.getTime())) {
              errors.push(`Invalid date: ${value}`);
            } else {
              task.deadline = deadlineDate.toISOString();
            }
          } else {
            errors.push(`Invalid date format: ${value} (expected MM/DD/YYYY)`);
          }
          break;
        
        case 'time':
          // Remove any non-digit characters (like apostrophes)
          const timeValue = parseInt(value.replace(/\D/g, ''));
          if (isNaN(timeValue) || timeValue <= 0) {
            errors.push(`Invalid time: ${value}`);
          } else {
            task.total_duration = timeValue;
          }
          break;
        
        case 'chunk':
          const chunkValue = value.toLowerCase();
          task.chunking = chunkValue === 'yes' || chunkValue === 'y' || chunkValue === 'true';
          break;
        
        case 'chunkmin':
          const minValue = parseInt(value.replace(/\D/g, ''));
          if (isNaN(minValue) || minValue <= 0) {
            errors.push(`Invalid ChunkMin: ${value}`);
          } else {
            task.chunking_min_duration = minValue;
          }
          break;
        
        case 'chunkmax':
          const maxValue = parseInt(value.replace(/\D/g, ''));
          if (isNaN(maxValue) || maxValue <= 0) {
            errors.push(`Invalid ChunkMax: ${value}`);
          } else {
            task.chunking_max_duration = maxValue;
          }
          break;
        
        case 'priority':
          const priorityValue = parseInt(value);
          if (isNaN(priorityValue) || priorityValue < 1 || priorityValue > 5) {
            errors.push(`Invalid priority: ${value} (must be 1-5)`);
          } else {
            task.priority = priorityValue;
          }
          break;
        
        default:
          // Ignore unknown keys
          break;
      }
    }

    // Validate required fields
    if (!task.title) {
      errors.push('Missing Name');
    }
    if (!task.deadline) {
      errors.push('Missing or invalid Due date');
    }
    if (!task.total_duration) {
      errors.push('Missing or invalid Time');
    }

    return { task: errors.length === 0 ? task : null, errors };
  }

  /**
   * Import bulk tasks
   */
  async importBulkTasks() {
    const textarea = document.getElementById('bulk-import-text');
    const resultsDiv = document.getElementById('bulk-import-results');
    const importBtn = document.getElementById('btn-import-tasks');
    
    if (!textarea || !resultsDiv) return;

    const text = textarea.value.trim();
    if (!text) {
      alert('Please paste some tasks to import');
      return;
    }

    // Disable button
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
    }

    // Parse lines
    const lines = text.split('\n').filter(line => line.trim());
    const parsedTasks = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const result = this.parseTaskLine(lines[i], i + 1);
      if (result.task) {
        parsedTasks.push(result.task);
      } else {
        errors.push({ line: i + 1, text: lines[i], errors: result.errors });
      }
    }

    // Show parsing results
    let resultsHTML = `<div class="import-summary">`;
    resultsHTML += `<p><strong>Parsed:</strong> ${parsedTasks.length} tasks</p>`;
    if (errors.length > 0) {
      resultsHTML += `<p><strong>Errors:</strong> ${errors.length} lines</p>`;
      resultsHTML += `<div class="import-errors">`;
      errors.forEach(err => {
        resultsHTML += `<div class="import-error">`;
        resultsHTML += `<strong>Line ${err.line}:</strong> ${this.escapeHtml(err.text)}<br>`;
        resultsHTML += `<span class="error-details">${err.errors.join(', ')}</span>`;
        resultsHTML += `</div>`;
      });
      resultsHTML += `</div>`;
    }
    resultsHTML += `</div>`;
    resultsDiv.innerHTML = resultsHTML;

    if (parsedTasks.length === 0) {
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.textContent = 'Import Tasks';
      }
      return;
    }

    // Import tasks via API
    try {
      const response = await fetch(`${this.options.apiBaseUrl}/tasks/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tasks: parsedTasks })
      });

      const data = await response.json();

      if (response.ok) {
        resultsHTML += `<div class="import-success">`;
        resultsHTML += `<p><strong>Successfully imported:</strong> ${data.created || parsedTasks.length} tasks</p>`;
        if (data.errors && data.errors.length > 0) {
          resultsHTML += `<p><strong>Import errors:</strong> ${data.errors.length}</p>`;
          data.errors.forEach(err => {
            resultsHTML += `<div class="import-error">${this.escapeHtml(err)}</div>`;
          });
        }
        resultsHTML += `</div>`;
        resultsDiv.innerHTML = resultsHTML;

        // Reload tasks and refresh UI
        await this.loadTasks();
        this.render();
        this.attachEventListeners();

        // Clear textarea after successful import
        setTimeout(() => {
          textarea.value = '';
        }, 2000);
      } else {
        resultsHTML += `<div class="import-error">Error: ${data.error || 'Unknown error'}</div>`;
        resultsDiv.innerHTML = resultsHTML;
      }
    } catch (error) {
      console.error('Error importing tasks:', error);
      resultsHTML += `<div class="import-error">Error: ${error.message}</div>`;
      resultsDiv.innerHTML = resultsHTML;
    } finally {
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.textContent = 'Import Tasks';
      }
    }
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

