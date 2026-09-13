const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'eesa_token';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * An error carrying the HTTP status and any per-field validation detail, so
 * callers can distinguish "your session expired" from "that email is taken"
 * from "the network is down".
 */
export class ApiError extends Error {
  constructor(message, { status, code, errors } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

/** Storage access throws in private browsing, so every call is guarded. */
const safeStorage = {
  get(key) {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Session simply will not persist across reloads.
    }
  },
  remove(key) {
    try {
      if (typeof window !== 'undefined') localStorage.removeItem(key);
    } catch {
      // Nothing useful to do.
    }
  },
};

class ApiClient {
  constructor() {
    this.baseURL = API_URL;
    this.onUnauthorized = null;
  }

  getToken() {
    return safeStorage.get(TOKEN_KEY);
  }

  setToken(token) {
    if (token) safeStorage.set(TOKEN_KEY, token);
    else safeStorage.remove(TOKEN_KEY);
  }

  /**
   * Register a callback invoked when the API reports the session is no longer
   * valid. AuthContext uses it to clear state and send the member to sign in,
   * so an expired token produces one clean redirect rather than a cascade of
   * failed requests on every page.
   */
  setUnauthorizedHandler(handler) {
    this.onUnauthorized = handler;
  }

  /**
   * Read a response body without assuming it is JSON.
   *
   * The previous client called `response.json()` unconditionally, so any
   * non-JSON reply — a proxy's HTML error page, a 502 from a sleeping host, an
   * empty 204 — threw a SyntaxError that surfaced as "Unexpected token < in
   * JSON", telling the user nothing.
   */
  async parseBody(response) {
    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!text) return null;

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return { message: 'The server sent a malformed response.' };
      }
    }

    // Plain text or HTML: surface a short excerpt rather than raw markup.
    return { message: text.slice(0, 200) };
  }

  async request(endpoint, options = {}) {
    const { timeout = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
    const token = this.getToken();

    const headers = {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...fetchOptions.headers,
    };

    // FormData must set its own multipart boundary, so Content-Type is only
    // forced for JSON bodies.
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // Without a timeout a request to a sleeping free-tier backend hangs until
    // the browser gives up, leaving spinners on screen indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let response;
    try {
      response = await fetch(`${this.baseURL}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error.name === 'AbortError') {
        throw new ApiError('That request took too long. Check your connection and try again.', { status: 0, code: 'timeout' });
      }
      throw new ApiError('Cannot reach the server. Check your internet connection.', { status: 0, code: 'network' });
    } finally {
      clearTimeout(timer);
    }

    const data = await this.parseBody(response);

    if (!response.ok) {
      // 401 means the token is missing, expired or superseded by a password
      // change. 403 is a permission problem on a valid session, so it must not
      // sign the member out.
      if (response.status === 401 && this.onUnauthorized) {
        this.onUnauthorized(data?.code);
      }

      throw new ApiError(data?.message || this.statusMessage(response.status), {
        status: response.status,
        code: data?.code,
        errors: data?.errors,
      });
    }

    return data;
  }

  statusMessage(status) {
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You do not have permission to do that.';
    if (status === 404) return 'That item could not be found.';
    if (status === 409) return 'That conflicts with something that already exists.';
    if (status === 413) return 'That file is too large.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500) return 'The server ran into a problem. Please try again shortly.';
    return 'Something went wrong.';
  }

  get(endpoint, options) {
    return this.request(endpoint, { method: 'GET', ...options });
  }

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  }

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  }

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Upload with progress. fetch cannot report upload progress, so this uses
   * XMLHttpRequest, which can.
   */
  upload(endpoint, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseURL}${endpoint}`);
      xhr.timeout = 120000; // Large documents on a slow connection.

      const token = this.getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }

        if (xhr.status === 401 && this.onUnauthorized) this.onUnauthorized(data?.code);

        reject(new ApiError(data?.message || this.statusMessage(xhr.status), {
          status: xhr.status,
          code: data?.code,
          errors: data?.errors,
        }));
      };

      xhr.onerror = () => reject(new ApiError('Cannot reach the server. Check your internet connection.', { status: 0, code: 'network' }));
      xhr.ontimeout = () => reject(new ApiError('The upload timed out. Try a smaller file or a better connection.', { status: 0, code: 'timeout' }));
      xhr.onabort = () => reject(new ApiError('Upload cancelled.', { status: 0, code: 'aborted' }));

      xhr.send(body);
    });
  }
}

