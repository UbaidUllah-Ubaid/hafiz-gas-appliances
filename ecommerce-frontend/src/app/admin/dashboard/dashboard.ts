import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

interface DashboardStats {
  products: {
    totalProducts: number;
    outOfStock: number;
    lowStock: number;
  };
  orders: {
    totalOrders: number;
    pendingOrders: number;
    totalRevenue: number;
  };
  users: {
    totalUsers: number;
  };
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  totalProducts = 0;
  totalOrders = 0;
  pendingOrders = 0;
  outOfStock = 0;
  lowStock = 0;

  loadingStats = true;
  statsError = '';

  ngOnInit(): void {
    const token = localStorage.getItem('admin_token');

    if (!token) {
      this.router.navigate(['/admin/login']);
      return;
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.http.get<DashboardStats>(
        'https://hafiz-gas-appliances-backend.onrender.com/api/admin/dashboard-stats',
        { headers }
      )
      .subscribe({
        next: (response) => {
  console.log('Stats response:', response);

  this.totalProducts = response.products.totalProducts;
  this.totalOrders = response.orders.totalOrders;
  this.pendingOrders = response.orders.pendingOrders;
  this.outOfStock = response.products.outOfStock;
  this.lowStock = response.products.lowStock;
  this.loadingStats = false;
  this.cdr.detectChanges();

  console.log('Loading state:', this.loadingStats);
},
        error: (error) => {
          console.error('Dashboard stats error:', error);
          this.statsError =
            error.status === 401
              ? 'Session expire ho gaya. Dobara login karo.'
              : 'Dashboard data load nahi ho saka.';
          this.loadingStats = false;
        },
      });
  }

  logout(): void {
    localStorage.removeItem('admin_token');
    this.router.navigate(['/admin/login']);
  }
}