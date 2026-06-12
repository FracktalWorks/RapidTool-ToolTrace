import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Ported from RapidTool-Fixture (same backend). Auth is fully HttpOnly-cookie
// based: `withCredentials` sends the shared .appliedadditive.com session cookie,
// so once you're logged into any RapidTool tool you're logged into this one too.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '10000');

export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
}

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api`,
      timeout: API_TIMEOUT,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => config,
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        const isAuthRoute = originalRequest.url?.includes('login') || originalRequest.url?.includes('refresh');

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
          originalRequest._retry = true;
          try {
            await this.refreshAccessToken();
            // Backend set new cookies — retry with the same request (cookies auto-included)
            return this.client(originalRequest);
          } catch (refreshError) {
            this.clearTokens();
            window.dispatchEvent(new CustomEvent('auth:logout'));
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        // Backend reads refresh_token HttpOnly cookie and sets new cookies.
        // No body or Authorization header needed.
        await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
      } catch (error) {
        const apiError = error as ApiError;
        if (
          apiError.message?.includes('revoked') ||
          apiError.message?.includes('latest refresh token') ||
          apiError.message?.includes('session has expired') ||
          apiError.statusCode === 401 ||
          apiError.statusCode === 500
        ) {
          this.clearTokens();
          window.dispatchEvent(new CustomEvent('auth:logout'));
        }
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private handleError(error: AxiosError): ApiError {
    if (error.response) {
      const data = error.response.data as { message?: string; errors?: Record<string, string[]> };
      const statusCode = error.response.status;

      let message = data.message || 'An error occurred';
      switch (statusCode) {
        case 401: message = 'Your session has expired. Please login again.'; break;
        case 403: message = 'You do not have permission to perform this action.'; break;
        case 404: message = 'The requested resource was not found.'; break;
        case 429: message = 'Too many requests. Please wait a moment and try again.'; break;
        case 500: message = 'Server error. Please try again later.'; break;
        default:  message = data.message || 'An error occurred. Please try again.';
      }

      return { message, statusCode, errors: data.errors };
    } else if (error.request) {
      return { message: 'Unable to connect to the server. Please check your internet connection.' };
    } else {
      return { message: 'An unexpected error occurred. Please try again.' };
    }
  }

  // Auth is fully cookie-based — no token values are stored client-side.
  public getAccessToken(): string | null { return null; }
  public getRefreshToken(): string | null { return null; }
  public setTokens(_accessToken: string, _refreshToken?: string | null): void { /* cookie-only */ }
  public clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  public get instance(): AxiosInstance { return this.client; }
}

const apiClientInstance = new ApiClient();

export const apiClient = {
  instance:        apiClientInstance.instance,
  getAccessToken:  () => apiClientInstance.getAccessToken(),
  getRefreshToken: () => apiClientInstance.getRefreshToken(),
  setTokens:       (accessToken: string, refreshToken?: string | null) => apiClientInstance.setTokens(accessToken, refreshToken),
  clearTokens:     () => apiClientInstance.clearTokens(),
};

export default apiClient.instance;
