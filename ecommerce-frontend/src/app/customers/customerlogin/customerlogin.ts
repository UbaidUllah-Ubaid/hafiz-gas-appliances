import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { CartServices } from '../../Content/home/cart/cartServices/cart-services';

interface AuthResponse {
  message: string;
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    phone: string;
    role: string;
  };
}

interface ApiMessageResponse {
  message: string;
  resetToken?: string;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'verify-otp' | 'reset';

@Component({
  selector: 'app-customerlogin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './customerlogin.html',
  styleUrl: './customerlogin.css'
})
export class Customerlogin {
  private http = inject(HttpClient);
  private router = inject(Router);
  private cartService = inject(CartServices);
  private cdr = inject(ChangeDetectorRef);

  private readonly apiUrl = 'http://https://hafiz-gas-appliances.onrender.com/api/auth';

  mode: AuthMode = 'login';

  loading = false;
  errorMessage = '';
  successMessage = '';

  name = '';
  email = '';
  phone = '';
  password = '';
  confirmPassword = '';

  otp = '';
  resetToken = '';

  get isRegister(): boolean {
    return this.mode === 'register';
  }

  get isLogin(): boolean {
    return this.mode === 'login';
  }

  submitForm(): void {
    if (this.mode === 'forgot') {
      this.sendResetOtp();
      return;
    }

    if (this.mode === 'verify-otp') {
      this.verifyResetOtp();
      return;
    }

    if (this.mode === 'reset') {
      this.resetPassword();
      return;
    }

    this.loginOrRegister();
  }

  private loginOrRegister(): void {
    this.clearMessages();

    const email = this.email.trim().toLowerCase();

    if (!email || !this.password) {
      this.errorMessage = 'Please enter your email and password.';
      return;
    }

    if (this.isRegister) {
      if (!this.name.trim() || !this.phone.trim()) {
        this.errorMessage = 'Please enter your name and phone number.';
        return;
      }

      if (this.password.length < 8) {
        this.errorMessage = 'Password must be at least 8 characters.';
        return;
      }

      if (this.password !== this.confirmPassword) {
        this.errorMessage = 'Passwords do not match.';
        return;
      }
    }

    const endpoint = this.isRegister ? 'register' : 'login';

    const body = this.isRegister
      ? {
          name: this.name.trim(),
          email,
          phone: this.phone.trim(),
          password: this.password,
          confirmPassword: this.confirmPassword
        }
      : {
          email,
          password: this.password
        };

    this.loading = true;

    this.http.post<AuthResponse>(
      `${this.apiUrl}/${endpoint}`,
      body
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.cdr.detectChanges();

        localStorage.setItem('hafiz_gas_token', response.token);
        localStorage.setItem(
          'hafiz_gas_user',
          JSON.stringify(response.user)
        );

        this.cartService.syncWithServer();

        this.successMessage = this.isRegister
          ? 'Your account has been created successfully!'
          : 'Login successful!';

        this.password = '';
        this.confirmPassword = '';

        const navigationState =
          this.router.getCurrentNavigation()?.extras.state;

        const savedReturnUrl = navigationState?.['returnUrl'];

        const returnUrl =
          typeof savedReturnUrl === 'string' &&
          savedReturnUrl.startsWith('/') &&
          !savedReturnUrl.startsWith('//') &&
          !savedReturnUrl.startsWith('/customerlogin')
            ? savedReturnUrl
            : '/';

        setTimeout(() => {
          this.router.navigateByUrl(returnUrl);
        }, 700);
      },
      error: (error) => {
        this.loading = false;
        this.cdr.detectChanges();
        this.errorMessage =
          error.error?.error ||
          'Unable to connect to the server. Please try again.';
      }
    });
  }

  sendResetOtp(): void {
    this.clearMessages();

    const email = this.email.trim().toLowerCase();

    if (!email) {
      this.errorMessage = 'Please enter your registered email address.';
      return;
    }

    this.loading = true;

    this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/forgot-password`,
      { email }
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.cdr.detectChanges();
        this.mode = 'verify-otp';
        this.successMessage =
          response.message || 'If this email is registered, an OTP has been sent.';
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.error?.error ||
          'Unable to send OTP. Please try again.';
      }
    });
  }

  verifyResetOtp(): void {
    this.clearMessages();

    const otp = this.otp.trim();

    if (!/^\d{6}$/.test(otp)) {
      this.errorMessage = 'Please enter a valid 6-digit OTP.';
      return;
    }

    this.loading = true;

    this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/verify-reset-otp`,
      {
        email: this.email.trim().toLowerCase(),
        otp
      }
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.cdr.detectChanges();

        if (!response.resetToken) {
          this.errorMessage = 'OTP verification failed. Please try again.';
          return;
        }

        this.resetToken = response.resetToken;
        this.mode = 'reset';
        this.successMessage = 'OTP verified. You can now set a new password.';
      },
      error: (error) => {
        this.loading = false;
        this.cdr.detectChanges();
        this.errorMessage =
          error.error?.error ||
          'Invalid or expired OTP. Please try again.';
      }
    });
  }

  resetPassword(): void {
    this.clearMessages();

    if (this.password.length < 8) {
      this.errorMessage = 'Password must be at least 8 characters.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    if (!this.resetToken) {
      this.errorMessage = 'Your reset session has expired. Start again.';
      return;
    }

    this.loading = true;

    this.http.post<ApiMessageResponse>(
      `${this.apiUrl}/reset-password`,
      {
        resetToken: this.resetToken,
        password: this.password
      }
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.mode = 'login';

        this.password = '';
        this.confirmPassword = '';
        this.otp = '';
        this.resetToken = '';

        this.successMessage =
          response.message || 'Password changed successfully. Please log in.';
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.error?.error ||
          'Unable to reset password. Please try again.';
      }
    });
  }

  openForgotPassword(): void {
    this.clearMessages();
    this.mode = 'forgot';
    this.password = '';
    this.confirmPassword = '';
    this.otp = '';
    this.resetToken = '';
  }

  backToLogin(): void {
    this.clearMessages();
    this.mode = 'login';
    this.password = '';
    this.confirmPassword = '';
    this.otp = '';
    this.resetToken = '';
  }

  toggleMode(): void {
    this.clearMessages();

    this.mode = this.isRegister ? 'login' : 'register';

    this.password = '';
    this.confirmPassword = '';
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}