const api = new ApiClient();

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */
export const login = (credentials) => api.post('/auth/login', credentials);
export const register = (userData) => api.post('/auth/register', userData);
export const getProfile = () => api.get('/auth/me');
export const updateProfile = (data) => api.put('/auth/profile', data);
export const uploadProfilePicture = (formData, onProgress) => api.upload('/auth/profile/avatar', formData, onProgress);
export const changePassword = (data) => api.put('/auth/change-password', data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (data) => api.post('/auth/reset-password', data);
export const getRoleCatalog = () => api.get('/auth/roles');

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */
export const getEvents = (params = '') => api.get(`/events${params}`);
export const getEvent = (id) => api.get(`/events/${id}`);
export const createEvent = (data) => api.post('/events', data);
export const updateEvent = (id, data) => api.put(`/events/${id}`, data);
export const deleteEvent = (id) => api.delete(`/events/${id}`);
export const rsvpEvent = (id) => api.post(`/events/${id}/rsvp`);

/* ------------------------------------------------------------------ *
 * News
 * ------------------------------------------------------------------ */
export const getNews = (params = '') => api.get(`/news${params}`);
export const getArticle = (id) => api.get(`/news/${id}`);
export const createArticle = (data) => api.post('/news', data);
export const updateArticle = (id, data) => api.put(`/news/${id}`, data);
export const deleteArticle = (id) => api.delete(`/news/${id}`);

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */
export const getProjects = (params = '') => api.get(`/projects${params}`);
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const joinProject = (id) => api.post(`/projects/${id}/join`);

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */
export const getUsers = (params = '') => api.get(`/users${params}`);
export const getLeaders = () => api.get('/users/leaders');
export const getUserStats = () => api.get('/users/stats');
export const getAdminMembers = (params = '') => api.get(`/users/admin/list${params}`);
export const getAdminOverview = () => api.get('/admin/overview');
export const updateUserRole = (id, role) => api.put(`/users/${id}/role`, { role });
export const setUserStatus = (id, isActive) => api.patch(`/users/${id}/status`, { isActive });
export const deactivateUser = (id) => api.delete(`/users/${id}`);

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */
export const sendContact = (data) => api.post('/contact', data);
export const getContactMessages = (params = '') => api.get(`/contact${params}`);
export const markContactRead = (id) => api.put(`/contact/${id}/read`, {});
export const deleteContactMessage = (id) => api.delete(`/contact/${id}`);

/* ------------------------------------------------------------------ *
 * Elections
 * ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */
export const submitPayment = (data) => api.post('/payments', data);
export const getMyPayments = () => api.get('/payments/my');
export const getAllPayments = (params = '') => api.get(`/payments${params}`);
export const verifyPayment = (id, data) => api.put(`/payments/${id}/verify`, data);
export const getPaymentStats = () => api.get('/payments/stats');
export const deletePayment = (id) => api.delete(`/payments/${id}`);
export const initiateMpesaPayment = (data) => api.post('/payments/mpesa/stkpush', data);
export const checkMpesaStatus = (checkoutRequestId) => api.get(`/payments/mpesa/status/${checkoutRequestId}`);

/* ------------------------------------------------------------------ *
 * Resources / Library
 * ------------------------------------------------------------------ */
export const uploadResource = (formData, onProgress) => api.upload('/resources', formData, onProgress);
export const getResources = (params = '') => api.get(`/resources${params}`);
export const getResourceCatalog = () => api.get('/resources/catalog');
export const getMyResources = () => api.get('/resources/my');
export const getPendingResources = () => api.get('/resources/pending');
export const reviewResource = (id, data) => api.put(`/resources/${id}/review`, data);
export const trackDownload = (id) => api.put(`/resources/${id}/download`, {});
export const deleteResource = (id) => api.delete(`/resources/${id}`);

/**
 * Build a URL for viewing or downloading a library file.
 *
 * The file endpoint is opened directly by the browser, where an Authorization
 * header cannot be attached, so the credential has to be in the URL. It used to
 * be the member's full session token, which leaked a seven-day credential into
 * browser history, referrer headers and any intermediate log. This instead
 * fetches a five-minute ticket valid for one resource only.
 */
export const getResourceFileUrl = async (id) => {
  const { token } = await api.get(`/resources/${id}/ticket`);
  return `${API_URL}/resources/${id}/file?token=${encodeURIComponent(token)}`;
};

/* ------------------------------------------------------------------ *
 * Sponsors
 * ------------------------------------------------------------------ */
export const getSponsors = () => api.get('/sponsors');
export const createSponsor = (formData) => api.post('/sponsors', formData);
export const updateSponsor = (id, formData) => api.put(`/sponsors/${id}`, formData);
export const deleteSponsor = (id) => api.delete(`/sponsors/${id}`);

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
export const getNotifications = () => api.get('/notifications');
export const createNotification = (data) => api.post('/notifications', data);
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => api.put('/notifications/read-all', {});
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);

/* ------------------------------------------------------------------ *
 * Gallery
 * ------------------------------------------------------------------ */
export const getGalleryImages = (params = '') => api.get(`/gallery${params}`);
export const uploadGalleryImage = (formData) => api.post('/gallery', formData);
export const deleteGalleryImage = (id) => api.delete(`/gallery/${id}`);

export default api;
