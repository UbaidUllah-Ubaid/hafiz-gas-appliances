


import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface LoginResponse {
  token?: string;
  data?: {
    token?: string;
  };
  message?: string;
}

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.css',
})
export class AdminLogin {
  private http = inject(HttpClient);
  private router = inject(Router);

  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  loginError = '';
isLoggingIn = false;

  login(): void {
    this.errorMessage = '';

    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Email aur password dono enter karo.';
      return;
    }

    this.loading = true;

    this.http.post<LoginResponse>(
      'http://https://hafiz-gas-appliances.onrender.com/api/auth/login',
      {
        email: this.email.trim(),
        password: this.password,
      }
    ).subscribe({
      next: (response) => {
        const token = response.token ?? response.data?.token;

        if (!token) {
          this.errorMessage = 'Login response mein token nahi mila.';
          this.loading = false;
          return;
        }

        localStorage.setItem('hafiz_gas_token', token);
localStorage.setItem('admin_token', token);
this.loading = false;
        this.router.navigate(['/admin/dashboard']);
      },
      error: (err) => {
  this.isLoggingIn = false;

  if (err.status === 401) {
    this.loginError = 'Email ya password ghalat hai.';
  } else if (err.status === 0) {
    this.loginError = 'Backend se connection nahi ho raha.';
  } else if (err.status === 404) {
    this.loginError = 'Login API nahi mili.';
  } else {
    this.loginError =
      err.error?.error ||
      err.error?.message ||
      'Login nahi ho saka. Dobara try karein.';
  }
}
    });
  }

  
}