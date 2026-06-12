import { apiClient } from './client';

// Ported from RapidTool-Fixture — same backend, same endpoints. Keeps the auth
// surface identical across the RapidTool family.

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  phoneNumber?: string;
  organization?: string;
  jobTitle?: string;
  country?: string;
  industry?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name?: string;
    role?: string;
    emailVerified: boolean;
  };
  accessToken: string;
  refreshToken?: string;
  isFirstLogin?: boolean;
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  };
  verificationToken?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  emailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordResetRequestData {
  email: string;
}

export interface PasswordResetData {
  token: string;
  password: string;
}

export interface VerifyEmailData {
  token: string;
}

export interface ResendVerificationData {
  email: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export const authAPI = {
  async register(data: RegisterData): Promise<RegisterResponse> {
    const response = await apiClient.instance.post<{ success: boolean; message: string; data: RegisterResponse }>('/auth/register', data);
    return response.data.data;
  },

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await apiClient.instance.post<{ success: boolean; message: string; data: AuthResponse }>('/auth/login', data);
    const authData = response.data.data;
    apiClient.setTokens(authData.accessToken, authData.refreshToken || '');
    return authData;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.instance.post('/auth/logout');
    } finally {
      apiClient.clearTokens();
    }
  },

  async refreshToken(): Promise<RefreshResponse> {
    // Rely on HttpOnly cookie
    const response = await apiClient.instance.post<{ success: boolean; data: RefreshResponse }>('/auth/refresh', {});
    const refreshData = response.data.data;
    apiClient.setTokens(refreshData.accessToken, refreshData.refreshToken);
    return refreshData;
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.instance.get<{ success: boolean; data: { user: User } }>('/auth/me');
    return response.data.data.user;
  },

  async requestPasswordReset(data: PasswordResetRequestData): Promise<{ message: string }> {
    const response = await apiClient.instance.post<{ success: boolean; message: string }>('/auth/request-reset', data);
    return { message: response.data.message };
  },

  async resetPassword(data: PasswordResetData): Promise<{ message: string }> {
    const response = await apiClient.instance.post<{ success: boolean; message: string }>('/auth/reset', data);
    return { message: response.data.message };
  },

  async changePassword(data: ChangePasswordData): Promise<{ message: string }> {
    const response = await apiClient.instance.post<{ success: boolean; message: string }>('/auth/change-password', data);
    return { message: response.data.message };
  },

  async verifyEmail(data: VerifyEmailData): Promise<{ message: string }> {
    const response = await apiClient.instance.get<{ success: boolean; message: string }>(`/auth/verify?token=${data.token}`);
    return { message: response.data.message };
  },

  async resendVerification(data: ResendVerificationData): Promise<{ message: string }> {
    const response = await apiClient.instance.post<{ success: boolean; message: string }>('/auth/resend-verification', data);
    return { message: response.data.message };
  },

  // Auth state lives in the store via fetchCurrentUser(); tokens are HttpOnly.
  isAuthenticated(): boolean {
    return false;
  },
};

export default authAPI;
