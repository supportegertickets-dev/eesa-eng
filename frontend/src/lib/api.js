const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class ApiClient {
  constructor() {
    this.baseURL = API_URL;
  }

  getToken() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eesa_token');
    }
    return null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = this.getToken();

    const config = {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    // Only set Content-Type to JSON if body is not FormData
    if (!(config.body instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }

    return data;
  }

  get(endpoint) {
    return this.request(endpoint);
  }

  post(endpoint, body) {
    if (body instanceof FormData) {
      return this.request(endpoint, { method: 'POST', body });
    }
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body) {
    if (body instanceof FormData) {
      return this.request(endpoint, { method: 'PUT', body });
    }
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

const api = new ApiClient();

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);
export const register = (userData) => api.post('/auth/register', userData);
export const getProfile = () => api.get('/auth/me');
export const updateProfile = (data) => api.put('/auth/profile', data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (data) => api.post('/auth/reset-password', data);

// Events
export const getEvents = (params = '') => api.get(`/events${params}`);
export const getEvent = (id) => api.get(`/events/${id}`);
export const createEvent = (data) => api.post('/events', data);
export const updateEvent = (id, data) => api.put(`/events/${id}`, data);
export const deleteEvent = (id) => api.delete(`/events/${id}`);
export const rsvpEvent = (id) => api.post(`/events/${id}/rsvp`);

// News
export const getNews = (params = '') => api.get(`/news${params}`);
export const getArticle = (id) => api.get(`/news/${id}`);
export const createArticle = (data) => api.post('/news', data);
export const updateArticle = (id, data) => api.put(`/news/${id}`, data);
export const deleteArticle = (id) => api.delete(`/news/${id}`);

// Projects
export const getProjects = (params = '') => api.get(`/projects${params}`);
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const joinProject = (id) => api.post(`/projects/${id}/join`);

// Users
export const getUsers = (params = '') => api.get(`/users${params}`);
export const getLeaders = () => api.get('/users/leaders');
export const getUserStats = () => api.get('/users/stats');
export const updateUserRole = (id, role) => api.put(`/users/${id}/role`, { role });
export const deactivateUser = (id) => api.delete(`/users/${id}`);

// Contact
export const sendContact = (data) => api.post('/contact', data);

// Elections
export const getElections = (params = '') => api.get(`/elections${params}`);
export const getElection = (id) => api.get(`/elections/${id}`);
export const createElection = (data) => api.post('/elections', data);
export const updateElection = (id, data) => api.put(`/elections/${id}`, data);
export const deleteElection = (id) => api.delete(`/elections/${id}`);
export const registerCandidate = (electionId, formData) => api.post(`/elections/${electionId}/candidates`, formData);
export const updateCandidate = (electionId, candidateId, formData) => api.put(`/elections/${electionId}/candidates/${candidateId}`, formData);
export const removeCandidate = (electionId, candidateId) => api.delete(`/elections/${electionId}/candidates/${candidateId}`);
export const castVote = (electionId, candidateId) => api.post(`/elections/${electionId}/vote/${candidateId}`, {});
export const getElectionResults = (id) => api.get(`/elections/${id}/results`);

// Payments
export const submitPayment = (data) => api.post('/payments', data);
export const getMyPayments = () => api.get('/payments/my');
export const getAllPayments = (params = '') => api.get(`/payments${params}`);
export const verifyPayment = (id, data) => api.put(`/payments/${id}/verify`, data);
export const getPaymentStats = () => api.get('/payments/stats');
export const deletePayment = (id) => api.delete(`/payments/${id}`);
export const initiateMpesaPayment = (data) => api.post('/payments/mpesa/stkpush', data);
export const checkMpesaStatus = (checkoutRequestId) => api.get(`/payments/mpesa/status/${checkoutRequestId}`);

// Resources / Library
export const uploadResource = (formData) => api.post('/resources', formData);
export const getResourceFileUrl = (id) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('eesa_token') : '';
  return `${API_URL}/resources/${id}/file?token=${token}`;
};
export const getResources = (params = '') => api.get(`/resources${params}`);
export const getMyResources = () => api.get('/resources/my');
export const getPendingResources = () => api.get('/resources/pending');
export const reviewResource = (id, data) => api.put(`/resources/${id}/review`, data);
export const trackDownload = (id) => api.put(`/resources/${id}/download`, {});
export const deleteResource = (id) => api.delete(`/resources/${id}`);

// Sponsors
export const getSponsors = () => api.get('/sponsors');
export const createSponsor = (formData) => api.post('/sponsors', formData);
export const updateSponsor = (id, formData) => api.put(`/sponsors/${id}`, formData);
export const deleteSponsor = (id) => api.delete(`/sponsors/${id}`);

// Notifications
export const getNotifications = () => api.get('/notifications');
export const createNotification = (data) => api.post('/notifications', data);
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => api.put('/notifications/read-all', {});
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);

// Gallery
export const getGalleryImages = (params = '') => api.get(`/gallery${params}`);
export const uploadGalleryImage = (formData) => api.post('/gallery', formData);
export const deleteGalleryImage = (id) => api.delete(`/gallery/${id}`);

export default api;
