import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  created_at?: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private readonly API_URL = 'http://localhost:3000/api/auth';

  profile: UserProfile = {
    id: 0,
    name: '',
    email: '',
    phone: '',
    role: 'user'
  };

  editForm = {
    name: '',
    phone: ''
  };

  loading = true;
  saving = false;
  editing = false;
  errorMessage = '';
  successMessage = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('hafiz_gas_token');

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  loadProfile(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr .detectChanges();

    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) {
      this.loading = false;
      this.errorMessage = 'Please login to view your profile.';
      this.cdr.detectChanges();
      return;
    }

    this.http.get<{ user: UserProfile }>(
      `${this.API_URL}/me`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (response) => {
        this.profile = response.user;
        this.editForm = {
          name: response.user.name,
          phone: response.user.phone || ''
        };
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.error?.error || 'Unable to load your profile.';
        this.cdr.detectChanges();
      }
    });
  }

  startEditing(): void {
    this.editForm = {
      name: this.profile.name,
      phone: this.profile.phone || ''
    };

    this.editing = true;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelEditing(): void {
    this.editing = false;
    this.editForm = {
      name: this.profile.name,
      phone: this.profile.phone || ''
    };
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  saveProfile(): void {
    const name = this.editForm.name.trim();
    const phone = this.editForm.phone.trim();

    if (!name || name.length > 100) {
      this.errorMessage = 'Please enter a valid name.';
      return;
    }

    if (!phone || phone.length > 30) {
      this.errorMessage = 'Please enter a valid phone number.';
      this.cdr.detectChanges();
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    

    this.http.patch<{ message: string; user: UserProfile }>(
      `${this.API_URL}/me`,
      { name, phone },
      { headers: this.getHeaders() }
    ).subscribe({
      next: (response) => {
        this.profile = response.user;
        this.editForm = { name, phone };
        this.editing = false;
        this.saving = false;
        this.successMessage = 'Profile updated successfully.';

        localStorage.setItem(
          'hafiz_gas_user',
          JSON.stringify(response.user)
        );
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage =
          error.error?.error || 'Unable to update profile.';
        this.cdr.detectChanges();
      }
    });
  }

  get initials(): string {
    return this.profile.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }
}